import type { KVNamespace } from "@cloudflare/workers-types";
import type { KeyStore } from "./KeyStore";

/** Cloudflare KV rejects expirations less than 60 seconds away. */
export const KV_MIN_TTL_SECONDS = 60;
/** Cloudflare KV accepts at most one write a second to the same key. */
export const KV_MIN_WRITE_INTERVAL_MS = 1000;
const MAX_RATE_LIMIT_RETRIES = 4;
/** Idle keys are forgotten once this many are tracked, after their write interval has passed. */
const MAX_TRACKED_KEYS = 1000;

const putOptions = (expiresAt?: number) =>
  expiresAt
    ? {
        expirationTtl: Math.max(KV_MIN_TTL_SECONDS, Math.ceil((expiresAt - Date.now()) / 1000)),
      }
    : undefined;

const isRateLimited = (error: unknown) => error instanceof Error && /\b429\b/.test(error.message);

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type Write = { type: "put"; value: string; expiresAt?: number } | { type: "delete" };
type Waiter = { resolve: () => void; reject: (error: unknown) => void };
interface KeyWrites {
  next?: Write;
  waiters: Waiter[];
  lastWriteAt: number;
  draining: boolean;
}

/**
 * Writes each key at most once per interval. A key's latest write replaces any it hasn't sent yet,
 * so a burst of writes to one key sends its last value (or deletion) and every caller in the burst
 * settles when that is stored. Rate-limited writes are retried unless a newer write replaces them.
 */
class KVWriteCoalescer {
  private keys = new Map<string, KeyWrites>();

  constructor(
    private readonly kv: KVNamespace,
    private readonly minWriteIntervalMs: number,
  ) {}

  write(key: string, write: Write): Promise<void> {
    let state = this.keys.get(key);
    if (!state) {
      this.forgetIdleKeys();
      state = { waiters: [], lastWriteAt: Number.NEGATIVE_INFINITY, draining: false };
      this.keys.set(key, state);
    }
    state.next = write;
    const settled = new Promise<void>((resolve, reject) => state.waiters.push({ resolve, reject }));
    if (!state.draining) {
      state.draining = true;
      void this.drain(key, state);
    }
    return settled;
  }

  private async drain(key: string, state: KeyWrites) {
    let retries = 0;
    while (state.next) {
      const wait = state.lastWriteAt + this.minWriteIntervalMs * 2 ** retries - Date.now();
      if (wait > 0) await sleep(wait);
      const write = state.next;
      const waiters = state.waiters;
      state.next = undefined;
      state.waiters = [];
      try {
        if (write.type === "put") await this.kv.put(key, write.value, putOptions(write.expiresAt));
        else await this.kv.delete(key);
        state.lastWriteAt = Date.now();
        retries = 0;
        for (const waiter of waiters) waiter.resolve();
      } catch (error) {
        state.lastWriteAt = Date.now();
        if (state.next) {
          // A newer write decides what the key holds; its callers' and these settle with it.
          state.waiters.unshift(...waiters);
          retries = 0;
        } else if (isRateLimited(error) && retries < MAX_RATE_LIMIT_RETRIES) {
          retries++;
          state.next = write;
          state.waiters = waiters;
        } else {
          retries = 0;
          for (const waiter of waiters) waiter.reject(error);
        }
      }
    }
    state.draining = false;
  }

  private forgetIdleKeys() {
    if (this.keys.size < MAX_TRACKED_KEYS) return;
    const idleBefore = Date.now() - this.minWriteIntervalMs;
    for (const [key, state] of this.keys) if (!state.draining && state.lastWriteAt <= idleBefore) this.keys.delete(key);
  }
}

const sharedCoalescers = new WeakMap<object, WeakMap<KVNamespace, KVWriteCoalescer>>();

export interface KVKeyStoreOptions {
  /**
   * Stores created with the same scope and namespace coalesce their writes together. Use an object
   * that lives as long as the writers that should share it, such as a Durable Object's state; a
   * request's context limits it to that request. Without one, each store coalesces its own.
   */
  scope?: object;
  /** The least time between writes to one key; KV's limit by default. */
  minWriteIntervalMs?: number;
}

export class KVKeyStore implements KeyStore {
  private readonly writes: KVWriteCoalescer;

  constructor(
    private readonly kv: KVNamespace,
    options: KVKeyStoreOptions = {},
  ) {
    const interval = options.minWriteIntervalMs ?? KV_MIN_WRITE_INTERVAL_MS;
    const { scope } = options;
    if (!scope) {
      this.writes = new KVWriteCoalescer(kv, interval);
      return;
    }
    let byNamespace = sharedCoalescers.get(scope);
    if (!byNamespace) {
      byNamespace = new WeakMap();
      sharedCoalescers.set(scope, byNamespace);
    }
    let writes = byNamespace.get(kv);
    if (!writes) {
      writes = new KVWriteCoalescer(kv, interval);
      byNamespace.set(kv, writes);
    }
    this.writes = writes;
  }

  async get<T>(key: string): Promise<T | null> {
    const result = await this.kv.get(key, "json");
    if (!result) return null;
    return result as T;
  }

  set<T>(key: string, value: T, expiresAt?: number): Promise<void> {
    return this.writes.write(key, { type: "put", value: JSON.stringify(value), expiresAt });
  }

  delete(key: string): Promise<void> {
    return this.writes.write(key, { type: "delete" });
  }

  async getMany<T>(keys: string[]): Promise<(T | null)[]> {
    if (!keys.length) return [];
    // KV's Workers binding reads one key per call.
    const results = await Promise.all(keys.map((key) => this.kv.get(key, "json")));
    return results.map((r) => (r ? (r as T) : null));
  }

  async setMany<T>(entries: { key: string; value: T; expiresAt?: number }[]): Promise<void> {
    await Promise.all(entries.map(({ key, value, expiresAt }) => this.set(key, value, expiresAt)));
  }

  async deleteMany(keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => this.delete(key)));
  }
}

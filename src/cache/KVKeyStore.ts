import type { KVNamespace } from "@cloudflare/workers-types";
import type { KeyStore } from "./KeyStore";

/** Cloudflare KV rejects expirations less than 60 seconds away. */
export const KV_MIN_TTL_SECONDS = 60;
/** Cloudflare KV rejects a second write to a key within a second; a rejected write waits this long. */
export const KV_RATE_LIMIT_BACKOFF_MS = 1000;
const MAX_RATE_LIMIT_RETRIES = 4;

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
}

/**
 * Sends each key's writes one at a time, in order, each as soon as the one before it is stored, so a
 * key's newest value or deletion reaches KV without waiting: an update is how most cached values
 * are invalidated. Writes that arrive while one is in flight replace each other, so a burst stores
 * its first and last values and every caller settles once its value, or a newer one, is stored.
 * KV rejects a second write to a key within a second; a rejected write backs off, doubling each
 * time, and then sends whichever write is newest.
 */
class KVWriteCoalescer {
  private keys = new Map<string, KeyWrites>();

  constructor(
    private readonly kv: KVNamespace,
    private readonly rateLimitBackoffMs: number,
  ) {}

  write(key: string, write: Write): Promise<void> {
    const queued = this.keys.get(key);
    const state = queued ?? { waiters: [] };
    state.next = write;
    const settled = new Promise<void>((resolve, reject) => state.waiters.push({ resolve, reject }));
    if (!queued) {
      this.keys.set(key, state);
      void this.drain(key, state);
    }
    return settled;
  }

  private async drain(key: string, state: KeyWrites) {
    let retries = 0;
    while (state.next) {
      const write = state.next;
      const waiters = state.waiters;
      state.next = undefined;
      state.waiters = [];
      try {
        if (write.type === "put") await this.kv.put(key, write.value, putOptions(write.expiresAt));
        else await this.kv.delete(key);
        retries = 0;
        for (const waiter of waiters) waiter.resolve();
      } catch (error) {
        if (isRateLimited(error) && retries < MAX_RATE_LIMIT_RETRIES) {
          await sleep(this.rateLimitBackoffMs * 2 ** retries++);
          // A write that arrived meanwhile decides what the key holds; these callers settle with it.
          state.next ??= write;
          state.waiters.unshift(...waiters);
        } else if (state.next) {
          retries = 0;
          state.waiters.unshift(...waiters);
        } else {
          retries = 0;
          for (const waiter of waiters) waiter.reject(error);
        }
      }
    }
    this.keys.delete(key);
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
  /** How long a rate-limited write first waits before it is retried; KV's one second by default. */
  rateLimitBackoffMs?: number;
}

export class KVKeyStore implements KeyStore {
  private readonly writes: KVWriteCoalescer;

  constructor(
    private readonly kv: KVNamespace,
    options: KVKeyStoreOptions = {},
  ) {
    const backoff = options.rateLimitBackoffMs ?? KV_RATE_LIMIT_BACKOFF_MS;
    const { scope } = options;
    if (!scope) {
      this.writes = new KVWriteCoalescer(kv, backoff);
      return;
    }
    let byNamespace = sharedCoalescers.get(scope);
    if (!byNamespace) {
      byNamespace = new WeakMap();
      sharedCoalescers.set(scope, byNamespace);
    }
    let writes = byNamespace.get(kv);
    if (!writes) {
      writes = new KVWriteCoalescer(kv, backoff);
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

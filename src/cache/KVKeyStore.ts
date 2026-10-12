import type { KVNamespace } from "@cloudflare/workers-types";
import type { KeyStore } from "./KeyStore";

/** Cloudflare KV rejects expirations less than 60 seconds away. */
export const KV_MIN_TTL_SECONDS = 60;

const putOptions = (expiresAt?: number) =>
  expiresAt
    ? {
        expirationTtl: Math.max(KV_MIN_TTL_SECONDS, Math.ceil((expiresAt - Date.now()) / 1000)),
      }
    : undefined;

export class KVKeyStore implements KeyStore {
  constructor(private readonly kv: KVNamespace) {}

  async get<T>(key: string): Promise<T | null> {
    const result = await this.kv.get(key, "json");
    if (!result) return null;
    return result as T;
  }

  async set<T>(key: string, value: T, expiresAt?: number): Promise<void> {
    await this.kv.put(key, JSON.stringify(value), putOptions(expiresAt));
  }

  async delete(key: string): Promise<void> {
    await this.kv.delete(key);
  }

  async getMany<T>(keys: string[]): Promise<(T | null)[]> {
    if (!keys.length) return [];
    // Cloudflare KV supports batch get for up to 100 keys? No wait, standard REST API does not.
    // Worker types don't show getMany or similar.
    // However, parallel gets are fine.
    const results = await Promise.all(keys.map((key) => this.kv.get(key, "json")));
    return results.map((r) => (r ? (r as T) : null));
  }

  async setMany<T>(entries: { key: string; value: T; expiresAt?: number }[]): Promise<void> {
    if (!entries.length) return;
    await Promise.all(
      entries.map(({ key, value, expiresAt }) => this.kv.put(key, JSON.stringify(value), putOptions(expiresAt))),
    );
  }

  async deleteMany(keys: string[]): Promise<void> {
    if (!keys.length) return;
    await Promise.all(keys.map((key) => this.kv.delete(key)));
  }
}

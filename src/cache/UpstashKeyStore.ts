import type { Redis } from "@upstash/redis";
import type { CacheSetItem, KeyStore } from "./KeyStore";

export class UpstashKeyStore implements KeyStore {
  constructor(private readonly redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    return await this.redis.get<T>(key);
  }

  async set<T>(key: string, value: T, expiresAt?: number): Promise<void> {
    if (expiresAt) {
      const ttlSeconds = Math.floor((expiresAt - Date.now()) / 1000);
      if (ttlSeconds > 0) {
        await this.redis.set(key, value, { ex: ttlSeconds });
      }
    } else {
      await this.redis.set(key, value);
    }
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async getMany<T>(keys: string[]): Promise<(T | null)[]> {
    if (!keys.length) return [];
    const results = await this.redis.mget<T[]>(...keys);
    return results;
  }

  async setMany<T>(entries: CacheSetItem<T>[]): Promise<void> {
    if (!entries.length) return;
    const pipeline = this.redis.pipeline();
    const now = Date.now();
    for (const { key, value, expiresAt } of entries) {
      if (expiresAt) {
        const ttlSeconds = Math.floor((expiresAt - now) / 1000);
        if (ttlSeconds > 0) {
          pipeline.set(key, value, { ex: ttlSeconds });
        }
      } else {
        pipeline.set(key, value);
      }
    }
    await pipeline.exec();
  }

  async deleteMany(keys: string[]): Promise<void> {
    if (!keys.length) return;
    await this.redis.del(...keys);
  }
}

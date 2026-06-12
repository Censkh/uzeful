import type { CacheSetItem, KeyStore } from "../cache/KeyStore";

interface CloudflareCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
  delete(request: Request): Promise<boolean>;
}

interface CloudflareCacheKeyStoreOptions {
  cache?: CloudflareCache;
  baseUrl?: string;
}

const DEFAULT_BASE_URL = "https://uze-cache.internal";

export class CloudflareCacheKeyStore implements KeyStore {
  private readonly cache: CloudflareCache;
  private readonly baseUrl: string;

  constructor(options: CloudflareCacheKeyStoreOptions = {}) {
    const globalCaches = (globalThis as unknown as { caches?: { default?: CloudflareCache } }).caches;
    const cache = options.cache ?? globalCaches?.default;
    if (!cache) {
      throw new Error("Cloudflare Cache API is not available");
    }

    this.cache = cache;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  }

  async get<T>(key: string): Promise<T | null> {
    const response = await this.cache.match(this.toRequest(key));
    if (!response) {
      return null;
    }

    try {
      return (await response.json()) as T;
    } catch {
      await this.delete(key);
      return null;
    }
  }

  async set<T>(key: string, value: T, expiresAt?: number): Promise<void> {
    const response = new Response(JSON.stringify(value), {
      headers: this.buildHeaders(expiresAt),
    });

    await this.cache.put(this.toRequest(key), response);
  }

  async delete(key: string): Promise<void> {
    await this.cache.delete(this.toRequest(key));
  }

  async getMany<T>(keys: string[]): Promise<(T | null)[]> {
    return await Promise.all(keys.map((key) => this.get<T>(key)));
  }

  async setMany<T>(entries: CacheSetItem<T>[]): Promise<void> {
    await Promise.all(entries.map((entry) => this.set(entry.key, entry.value, entry.expiresAt)));
  }

  async deleteMany(keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => this.delete(key)));
  }

  private toRequest(key: string): Request {
    return new Request(`${this.baseUrl}/${encodeURIComponent(key)}`, {
      method: "GET",
    });
  }

  private buildHeaders(expiresAt?: number): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (expiresAt) {
      const ttlSeconds = Math.floor((expiresAt - Date.now()) / 1000);
      if (ttlSeconds <= 0) {
        headers["Cache-Control"] = "max-age=0";
        return headers;
      }
      headers["Cache-Control"] = `public, max-age=${ttlSeconds}`;
    }

    return headers;
  }
}

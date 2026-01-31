export interface KeyStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, expiresAt?: number): Promise<void>;
  delete(key: string): Promise<void>;
  getMany<T>(keys: string[]): Promise<(T | null)[]>;
  setMany<T>(entries: CacheSetItem<T>[]): Promise<void>;
  deleteMany(keys: string[]): Promise<void>;
}

export type CacheSetItem<T> = { key: string; value: T; expiresAt?: number };

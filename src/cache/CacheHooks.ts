import { uzeContext } from "../Context";
import { uzeOptions } from "../CreateUzeful";
import { logger } from "../logger";
import { createStateKey, uzeState } from "../State";
import type { CacheSetItem, KeyStore } from "./KeyStore";

export interface SimpleCacheNamespaceOptions {
  id: string;
}

export interface VersionedCacheNamespaceOptions {
  id: string;
}

const SYMBOL_CACHE_NAMESPACE = Symbol("cacheNamespace");

export const createCacheNamespace = <T>(options: SimpleCacheNamespaceOptions): CacheNamespace<T> => {
  const { id } = options;
  return {
    id,
    getId: () => id,
    [SYMBOL_CACHE_NAMESPACE]: true,
  };
};

export const createVersionedCacheNamespace = <T>(options: VersionedCacheNamespaceOptions): CacheNamespace<T> => {
  const { id } = options;
  return {
    id,
    getId: () => {
      const { cache } = uzeOptions();
      const context = uzeContext();
      const version = cache?.getVersion ? cache.getVersion(context) : "1";
      return `${id}:${version}`;
    },
    [SYMBOL_CACHE_NAMESPACE]: true,
  };
};

export interface CacheNamespace<T> {
  [SYMBOL_CACHE_NAMESPACE]: true;
  id: string;
  getId?: () => string;
}

interface CacheItem<T> {
  data: T;
  version: number;
  timestamp: number;
}

const CACHE_ITEM_VERSION = 1;
const ENABLE_CACHE_DEBUG = false;
// Maximum cache lifetime of 1 month in milliseconds
const MAX_CACHE_LIFETIME = 30 * 24 * 60 * 60 * 1000;
const ENFORCE_MAX_CACHE_LIFETIME = false;

const REQUEST_CACHE_KEY = createStateKey<Record<string, Promise<any>>>("request-cache");

export const uzeCacheState = <T>(namespace: CacheNamespace<T>) => {
  const context = uzeContext();
  const { cache } = uzeOptions();
  // Default to local if specific config is missing, though ensureKeyStore is critical for persistence
  const keyPrefix = cache?.getKeyPrefix ? cache.getKeyPrefix(context) : "local";

  const [getRequestCache, setRequestCache] = uzeState(REQUEST_CACHE_KEY);

  const generateCacheKey = (key: string | undefined) => {
    const namespaceId = namespace.getId ? namespace.getId() : namespace.id;
    return `${keyPrefix}:${namespaceId}${key ? `:${key}` : ""}`;
  };

  const KEY_STORE_STATE_KEY = createStateKey<KeyStore>("keyStoreInstance");
  const [getKeyStoreInstance, setKeyStoreInstance] = uzeState(KEY_STORE_STATE_KEY);

  const getKeyStore = async (): Promise<KeyStore | undefined> => {
    const existing = getKeyStoreInstance();
    if (existing) return existing;

    if (!cache?.createKeyStore) return undefined;
    const newStore = await cache.createKeyStore(context);
    setKeyStoreInstance(newStore);
    return newStore;
  };

  const get = async (): Promise<T | undefined | null> => {
    return getItem(undefined);
  };

  const set = async (value: T, expiresAt?: number) => {
    return setItem(undefined, value, expiresAt);
  };

  const getItem = async (key?: string): Promise<T | undefined | null> => {
    const cacheKey = generateCacheKey(key);
    const startNow = Date.now();

    // Try request cache first
    const requestCache = getRequestCache();
    const requestCacheResult = requestCache?.[cacheKey] as Promise<CacheItem<T>> | undefined;
    if (requestCacheResult) {
      if (ENABLE_CACHE_DEBUG) {
        logger().debug("uzeCacheState", "Request cache HIT", {
          key: cacheKey,
          durationMs: Date.now() - startNow,
        });
      }
      return requestCacheResult.then((item) => item.data);
    }

    // Fall back to key store
    const keyStore = await getKeyStore();
    if (!keyStore) {
      return undefined;
    }

    const resultPromise = keyStore.get<CacheItem<T>>(cacheKey);

    // Add to request cache immediately to deduplicate inflight requests
    setRequestCache((prev) => ({
      ...prev,
      [cacheKey]: resultPromise.then((result) => {
        if (!result || result.version !== CACHE_ITEM_VERSION) {
          // Return a dummy object if undefined, so we cache the "miss" for the request duration?
          // No, let's just match the old behavior: undefined result
          // But Promise<CacheItem<T>> expects a CacheItem.
          // We'll filter later.
          return result as unknown as CacheItem<T>;
        }
        return result;
      }),
    }));

    const result = await resultPromise;
    if (ENABLE_CACHE_DEBUG) {
      logger().debug("uzeCacheState", `Key store ${result ? "HIT" : "MISS"}`, {
        key: cacheKey,
        durationMs: Date.now() - startNow,
      });
    }

    if (!result || result.version !== CACHE_ITEM_VERSION) {
      return undefined;
    }

    return (result.data as T) || null;
  };

  const setItem = async (key: string | undefined, value: T, expiresAt?: number) => {
    const cacheKey = generateCacheKey(key);
    const keyStore = await getKeyStore();

    // Enforce maximum cache lifetime
    const now = Date.now();
    const effectiveExpiresAt = ENFORCE_MAX_CACHE_LIFETIME
      ? expiresAt
        ? Math.min(expiresAt, now + MAX_CACHE_LIFETIME)
        : now + MAX_CACHE_LIFETIME
      : expiresAt;

    const cacheItem: CacheItem<T> = { data: value, version: CACHE_ITEM_VERSION, timestamp: now };

    // Update request cache
    setRequestCache((prev) => ({
      ...prev,
      [cacheKey]: Promise.resolve(cacheItem),
    }));

    if (!keyStore) return;

    const howFarInFuture = effectiveExpiresAt ? effectiveExpiresAt - now : undefined;
    if (!howFarInFuture || howFarInFuture > 1000 * 10) {
      await keyStore.set(cacheKey, cacheItem, effectiveExpiresAt);

      if (ENABLE_CACHE_DEBUG) {
        logger().debug("uzeCacheState", "Setting key with expiration", {
          key: cacheKey,
          expiresAt: effectiveExpiresAt ? new Date(effectiveExpiresAt) : undefined,
          durationMs: Date.now() - now,
        });
      }
    } else {
      if (ENABLE_CACHE_DEBUG) {
        logger().debug("uzeCacheState", "Key was close to now - not caching", {
          key: cacheKey,
          expiresAt: effectiveExpiresAt ? new Date(effectiveExpiresAt) : undefined,
        });
      }
    }
  };

  const clearItem = async (key: string | undefined) => {
    const cacheKey = generateCacheKey(key);
    const keyStore = await getKeyStore();

    // Clear from request cache
    setRequestCache((prev) => {
      const { [cacheKey]: _, ...rest } = prev || {};
      return rest;
    });

    if (keyStore) {
      await keyStore.delete(cacheKey);
      if (ENABLE_CACHE_DEBUG) {
        logger().debug("uzeCacheState", "Cleared cache item", { key: cacheKey });
      }
    }
  };

  const getItems = async (keys: string[]): Promise<(T | undefined | null)[]> => {
    if (!keys.length) return [];

    // Naive implementation for now, looping getItems or we can port the full bulk logic if needed.
    // Given step limitations, let's port the bulk logic essentially.

    const cacheKeys = keys.map(generateCacheKey);
    const requestCache = getRequestCache();
    const results: (T | undefined | null)[] = new Array(keys.length).fill(undefined);

    const missingKeys: string[] = [];
    const missingIndexes: number[] = [];

    // Check request cache
    for (let i = 0; i < cacheKeys.length; i++) {
      const cacheKey = cacheKeys[i];
      const requestCacheResult = requestCache?.[cacheKey];
      if (requestCacheResult) {
        const item = await requestCacheResult;
        results[i] = item?.data; // Check version? assuming trusted from same req
      } else {
        missingKeys.push(cacheKey);
        missingIndexes.push(i);
      }
    }

    if (missingKeys.length) {
      const keyStore = await getKeyStore();
      if (keyStore) {
        const storeResults = await keyStore.getMany<CacheItem<T>>(missingKeys);

        // Update request cache and results
        setRequestCache((prev) => {
          const newCache = { ...prev };
          for (let j = 0; j < missingKeys.length; j++) {
            const key = missingKeys[j];
            const idx = missingIndexes[j];
            const result = storeResults[j];

            if (result && result.version === CACHE_ITEM_VERSION) {
              newCache[key] = Promise.resolve(result);
              results[idx] = result.data;
            } else {
              // newCache[key] = Promise.resolve(null); // Optional: cache misses?
            }
          }
          return newCache;
        });
      }
    }

    return results;
  };

  const setItems = async (items: CacheSetItem<T>[]) => {
    if (!items.length) return;

    const now = Date.now();
    const entries: CacheSetItem<CacheItem<T>>[] = items.map((item) => ({
      key: generateCacheKey(item.key),
      value: { data: item.value, version: CACHE_ITEM_VERSION, timestamp: now },
      expiresAt: item.expiresAt,
    }));

    // Update request cache
    setRequestCache((prev) => {
      const next = { ...prev };
      for (const entry of entries) {
        next[entry.key] = Promise.resolve(entry.value);
      }
      return next;
    });

    const keyStore = await getKeyStore();
    if (keyStore) {
      await keyStore.setMany(entries);
    }
  };

  const clearItems = async (keys: string[]) => {
    if (!keys.length) return;
    const cacheKeys = keys.map(generateCacheKey);

    setRequestCache((prev) => {
      const next = { ...prev };
      for (const key of cacheKeys) {
        delete next[key];
      }
      return next;
    });

    const keyStore = await getKeyStore();
    if (keyStore) {
      await keyStore.deleteMany(cacheKeys);
    }
  };

  return { getItem, setItem, clearItem, get, set, getItems, setItems, clearItems } as const;
};

import { uzeContextInternal as uzeContext } from "../Context";
import { uzeOptions } from "../CreateUzeful";
import { logger } from "../logger";
import { createStateKey, uzeRequestState } from "../State";
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
// Maximum cache lifetime of 1 month in milliseconds
const MAX_CACHE_LIFETIME = 30 * 24 * 60 * 60 * 1000;
const ENFORCE_MAX_CACHE_LIFETIME = false;

const REQUEST_CACHE_KEY = createStateKey<Record<string, Promise<any>>>("request-cache");
const KEY_STORE_STATE_KEY = createStateKey<KeyStore>("keyStoreInstance");
const MAX_DEBUG_VALUE_LENGTH = 1000;

export const uzeCacheState = <T>(namespace: CacheNamespace<T>) => {
  const context = uzeContext();
  const { cache, debug } = uzeOptions();
  const debugEnabled = typeof debug === "function" ? debug(context) : !!debug;
  // Default to local if specific config is missing, though ensureKeyStore is critical for persistence
  const keyPrefix = cache?.getKeyPrefix ? cache.getKeyPrefix(context) : "local";

  const [getRequestCache, setRequestCache] = uzeRequestState(REQUEST_CACHE_KEY);

  const generateCacheKey = (key: string | undefined) => {
    const namespaceId = namespace.getId ? namespace.getId() : namespace.id;
    return `${keyPrefix}:${namespaceId}${key ? `:${key}` : ""}`;
  };

  const debugLog = (message: string, data: Record<string, unknown>) => {
    if (!debugEnabled) return;
    logger().debug("uzeCacheState", message, {
      namespace: namespace.id,
      keyPrefix,
      ...data,
    });
  };

  const debugValue = (value: unknown) => {
    if (!debugEnabled) return undefined;
    try {
      const serialized = JSON.stringify(value);
      if (!serialized) return String(value);
      if (serialized.length <= MAX_DEBUG_VALUE_LENGTH) return serialized;
      return `${serialized.slice(0, MAX_DEBUG_VALUE_LENGTH)}…`;
    } catch {
      return String(value);
    }
  };

  const [getKeyStoreInstance, setKeyStoreInstance] = uzeRequestState(KEY_STORE_STATE_KEY);

  const getKeyStore = async (): Promise<KeyStore | undefined> => {
    const existing = getKeyStoreInstance();
    if (existing) {
      debugLog("Key store request cache hit", {});
      return existing;
    }

    if (!cache?.createKeyStore) {
      debugLog("Key store missing", {});
      return undefined;
    }
    const newStore = await cache.createKeyStore(context);
    setKeyStoreInstance(newStore);
    debugLog("Key store created", {
      store: newStore?.constructor?.name,
    });
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
      return requestCacheResult.then((item) => {
        debugLog("Read request cache hit", {
          key: cacheKey,
          value: debugValue(item?.data),
          durationMs: Date.now() - startNow,
        });
        if (!item || item.version !== CACHE_ITEM_VERSION) {
          return undefined;
        }
        return item.data;
      });
    }

    // Fall back to key store
    const keyStore = await getKeyStore();
    if (!keyStore) {
      debugLog("Read skipped without key store", {
        key: cacheKey,
        durationMs: Date.now() - startNow,
      });
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
    debugLog(`Read key store ${result ? "hit" : "miss"}`, {
      key: cacheKey,
      valid: !!result && result.version === CACHE_ITEM_VERSION,
      value: debugValue(result?.data),
      durationMs: Date.now() - startNow,
    });

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

    if (!keyStore) {
      debugLog("Write skipped without key store", {
        key: cacheKey,
        value: debugValue(value),
        durationMs: Date.now() - now,
      });
      return;
    }

    const howFarInFuture = effectiveExpiresAt ? effectiveExpiresAt - now : undefined;
    if (!howFarInFuture || howFarInFuture > 1000 * 10) {
      await keyStore.set(cacheKey, cacheItem, effectiveExpiresAt);

      debugLog("Write key store", {
        key: cacheKey,
        value: debugValue(value),
        expiresAt: effectiveExpiresAt ? new Date(effectiveExpiresAt).toISOString() : undefined,
        durationMs: Date.now() - now,
      });
    } else {
      debugLog("Write skipped due to near expiration", {
        key: cacheKey,
        value: debugValue(value),
        expiresAt: effectiveExpiresAt ? new Date(effectiveExpiresAt).toISOString() : undefined,
        durationMs: Date.now() - now,
      });
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
      debugLog("Delete key store", { key: cacheKey });
    } else {
      debugLog("Delete skipped without key store", { key: cacheKey });
    }
  };

  const getItems = async (keys: string[]): Promise<(T | undefined | null)[]> => {
    if (!keys.length) return [];
    const startNow = Date.now();

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
        const hits = storeResults.filter((result) => result && result.version === CACHE_ITEM_VERSION).length;
        debugLog("Read many key store", {
          requested: keys.length,
          missing: missingKeys.length,
          hits,
          values: debugValue(storeResults.map((result) => result?.data)),
          durationMs: Date.now() - startNow,
        });

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
      } else {
        debugLog("Read many skipped without key store", {
          requested: keys.length,
          missing: missingKeys.length,
          durationMs: Date.now() - startNow,
        });
      }
    } else {
      debugLog("Read many request cache hit", {
        requested: keys.length,
        values: debugValue(results),
        durationMs: Date.now() - startNow,
      });
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
      debugLog("Write many key store", {
        count: entries.length,
        values: debugValue(items.map((item) => item.value)),
        durationMs: Date.now() - now,
      });
    } else {
      debugLog("Write many skipped without key store", {
        count: entries.length,
        values: debugValue(items.map((item) => item.value)),
        durationMs: Date.now() - now,
      });
    }
  };

  const clearItems = async (keys: string[]) => {
    if (!keys.length) return;
    const startNow = Date.now();
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
      debugLog("Delete many key store", {
        count: cacheKeys.length,
        durationMs: Date.now() - startNow,
      });
    } else {
      debugLog("Delete many skipped without key store", {
        count: cacheKeys.length,
        durationMs: Date.now() - startNow,
      });
    }
  };

  return { getItem, setItem, clearItem, get, set, getItems, setItems, clearItems } as const;
};

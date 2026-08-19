import { addToCurrentUzeWaitUntil, areUzeWaitUntilsClosed, uzeContextInternal as uzeContext } from "../Context";
import { createStateKey, uzeRequestState } from "../State";
import { uzeOptions } from "../UzefulApp";
import type { CacheSetItem, KeyStore } from "./KeyStore";

export interface SimpleCacheNamespaceOptions {
  id: string;
  type: CacheStoreType;
}

export interface VersionedCacheNamespaceOptions {
  id: string;
  type: CacheStoreType;
}

export type CacheStoreType = "edge" | "replicated";

const SYMBOL_CACHE_NAMESPACE = Symbol("cacheNamespace");

export const createCacheNamespace = <T>(options: SimpleCacheNamespaceOptions): CacheNamespace<T> => {
  const { id, type } = options;
  return {
    id,
    type,
    getId: () => id,
    [SYMBOL_CACHE_NAMESPACE]: true,
  };
};

export const createVersionedCacheNamespace = <T>(options: VersionedCacheNamespaceOptions): CacheNamespace<T> => {
  const { id, type } = options;
  return {
    id,
    type,
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
  type: CacheStoreType;
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
const KEY_STORE_STATE_KEY = createStateKey<Partial<Record<CacheStoreType, KeyStore>>>("keyStoreInstances");
interface BackgroundCacheWriteBatch {
  entries: Map<string, CacheSetItem<unknown>>;
  flushPromise?: Promise<void>;
}
const BACKGROUND_CACHE_WRITE_BATCH_KEY =
  createStateKey<Partial<Record<CacheStoreType, BackgroundCacheWriteBatch>>>("backgroundCacheWriteBatches");
const MAX_DEBUG_VALUE_LENGTH = 1000;

export const uzeCacheState = <T>(namespace: CacheNamespace<T>) => {
  const context = uzeContext();
  const { cache } = uzeOptions();
  // Default to local if specific config is missing, though ensureKeyStore is critical for persistence
  const keyPrefix = cache?.getKeyPrefix ? cache.getKeyPrefix(context) : "local";

  const [getRequestCache, setRequestCache] = uzeRequestState(REQUEST_CACHE_KEY);

  const generateCacheKey = (key: string | undefined) => {
    const namespaceId = namespace.getId ? namespace.getId() : namespace.id;
    return `${namespace.type}:${keyPrefix}:${namespaceId}${key ? `:${key}` : ""}`;
  };

  const debugLog = (_message: string, _data: Record<string, unknown>) => {};

  const debugValue = (value: unknown) => {
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
  const [getBackgroundCacheWriteBatches, setBackgroundCacheWriteBatches] = uzeRequestState(
    BACKGROUND_CACHE_WRITE_BATCH_KEY,
  );

  const getKeyStore = async (): Promise<KeyStore> => {
    const existing = getKeyStoreInstance()?.[namespace.type];
    if (existing) {
      debugLog("Key store request cache hit", {});
      return existing;
    }

    const createKeyStore = cache?.stores?.[namespace.type];
    if (!createKeyStore) {
      throw new Error(`Cache store '${namespace.type}' is not configured`);
    }
    const newStore = await createKeyStore(context);
    setKeyStoreInstance((previous) => ({
      ...previous,
      [namespace.type]: newStore,
    }));
    debugLog("Key store created", {
      store: newStore?.constructor?.name,
    });
    return newStore;
  };

  const scheduleBackgroundCacheWrites = (entries: CacheSetItem<unknown>[]) => {
    if (!entries.length) return;

    let batch = getBackgroundCacheWriteBatches()?.[namespace.type];
    if (!batch) {
      batch = { entries: new Map() };
      setBackgroundCacheWriteBatches((previous) => ({
        ...previous,
        [namespace.type]: batch,
      }));
    }

    for (const entry of entries) {
      batch.entries.set(entry.key, entry);
    }

    if (batch.flushPromise) return;

    const flushPromise = Promise.resolve().then(async () => {
      const keyStore = await getKeyStore();
      while (batch.entries.size > 0) {
        const pendingEntries = Array.from(batch.entries.values());
        batch.entries.clear();
        await keyStore.setMany(pendingEntries);
      }
    });
    batch.flushPromise = flushPromise.finally(() => {
      batch.flushPromise = undefined;
    });
    if (areUzeWaitUntilsClosed()) {
      addToCurrentUzeWaitUntil(batch.flushPromise);
    } else {
      context.waitUntil(batch.flushPromise, "Cache set items");
    }
  };

  const get = async (): Promise<T | undefined | null> => {
    return getItem(undefined);
  };

  const set = async (value: T, expiresAt?: number) => {
    return setItem(undefined, value, expiresAt);
  };

  const setInBackground = (value: T, expiresAt?: number) => {
    setItemInBackground(undefined, value, expiresAt);
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

    // Read from the configured persistent store.
    const keyStore = await getKeyStore();

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

    const howFarInFuture = effectiveExpiresAt ? effectiveExpiresAt - now : undefined;
    if (!howFarInFuture || howFarInFuture > 1000 * 10) {
      const keyStore = await getKeyStore();
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

  const setItemInBackground = (key: string | undefined, value: T, expiresAt?: number) => {
    const cacheKey = generateCacheKey(key);
    const now = Date.now();
    const effectiveExpiresAt = ENFORCE_MAX_CACHE_LIFETIME
      ? expiresAt
        ? Math.min(expiresAt, now + MAX_CACHE_LIFETIME)
        : now + MAX_CACHE_LIFETIME
      : expiresAt;
    const cacheItem: CacheItem<T> = { data: value, version: CACHE_ITEM_VERSION, timestamp: now };

    setRequestCache((previous) => ({
      ...previous,
      [cacheKey]: Promise.resolve(cacheItem),
    }));

    const howFarInFuture = effectiveExpiresAt ? effectiveExpiresAt - now : undefined;
    if (!howFarInFuture || howFarInFuture > 1000 * 10) {
      scheduleBackgroundCacheWrites([{ key: cacheKey, value: cacheItem, expiresAt: effectiveExpiresAt }]);
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

    await keyStore.delete(cacheKey);
    debugLog("Delete key store", { key: cacheKey });
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
          }
        }
        return newCache;
      });
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
    await keyStore.setMany(entries);
    debugLog("Write many key store", {
      count: entries.length,
      values: debugValue(items.map((item) => item.value)),
      durationMs: Date.now() - now,
    });
  };

  const setItemsInBackground = (items: CacheSetItem<T>[]) => {
    if (!items.length) return;

    const now = Date.now();
    const entries: CacheSetItem<CacheItem<T>>[] = items.map((item) => ({
      key: generateCacheKey(item.key),
      value: { data: item.value, version: CACHE_ITEM_VERSION, timestamp: now },
      expiresAt: item.expiresAt,
    }));

    setRequestCache((previous) => {
      const next = { ...previous };
      for (const entry of entries) {
        next[entry.key] = Promise.resolve(entry.value);
      }
      return next;
    });

    scheduleBackgroundCacheWrites(entries);
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
    await keyStore.deleteMany(cacheKeys);
    debugLog("Delete many key store", {
      count: cacheKeys.length,
      durationMs: Date.now() - startNow,
    });
  };

  return {
    getItem,
    setItem,
    setItemInBackground,
    clearItem,
    get,
    set,
    setInBackground,
    getItems,
    setItems,
    setItemsInBackground,
    clearItems,
  } as const;
};

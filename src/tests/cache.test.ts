import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { UzefulApp } from "..";
import { createCacheNamespace, createVersionedCacheNamespace, uzeCacheState } from "../cache";
import { InMemoryKeyStore } from "../cache/InMemoryKeyStore";
import { KVKeyStore } from "../cache/KVKeyStore";
import { UpstashKeyStore } from "../cache/UpstashKeyStore";

afterEach(() => {
  mock.restore();
});

describe("cache", () => {
  test("stores, reads, bulk reads, and clears values through configured key store", async () => {
    const store = new InMemoryKeyStore();
    const namespace = createCacheNamespace<{ name: string }>({ id: "users", type: "edge" });
    const uze = new UzefulApp<Record<string, unknown>, Request>({
      cache: {
        stores: { edge: async () => store },
        getKeyPrefix: () => "tenant-a",
        getVersion: () => "v1",
      },
    });

    await uze.execute(
      { request: new Request("https://example.com/"), env: {}, waitUntil: () => {}, rawContext: {} },
      async () => {
        const cache = uzeCacheState(namespace);

        expect(await cache.getItem("1")).toBeUndefined();
        await cache.setItem("1", { name: "Ada" });
        await cache.setItems([
          { key: "2", value: { name: "Grace" } },
          { key: "3", value: { name: "Linus" } },
        ]);

        expect(await cache.getItem("1")).toEqual({ name: "Ada" });
        expect(await cache.getItems(["1", "2", "missing", "3"])).toEqual([
          { name: "Ada" },
          { name: "Grace" },
          undefined,
          { name: "Linus" },
        ]);

        await cache.clearItem("1");
        await cache.clearItems(["2"]);

        expect(await cache.getItems(["1", "2", "3"])).toEqual([undefined, undefined, { name: "Linus" }]);
      },
    );
  });

  test("uses cache versions in versioned namespaces", async () => {
    const store = new InMemoryKeyStore();
    const namespace = createVersionedCacheNamespace<string>({ id: "settings", type: "edge" });
    const uze = new UzefulApp<Record<string, unknown>, Request>({
      cache: {
        stores: { edge: async () => store },
        getKeyPrefix: () => "app",
        getVersion: () => "v2",
      },
    });

    await uze.execute(
      { request: new Request("https://example.com/"), env: {}, waitUntil: () => {}, rawContext: {} },
      async () => {
        const cache = uzeCacheState(namespace);
        await cache.set("enabled");
      },
    );

    expect(await store.get("edge:app:settings:v2")).toMatchObject({ data: "enabled" });
  });

  test("supports background cache writes without changing awaited setter semantics", async () => {
    const values = new Map<string, unknown>();
    const pendingWrites = new Map<string, () => void>();
    let resolveBulkWrite!: () => void;
    const bulkWriteStarted = new Promise<void>((resolve) => {
      resolveBulkWrite = resolve;
    });
    let releaseBulkWrite!: () => void;
    const bulkWriteReleased = new Promise<void>((resolve) => {
      releaseBulkWrite = resolve;
    });
    const bulkWrites: string[][] = [];
    const waitUntilPromises: Promise<unknown>[] = [];
    const store = {
      get: async (key: string) => values.get(key) ?? null,
      set: async (key: string, value: unknown) => {
        await new Promise<void>((resolve) => pendingWrites.set(key, resolve));
        values.set(key, value);
      },
      delete: async (key: string) => {
        values.delete(key);
      },
      getMany: async (keys: string[]) => keys.map((key) => values.get(key) ?? null),
      setMany: async (entries: { key: string; value: unknown }[]) => {
        bulkWrites.push(entries.map((entry) => entry.key));
        resolveBulkWrite();
        await bulkWriteReleased;
        for (const entry of entries) {
          values.set(entry.key, entry.value);
        }
      },
      deleteMany: async () => {},
    };
    const namespace = createCacheNamespace<string>({ id: "state", type: "replicated" });
    const otherNamespace = createCacheNamespace<string>({ id: "other", type: "replicated" });
    const uze = new UzefulApp<Record<string, unknown>, Request>({
      cache: {
        stores: { replicated: async () => store },
        getKeyPrefix: () => "app",
        getVersion: () => "v1",
      },
    });

    await uze.execute(
      {
        request: new Request("https://example.com/"),
        env: {},
        waitUntil: (promise) => waitUntilPromises.push(promise),
        rawContext: {},
      },
      async () => {
        const cache = uzeCacheState(namespace);
        cache.setItemInBackground("background", "value");
        cache.setItemsInBackground([
          { key: "bulk-1", value: "one" },
          { key: "bulk-2", value: "two" },
        ]);
        const otherCache = uzeCacheState(otherNamespace);
        otherCache.setItemInBackground("background", "other value");

        expect(await cache.getItem("background")).toBe("value");
        expect(await cache.getItem("bulk-1")).toBe("one");
        expect(await otherCache.getItem("background")).toBe("other value");
        expect(waitUntilPromises).toHaveLength(1);
        expect(values.has("replicated:app:state:background")).toBe(false);

        await bulkWriteStarted;
        expect(bulkWrites).toEqual([
          [
            "replicated:app:state:background",
            "replicated:app:state:bulk-1",
            "replicated:app:state:bulk-2",
            "replicated:app:other:background",
          ],
        ]);
        releaseBulkWrite();
        await waitUntilPromises[0];
        expect(values.has("replicated:app:state:background")).toBe(true);

        let awaitedWriteCompleted = false;
        const awaitedWrite = cache.setItem("awaited", "value").then(() => {
          awaitedWriteCompleted = true;
        });
        await Promise.resolve();
        expect(awaitedWriteCompleted).toBe(false);

        pendingWrites.get("replicated:app:state:awaited")?.();
        await awaitedWrite;
        expect(awaitedWriteCompleted).toBe(true);
      },
    );
  });

  test("uses the configured store for each namespace type", async () => {
    const edgeStore = new InMemoryKeyStore();
    const replicatedStore = new InMemoryKeyStore();
    const edgeNamespace = createCacheNamespace<string>({ id: "state", type: "edge" });
    const replicatedNamespace = createCacheNamespace<string>({ id: "state", type: "replicated" });
    const uze = new UzefulApp<Record<string, unknown>, Request>({
      cache: {
        stores: {
          edge: async () => edgeStore,
          replicated: async () => replicatedStore,
        },
        getKeyPrefix: () => "app",
        getVersion: () => "v1",
      },
    });

    await uze.execute(
      { request: new Request("https://example.com/"), env: {}, waitUntil: () => {}, rawContext: {} },
      async () => {
        await uzeCacheState(edgeNamespace).set("edge value");
        await uzeCacheState(replicatedNamespace).set("replicated value");
      },
    );

    expect(await edgeStore.get("edge:app:state")).toMatchObject({ data: "edge value" });
    expect(await replicatedStore.get("replicated:app:state")).toMatchObject({
      data: "replicated value",
    });
  });

  test("rejects namespaces whose store type is not configured", async () => {
    const namespace = createCacheNamespace<string>({ id: "settings", type: "replicated" });
    const uze = new UzefulApp<Record<string, unknown>, Request>({
      cache: {
        stores: { edge: async () => new InMemoryKeyStore() },
        getKeyPrefix: () => "app",
        getVersion: () => "v1",
      },
    });

    await expect(
      uze.execute(
        { request: new Request("https://example.com/"), env: {}, waitUntil: () => {}, rawContext: {} },
        async () => uzeCacheState(namespace).get(),
      ),
    ).rejects.toThrow("Cache store 'replicated' is not configured");
  });

  test("InMemoryKeyStore expires items", async () => {
    const store = new InMemoryKeyStore();

    await store.set("expired", "value", Date.now() - 1);
    await store.set("fresh", "value", Date.now() + 60_000);

    expect(await store.get("expired")).toBeNull();
    expect(await store.get("fresh")).toBe("value");
  });

  test("KVKeyStore serializes values and expiration", async () => {
    const calls: any[] = [];
    const kv = {
      get: mock(async () => ({ ok: true })),
      put: mock(async (...args: any[]) => calls.push(args)),
      delete: mock(async (...args: any[]) => calls.push(["delete", ...args])),
    };
    const store = new KVKeyStore(kv as any);

    expect(await store.get("key")).toEqual({ ok: true });
    await store.set("key", { value: 1 }, 2_000);
    await store.delete("key");

    expect(kv.get).toHaveBeenCalledWith("key", "json");
    expect(calls[0]).toEqual(["key", JSON.stringify({ value: 1 }), { expiration: 2 }]);
    expect(calls[1]).toEqual(["delete", "key"]);
  });

  test("UpstashKeyStore maps expirations to redis TTLs and pipelines bulk writes", async () => {
    const nowSpy = spyOn(Date, "now").mockReturnValue(1_000);
    const pipeline = {
      set: mock(() => pipeline),
      exec: mock(async () => undefined),
    };
    const redis = {
      get: mock(async () => "value"),
      set: mock(async () => undefined),
      del: mock(async () => 1),
      mget: mock(async () => ["a", "b"]),
      pipeline: mock(() => pipeline),
    };
    const store = new UpstashKeyStore(redis as any);

    expect(await store.get("key")).toBe("value");
    await store.set("key", "value", 6_000);
    await store.setMany([{ key: "bulk", value: "value", expiresAt: 11_000 }]);
    expect(await store.getMany(["a", "b"])).toEqual(["a", "b"]);
    await store.deleteMany(["a", "b"]);

    expect(redis.set).toHaveBeenCalledWith("key", "value", { ex: 5 });
    expect(pipeline.set).toHaveBeenCalledWith("bulk", "value", { ex: 10 });
    expect(pipeline.exec).toHaveBeenCalled();
    expect(redis.mget).toHaveBeenCalledWith("a", "b");
    expect(redis.del).toHaveBeenCalledWith("a", "b");

    nowSpy.mockRestore();
  });
});

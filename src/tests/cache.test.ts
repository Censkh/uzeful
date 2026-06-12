import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { createUzeful } from "..";
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
    const namespace = createCacheNamespace<{ name: string }>({ id: "users" });
    const uze = createUzeful<Record<string, unknown>, Request>({
      cache: {
        createKeyStore: async () => store,
        getKeyPrefix: () => "tenant-a",
        getVersion: () => "v1",
      },
    });

    await uze.run(
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
    const namespace = createVersionedCacheNamespace<string>({ id: "settings" });
    const uze = createUzeful<Record<string, unknown>, Request>({
      cache: {
        createKeyStore: async () => store,
        getKeyPrefix: () => "app",
        getVersion: () => "v2",
      },
    });

    await uze.run(
      { request: new Request("https://example.com/"), env: {}, waitUntil: () => {}, rawContext: {} },
      async () => {
        const cache = uzeCacheState(namespace);
        await cache.set("enabled");
      },
    );

    expect(await store.get("app:settings:v2")).toMatchObject({ data: "enabled" });
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

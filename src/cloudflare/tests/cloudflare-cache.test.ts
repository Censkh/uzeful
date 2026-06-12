import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { CloudflareCacheKeyStore } from "..";

class TestCloudflareCache {
  requests: Request[] = [];
  responses = new Map<string, Response>();
  deleted: string[] = [];

  async match(request: Request): Promise<Response | undefined> {
    this.requests.push(request);
    return this.responses.get(request.url)?.clone();
  }

  async put(request: Request, response: Response): Promise<void> {
    this.requests.push(request);
    this.responses.set(request.url, response.clone());
  }

  async delete(request: Request): Promise<boolean> {
    this.requests.push(request);
    this.deleted.push(request.url);
    return this.responses.delete(request.url);
  }
}

afterEach(() => {
  mock.restore();
});

describe("CloudflareCacheKeyStore", () => {
  test("stores values as cache responses", async () => {
    const nowSpy = spyOn(Date, "now").mockReturnValue(1_000);
    const cache = new TestCloudflareCache();
    const store = new CloudflareCacheKeyStore({
      cache,
      baseUrl: "https://cache.example.test",
    });

    await store.set("tenant:user:1", { name: "Ada" }, 6_000);

    const requestUrl = "https://cache.example.test/tenant%3Auser%3A1";
    const response = cache.responses.get(requestUrl);
    expect(response).toBeDefined();
    expect(response?.headers.get("Content-Type")).toBe("application/json");
    expect(response?.headers.get("Cache-Control")).toBe("public, max-age=5");
    expect(await store.get("tenant:user:1")).toEqual({ name: "Ada" });

    await store.delete("tenant:user:1");
    expect(await store.get("tenant:user:1")).toBeNull();
    expect(cache.deleted).toEqual([requestUrl]);

    nowSpy.mockRestore();
  });

  test("supports bulk operations", async () => {
    const cache = new TestCloudflareCache();
    const store = new CloudflareCacheKeyStore({ cache });

    await store.setMany([
      { key: "a", value: 1 },
      { key: "b", value: 2 },
    ]);

    expect(await store.getMany<number>(["a", "missing", "b"])).toEqual([1, null, 2]);

    await store.deleteMany(["a", "b"]);
    expect(await store.getMany<number>(["a", "b"])).toEqual([null, null]);
  });

  test("drops invalid JSON cache entries", async () => {
    const cache = new TestCloudflareCache();
    const store = new CloudflareCacheKeyStore({ cache });
    const requestUrl = "https://uze-cache.internal/bad";
    cache.responses.set(requestUrl, new Response("not-json"));

    expect(await store.get("bad")).toBeNull();
    expect(cache.deleted).toEqual([requestUrl]);
  });
});

import { describe, expect, mock, test } from "bun:test";
import { createUzeful, uzeContextInternal } from "../src";
import { cloudflareFetch, cloudflareQueue, cloudflareRun, cloudflareTest, uzeCloudflareQueue } from "../src/cloudflare";
import { createRouter, lazyRoute } from "../src/router";
import { run } from "./helpers";

describe("router and cloudflare adapters", () => {
  test("router fetch reads the active request from context", async () => {
    const router = createRouter();
    router.get("/hello/:name", ({ name }) => new Response(`hello ${name}`));

    const response = await run(() => router.fetch(), new Request("https://example.com/hello/ada"));

    expect(await response.text()).toBe("hello ada");
  });

  test("lazyRoute loads route module once", async () => {
    const route = mock(async () => new Response("loaded"));
    const loader = mock(async () => ({ default: route }));
    const lazy = lazyRoute(loader);

    expect(await (await lazy()).text()).toBe("loaded");
    expect(await (await lazy()).text()).toBe("loaded");
    expect(loader).toHaveBeenCalledTimes(1);
    expect(route).toHaveBeenCalledTimes(2);
  });

  test("cloudflare adapters provide context, env, waitUntil, and queue messages", async () => {
    const uze = createUzeful<{ value: string }, Request>();
    const context = { waitUntil: mock((promise: Promise<any>) => promise), custom: true };

    const fetchHandler = cloudflareFetch(uze, async () => {
      const current = uzeContextInternal<{ value: string }>();
      current.waitUntil(Promise.resolve("later"));
      return new Response(current.env.value);
    });

    const fetchResponse = await fetchHandler(new Request("https://example.com/"), { value: "env" }, context);
    expect(await fetchResponse.text()).toBe("env");
    expect(context.waitUntil).toHaveBeenCalled();

    const runHandler = cloudflareRun(uze, async () => {
      expect(uzeContextInternal<{ value: string }>().env.value).toBe("run-env");
    });
    await runHandler({ value: "run-env" }, context);

    const queueHandler = cloudflareQueue(uze, async () => {
      expect(uzeCloudflareQueue()).toEqual({ messages: [{ body: { id: 1 } }] });
    });
    await queueHandler({ messages: [{ body: { id: 1 } }] }, { value: "queue-env" }, context);
  });

  test("cloudflareTest waits for waitUntil promises", async () => {
    const finished: string[] = [];

    const result = await cloudflareTest({ value: "env" }, async () => {
      const context = uzeContextInternal<{ value: string }>();
      context.waitUntil(Promise.resolve().then(() => finished.push("waited")));
      return context.env.value;
    });

    expect(result).toBe("env");
    expect(finished).toEqual(["waited"]);
  });
});

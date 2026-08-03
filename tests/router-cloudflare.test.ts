import { describe, expect, mock, test } from "bun:test";
import { uzeContextInternal } from "../src";
import { CloudflareUzefulApp, uzeCloudflareQueue } from "../src/cloudflare";
import { createRouter, lazyRoute } from "../src/router";
import { run } from "./helpers";

describe("router and Cloudflare Uzeful app", () => {
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

  test("Cloudflare app provides context, env, waitUntil, and queue messages", async () => {
    const uze = new CloudflareUzefulApp<{ value: string }, Request>();
    const context = { waitUntil: mock((promise: Promise<any>) => promise), custom: true };

    const fetchHandler = uze.fetch(async () => {
      const current = uzeContextInternal<{ value: string }>();
      current.waitUntil(Promise.resolve("later"));
      return new Response(current.env.value);
    });

    const fetchResponse = await fetchHandler(new Request("https://example.com/"), { value: "env" }, context);
    expect(await fetchResponse.text()).toBe("env");
    expect(context.waitUntil).toHaveBeenCalled();

    const runHandler = uze.run(async () => {
      expect(uzeContextInternal<{ value: string }>().env.value).toBe("run-env");
    });
    await runHandler({ value: "run-env" }, context);

    const queueHandler = uze.queue(async () => {
      expect(uzeCloudflareQueue()).toEqual({ messages: [{ body: { id: 1 } }] });
    });
    await queueHandler({ messages: [{ body: { id: 1 } }] }, { value: "queue-env" }, context);
  });

  test("Uzeful test waits for waitUntil promises", async () => {
    const finished: string[] = [];
    const uze = new CloudflareUzefulApp<{ value: string }, Request>();

    const result = await uze.test({ env: { value: "env" } }, async () => {
      const context = uzeContextInternal<{ value: string }>();
      context.waitUntil(Promise.resolve().then(() => finished.push("waited")));
      return context.env.value;
    });

    expect(result).toBe("env");
    expect(finished).toEqual(["waited"]);
  });
});

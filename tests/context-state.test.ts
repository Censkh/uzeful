import { describe, expect, test } from "bun:test";
import { createStateKey, createUzeful, uzeContext, uzeRequestId, uzeRequestState, uzeSharedState } from "../src";
import { run } from "./helpers";

describe("context and state", () => {
  test("exposes request/env context and isolates per-run state", async () => {
    const key = createStateKey("counter", () => 1);

    const first = await run(() => {
      const context = uzeContext();
      const [getCounter, setCounter] = uzeRequestState(key);

      expect(context.request.url).toBe("https://example.com/");
      setCounter((current) => current + 1);
      return { counter: getCounter(), requestId: uzeRequestId() };
    });

    const second = await run(() => {
      const [getCounter] = uzeRequestState(key);
      return { counter: getCounter(), requestId: uzeRequestId() };
    });

    expect(first.counter).toBe(2);
    expect(second.counter).toBe(1);
    expect(first.requestId).not.toBe(second.requestId);
  });

  test("shared state persists across runs", async () => {
    const key = createStateKey("shared-counter", () => 0);

    const first = await run(() => {
      const [getValue, setValue] = uzeSharedState(key);
      return setValue(getValue() + 1);
    });

    const second = await run(() => {
      const [getValue, setValue] = uzeSharedState(key);
      return setValue(getValue() + 1);
    });

    expect(first).toBe(1);
    expect(second).toBe(2);
  });

  test("waitUntil accepts promises and lazy promise functions", async () => {
    const waited: Promise<any>[] = [];

    await createUzeful<Record<string, unknown>, Request>().run(
      {
        request: new Request("https://example.com/"),
        env: {},
        waitUntil: (promise) => waited.push(promise),
        rawContext: {},
      },
      () => {
        const context = uzeContext();
        context.waitUntil(Promise.resolve("direct"));
        context.waitUntil(() => Promise.resolve("lazy"), "lazy-work");
      },
    );

    await expect(Promise.all(waited)).resolves.toEqual(["direct", "lazy"]);
  });
});

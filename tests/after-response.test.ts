import { describe, expect, test } from "bun:test";
import { UzefulApp, uzeAfterWaitUntils, uzeContextInternal } from "../src";

describe("response lifecycle hooks", () => {
  test("runs after-response hooks after the response returns and waitUntil work completes", async () => {
    const uze = new UzefulApp<Record<string, never>, Request>();
    const waited: Promise<unknown>[] = [];
    const completed: string[] = [];
    let responseReturned = false;
    let resolveFirstWork!: () => void;

    const response = await uze.dispatch(
      {
        request: new Request("https://example.com/"),
        env: {},
        waitUntil: (promise) => waited.push(promise),
        rawContext: {},
      },
      async () => {
        const context = uzeContextInternal();
        context.waitUntil(
          new Promise<void>((resolve) => {
            resolveFirstWork = resolve;
          }).then(() => {
            completed.push("first");
          }),
        );
        uzeAfterWaitUntils(() => {
          expect(responseReturned).toBe(true);
          completed.push("after-response");
        });

        return new Response("ok");
      },
    );

    responseReturned = true;
    expect(await response.text()).toBe("ok");
    expect(completed).toEqual([]);

    resolveFirstWork();
    await Promise.allSettled(waited);
    expect(completed).toEqual(["first", "after-response"]);
  });

  test("rejects waitUntil work queued after the response returns", async () => {
    const uze = new UzefulApp<Record<string, never>, Request>();
    const waited: Promise<unknown>[] = [];
    let context!: ReturnType<typeof uzeContextInternal>;

    await uze.dispatch(
      {
        request: new Request("https://example.com/"),
        env: {},
        waitUntil: (promise) => waited.push(promise),
        rawContext: {},
      },
      async () => {
        context = uzeContextInternal();
        return new Response("ok");
      },
    );

    expect(() => context.waitUntil(Promise.resolve())).toThrow("after the response has been returned");
    expect(waited).toEqual([]);
  });
});

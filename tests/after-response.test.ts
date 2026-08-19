import { describe, expect, test } from "bun:test";
import { UzefulApp, uzeAfterWaitUntils, uzeContextInternal } from "../src";

describe("response lifecycle hooks", () => {
  test("runs after-response hooks after nested waitUntil work without delaying the response", async () => {
    const uze = new UzefulApp<Record<string, never>, Request>();
    const waited: Promise<unknown>[] = [];
    const completed: string[] = [];
    let resolveFirstWork!: () => void;
    let resolveNestedWork!: () => void;

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
            context.waitUntil(
              new Promise<void>((resolve) => {
                resolveNestedWork = resolve;
              }).then(() => {
                completed.push("nested");
              }),
            );
          }),
        );
        uzeAfterWaitUntils(() => {
          completed.push("after-response");
        });

        return new Response("ok");
      },
    );

    expect(await response.text()).toBe("ok");
    expect(completed).toEqual([]);

    resolveFirstWork();
    await Promise.resolve();
    expect(completed).toEqual(["first"]);

    resolveNestedWork();
    await Promise.allSettled(waited);
    expect(completed).toEqual(["first", "nested", "after-response"]);
  });
});

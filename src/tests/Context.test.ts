import { describe, expect, test } from "bun:test";
import { UzefulApp, uzeContextInternal, uzeTestContext } from "..";

describe("uzeTestContext()", () => {
  test("cleanup drains work scheduled by pending waitUntil work", async () => {
    const uze = new UzefulApp<Record<string, never>, Request>();
    let resolveFirstWork!: () => void;
    let resolveFollowUpWork!: () => void;
    let followUpComplete = false;

    await uze.execute(
      {
        request: new Request("https://example.com/"),
        env: {},
        waitUntil: () => {},
        rawContext: { __uzeTestContext: true },
      },
      async () => {
        const context = uze.hooks.uzeContext();
        context.waitUntil(
          new Promise<void>((resolve) => {
            resolveFirstWork = resolve;
          }).then(() => {
            context.waitUntil(
              new Promise<void>((resolve) => {
                resolveFollowUpWork = resolve;
              }).then(() => {
                followUpComplete = true;
              }),
            );
          }),
        );

        const testContext = uzeTestContext();
        expect(testContext.cleanup).toBe(testContext.drainWaitUntils);
        const completed = testContext.cleanup();
        resolveFirstWork();
        await Promise.resolve();
        expect(followUpComplete).toBe(false);
        resolveFollowUpWork();
        await completed;
      },
    );

    expect(followUpComplete).toBe(true);
  });

  test("test waits for registered work", async () => {
    let workCompleted = false;
    const uze = new UzefulApp<Record<string, never>, Request>();

    await uze.test({ env: {} }, async () => {
      uzeContextInternal().waitUntil(
        Promise.resolve().then(() => {
          workCompleted = true;
        }),
      );
    });

    expect(workCompleted).toBe(true);
  });

  test("is unavailable outside a test context", async () => {
    const uze = new UzefulApp<Record<string, never>, Request>();

    await uze.execute(
      { request: new Request("https://example.com/"), env: {}, waitUntil: () => {}, rawContext: {} },
      async () => {
        expect(() => uzeTestContext()).toThrow("test context");
      },
    );
  });
});

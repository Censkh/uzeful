import { describe, expect, test } from "bun:test";
import { createUzeful, uzeContextInternal } from "..";
import { cloudflareTest } from "../cloudflare";

describe("uzeTestContext()", () => {
  test("cleanup drains work scheduled by pending waitUntil work", async () => {
    const uze = createUzeful<Record<string, never>, Request>();
    let resolveFirstWork!: () => void;
    let resolveFollowUpWork!: () => void;
    let followUpComplete = false;

    await uze.run(
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

        const testContext = uze.hooks.uzeTestContext();
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

  test("cloudflareTest waits for registered work", async () => {
    let workCompleted = false;

    await cloudflareTest({}, async () => {
      uzeContextInternal().waitUntil(
        Promise.resolve().then(() => {
          workCompleted = true;
        }),
      );
    });

    expect(workCompleted).toBe(true);
  });

  test("is unavailable outside a test context", async () => {
    const uze = createUzeful<Record<string, never>, Request>();

    await uze.run(
      { request: new Request("https://example.com/"), env: {}, waitUntil: () => {}, rawContext: {} },
      async () => {
        expect(() => uze.hooks.uzeTestContext()).toThrow("test context");
      },
    );
  });
});

import { describe, expect, mock, test } from "bun:test";
import { SendableError, uzeContextInternal } from "../src";
import { BunUzefulApp } from "../src/bun";

describe("Bun Uzeful app", () => {
  test("adapts a Bun fetch handler into an Uzeful request context", async () => {
    const app = new BunUzefulApp<{ value: string }>();
    const waitUntil = mock((promise: Promise<unknown>) => promise);
    const server = { port: 5180 };
    const fetchHandler = app.fetch(
      async () => {
        const context = uzeContextInternal<{ value: string }>();
        context.waitUntil(Promise.resolve("later"));
        expect(context.rawContext).toEqual({ requestId: "bun-request", server });
        return new Response(context.env.value);
      },
      {
        getEnv: () => ({ value: "bun-env" }),
        waitUntil,
        getRawContext: (_request, currentServer) => ({
          requestId: "bun-request",
          server: currentServer,
        }),
      },
    );

    const response = await fetchHandler(new Request("http://localhost/"), server);

    expect(await response.text()).toBe("bun-env");
    expect(waitUntil).toHaveBeenCalledTimes(1);
  });

  test("uses the standard dispatch error lifecycle", async () => {
    const app = new BunUzefulApp<Record<string, never>>();
    const fetchHandler = app.fetch(
      async () => {
        throw new SendableError({
          code: "bun/test-error",
          message: "Bun adapter error",
          status: 418,
          public: true,
        });
      },
      { getEnv: () => ({}) },
    );

    const response = await fetchHandler(new Request("http://localhost/"));

    expect(response.status).toBe(418);
    expect(await response.json()).toMatchObject({ code: "bun/test-error", message: "Bun adapter error" });
  });
});

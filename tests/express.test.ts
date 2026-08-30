import { afterEach, describe, expect, test } from "bun:test";
import type { Server } from "node:http";
import { uzeContextInternal } from "../src";
import { app, type ExpressFixtureEnv, expressUzeful } from "./fixtures/express/app";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("Express Uzeful app", () => {
  test("serves Uzeful responses through an Express app", async () => {
    const server = app.listen(0);
    servers.push(server);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Express fixture did not bind a TCP port");
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/greeting/Ada`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ greeting: "Hello, Ada!", path: "/greeting/Ada" });
  }, 15_000);

  test("forwards request bodies to Fetch handlers", async () => {
    const server = app.listen(0);
    servers.push(server);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Express fixture did not bind a TCP port");
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/echo`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "adapter body",
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("adapter body");
  }, 15_000);

  test("uses the Express instance environment in test contexts", async () => {
    const greeting = await expressUzeful.test({ env: { greeting: "Hi" } }, async () => {
      return uzeContextInternal<ExpressFixtureEnv>().env.greeting;
    });

    expect(greeting).toBe("Hi");
  });
});

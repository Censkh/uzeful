import { describe, expect, test } from "bun:test";
import { SendableError } from "../src";
import { BunUzefulApp } from "../src/bun";
import {
  colorFromLevel,
  log,
  sanitizeRequestHeaders,
  sanitizeRequestUrl,
  traceMiddleware,
  withSink,
} from "../src/logger";
import { RouteNotFoundError } from "../src/router";

describe("logger", () => {
  test("writes formatted objects, errors, and child sources to sinks", () => {
    const messages: string[] = [];
    const previousVerbose = process.env.VERBOSE;
    process.env.VERBOSE = "true";

    withSink(
      { out: { info: (message) => messages.push(message) } as Console, disableTime: true, disableLevelLabel: true },
      () => {
        log("info", "root", "message", { id: 1 }, new Error("boom"));
      },
    );
    process.env.VERBOSE = previousVerbose;

    expect(messages.join("\n")).toContain("root - message");
    expect(messages.join("\n")).toContain('"id": 1');
    expect(messages.join("\n")).toContain("boom");
  });

  test("colors by severity", () => {
    expect(colorFromLevel("info")("x")).toContain("x");
    expect(colorFromLevel("warn")("x")).toContain("x");
    expect(colorFromLevel("error")("x")).toContain("x");
    expect(colorFromLevel("debug")("x")).toContain("x");
  });

  test("redacts sensitive query parameters from request URLs", () => {
    const url = sanitizeRequestUrl("https://example.com/events?token=secret-token&pageIndex=0&API_KEY=api-key");

    expect(url).toBe("https://example.com/events?token=REDACTED&pageIndex=0&API_KEY=REDACTED");
    expect(url).not.toContain("secret-token");
    expect(url).not.toContain("api-key");
  });

  test("extends default sensitive headers case-insensitively without changing other callers", () => {
    const headers = {
      Authorization: "Bearer secret",
      "X-Custom-Signature": "webhook-secret",
      accept: "application/json",
    };
    expect(sanitizeRequestHeaders(headers, ["x-custom-signature"])).toEqual({ accept: "application/json" });
    expect(sanitizeRequestHeaders(headers)).toEqual({
      "X-Custom-Signature": "webhook-secret",
      accept: "application/json",
    });
    expect(headers.Authorization).toBe("Bearer secret");
  });

  test("omits configured headers from both request and response trace logs", async () => {
    const messages: string[] = [];
    const previousVerbose = process.env.VERBOSE;
    const app = new BunUzefulApp<Record<string, never>>();
    const trace = traceMiddleware({ sensitiveHeaders: ["X-Custom-Signature"] });
    const handler = app.fetch(
      async () => {
        await trace();
        return new Response("ok");
      },
      { getEnv: () => ({}) },
    );
    process.env.VERBOSE = "true";
    try {
      await withSink({ out: { info: (message) => messages.push(message) } as Console }, () =>
        handler(
          new Request("https://example.com/", {
            headers: {
              "x-custom-signature": "private-value",
              authorization: "Bearer secret",
              accept: "application/json",
            },
          }),
        ),
      );
    } finally {
      if (previousVerbose === undefined) delete process.env.VERBOSE;
      else process.env.VERBOSE = previousVerbose;
    }
    expect(messages).toHaveLength(2);
    for (const message of messages) {
      expect(message).not.toContain("private-value");
      expect(message).not.toContain("Bearer secret");
      expect(message).toContain("application/json");
    }
  });

  test("logs an expected 404 as a finished request without an error stack", async () => {
    const info: string[] = [];
    const errors: string[] = [];
    const previousVerbose = process.env.VERBOSE;
    const app = new BunUzefulApp<Record<string, never>>();
    const handler = app.fetch(
      async () => {
        await traceMiddleware()();
        throw new RouteNotFoundError();
      },
      { getEnv: () => ({}) },
    );

    process.env.VERBOSE = "true";
    try {
      const response = await withSink(
        { out: { info: (message) => info.push(message), error: (message) => errors.push(message) } as Console },
        () => handler(new Request("https://example.com/robots.txt")),
      );
      expect(response.status).toBe(404);
    } finally {
      if (previousVerbose === undefined) delete process.env.VERBOSE;
      else process.env.VERBOSE = previousVerbose;
    }

    expect(info).toHaveLength(2);
    expect(info[0]).toContain("Calling GET https://example.com/robots.txt");
    expect(info[1]).toContain("Finished calling GET https://example.com/robots.txt got status code 404");
    expect(info[1]).toContain('"status": 404');
    expect(info[1]).not.toContain('"headers"');
    expect(errors).toHaveLength(0);
  });

  test("keeps a resource 404 in error logs", async () => {
    const info: string[] = [];
    const errors: string[] = [];
    const previousVerbose = process.env.VERBOSE;
    const app = new BunUzefulApp<Record<string, never>>();
    const handler = app.fetch(
      async () => {
        await traceMiddleware()();
        throw new SendableError({ status: 404, message: "Project not found", public: true });
      },
      { getEnv: () => ({}) },
    );

    process.env.VERBOSE = "true";
    try {
      await withSink(
        { out: { info: (message) => info.push(message), error: (message) => errors.push(message) } as Console },
        () => handler(new Request("https://example.com/v1/projects/missing")),
      );
    } finally {
      if (previousVerbose === undefined) delete process.env.VERBOSE;
      else process.env.VERBOSE = previousVerbose;
    }

    expect(info).toHaveLength(1);
    expect(errors[0]).toContain("Failed calling GET");
    expect(errors[1]).toContain("Caused by: Error: Project not found");
  });
});

import { describe, expect, test } from "bun:test";
import { BunUzefulApp } from "../src/bun";
import {
  colorFromLevel,
  log,
  sanitizeRequestHeaders,
  sanitizeRequestUrl,
  traceMiddleware,
  withSink,
} from "../src/logger";

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
});

import { describe, expect, test } from "bun:test";
import { SendableError, UzefulApp } from "../src";
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

interface Line {
  level: string;
  text: string;
}

/** Sends one traced request whose handler throws `error` (or returns `response`) and returns the lines logged. */
const trace = async (
  outcome: { error: unknown } | { response: Response },
  url = "https://api.example.com/v1/things?name=holiday.jpg&page=2",
  options?: Parameters<typeof traceMiddleware>[0],
): Promise<{ lines: Line[]; status: number }> => {
  const lines: Line[] = [];
  const write = (level: string) => (text: string) => lines.push({ level, text });
  const app = new UzefulApp<Record<string, never>, Request>();
  const previousVerbose = process.env.VERBOSE;
  process.env.VERBOSE = "true";
  const response = await withSink(
    {
      out: {
        info: write("info"),
        warn: write("warn"),
        error: write("error"),
        debug: write("debug"),
      } as unknown as typeof console,
      disableTime: true,
    },
    () =>
      app.dispatch(
        {
          request: new Request(url, {
            headers: {
              "CF-Connecting-IP": "203.0.113.7",
              "X-Forwarded-For": "203.0.113.7, 198.51.100.2",
              "X-Real-IP": "203.0.113.7",
              "True-Client-IP": "203.0.113.7",
              Accept: "application/json",
            },
          }),
          env: {},
          waitUntil: () => {},
          rawContext: {},
        },
        async () => {
          await traceMiddleware(options)();
          if ("error" in outcome) throw outcome.error;
          return outcome.response;
        },
      ),
  ).finally(() => {
    if (previousVerbose === undefined) delete process.env.VERBOSE;
    else process.env.VERBOSE = previousVerbose;
  });
  return { lines, status: response.status };
};

const infoOf = (line: Line) => JSON.parse(line.text.slice(line.text.indexOf("{")));

const finished = (lines: Line[]) => lines.filter((line) => !line.text.includes("Calling "));

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

  test("logs a missing resource (404) at warn with its code, not as an error", async () => {
    const { lines, status } = await trace(
      {
        error: new SendableError({
          code: "test/project-missing",
          status: 404,
          message: "Project not found",
          public: true,
        }),
      },
      "https://example.com/v1/projects/missing",
    );
    expect(status).toBe(404);
    expect(finished(lines).map((line) => line.level)).toEqual(["warn"]);
    expect(infoOf(finished(lines)[0]!)).toMatchObject({ code: "test/project-missing", status: 404 });
  });

  test("logs a client error a handler sends at warn, with its code and status", async () => {
    const { lines, status } = await trace({
      error: new SendableError({ code: "test/invalid-id", status: 400, public: true, message: "Bad ID" }),
    });
    expect(status).toBe(400);
    expect(finished(lines).map((line) => line.level)).toEqual(["warn"]);
    expect(infoOf(finished(lines)[0]!)).toMatchObject({ code: "test/invalid-id", status: 400 });
    expect(infoOf(finished(lines)[0]!)).not.toHaveProperty("headers");
  });

  test("logs a missing route at info with its path only", async () => {
    for (const outcome of [
      { error: new RouteNotFoundError() },
      { error: new SendableError({ code: "misc/route-not-found", status: 404, public: true }) },
      { response: new Response("Not found", { status: 404 }) },
    ]) {
      const { lines, status } = await trace(outcome);
      expect(status).toBe(404);
      const [line, ...rest] = finished(lines);
      expect(rest).toEqual([]);
      expect(line!.level).toBe("info");
      expect(line!.text).toContain("https://api.example.com/v1/things");
      expect(line!.text).not.toContain("page=2");
      expect(line!.text).not.toContain("application/json");
    }
  });

  test("logs server errors and unexpected exceptions at error, with their message", async () => {
    for (const outcome of [
      { error: new Error("database unavailable") },
      { error: new SendableError({ code: "test/upstream", status: 503, message: "upstream down" }) },
      { response: new Response("Internal error", { status: 500 }) },
    ]) {
      const { lines, status } = await trace(outcome);
      expect(status).toBeGreaterThanOrEqual(500);
      expect(finished(lines).every((line) => line.level === "error")).toBe(true);
      expect(finished(lines)).not.toHaveLength(0);
    }
    const { lines } = await trace({ error: new Error("database unavailable") });
    expect(finished(lines).some((line) => line.text.includes("database unavailable"))).toBe(true);
  });

  test("never logs the client's IP address", async () => {
    for (const outcome of [
      { error: new Error("boom") },
      { error: new SendableError({ code: "test/forbidden", status: 403, public: true }) },
      { response: new Response("ok") },
    ]) {
      const { lines } = await trace(outcome);
      expect(lines.length).toBeGreaterThanOrEqual(2);
      for (const line of lines) expect(line.text).not.toContain("203.0.113.7");
    }
  });

  test("redacts the values of the given query parameters", async () => {
    const { lines } = await trace({ response: new Response("ok") }, undefined, {
      sensitiveQueryParameters: ["name"],
    });
    expect(lines.length).toBe(2);
    for (const line of lines) {
      expect(line.text).not.toContain("holiday.jpg");
      expect(line.text).toContain("name=REDACTED");
    }
  });
});

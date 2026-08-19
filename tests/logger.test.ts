import { describe, expect, test } from "bun:test";
import { colorFromLevel, log, sanitizeRequestUrl, withSink } from "../src/logger";

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
    const url = sanitizeRequestUrl(
      "https://api.polysnap.app/v1/app-events/subscribe?token=firebase-token&pageIndex=0&API_KEY=api-key",
    );

    expect(url).toBe("https://api.polysnap.app/v1/app-events/subscribe?token=REDACTED&pageIndex=0&API_KEY=REDACTED");
    expect(url).not.toContain("firebase-token");
    expect(url).not.toContain("api-key");
  });
});

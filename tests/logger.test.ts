import { describe, expect, test } from "bun:test";
import { colorFromLevel, log, withSink } from "../src/logger";

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
});

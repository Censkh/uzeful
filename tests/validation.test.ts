import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { uzeValidatedBody, uzeValidatedRequest } from "../src/validation";
import { parseZodError } from "../src/validation/ValidationUtils";
import { run } from "./helpers";

describe("validation", () => {
  test("validates query, body, params, and headers", async () => {
    const request = new Request("https://example.com/users/42?active=true&count=3&tags=a,b", {
      method: "POST",
      headers: { "content-type": "application/json", "x-token": "secret" },
      body: JSON.stringify({ name: "Ada" }),
    }) as Request & { params: Record<string, string> };
    request.params = { id: "42" };

    const result = await run(
      () =>
        uzeValidatedRequest({
          params: z.object({ id: z.string() }),
          query: z.object({ active: z.boolean(), count: z.number(), tags: z.array(z.string()) }),
          body: z.object({ name: z.string() }),
          headers: z.object({ "x-token": z.string() }).passthrough(),
        }),
      request,
    );

    expect(result).toEqual({
      params: { id: "42" },
      query: { active: true, count: 3, tags: ["a", "b"] },
      body: { name: "Ada" },
      headers: expect.objectContaining({ "x-token": "secret" }),
    });
  });

  test("wraps zod errors as public sendable validation errors", async () => {
    const error = await run(async () => {
      try {
        await uzeValidatedBody(z.object({ name: z.string() }));
      } catch (caught) {
        return caught as any;
      }
    });

    expect(error.message).toContain("Invalid input");
    const response = error.toResponse();
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.code).toContain("validation/");
    expect(body.details.path).toBe("name");
  });

  test("parses zod issues into public-safe details", () => {
    const result = z.object({ count: z.number() }).safeParse({ count: "bad" });
    if (result.success) throw new Error("expected validation failure");

    expect(parseZodError(result.error)).toEqual({
      code: "validation/invalid-type",
      message: expect.any(String),
      details: {
        path: "count",
        issues: [
          {
            path: "count",
            message: expect.any(String),
            code: "validation/invalid-type",
          },
        ],
      },
    });
  });
});

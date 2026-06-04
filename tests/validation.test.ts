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

  test("validates multipart form bodies with dot-key nesting", async () => {
    const file = new File(["hello"], "hello.txt", { type: "text/plain" });
    const formData = new FormData();
    formData.append("name", "Ada");
    formData.append("content.blob", file);
    formData.append("content.type", "text/plain");
    formData.append("processingOptions.keepAfterProcessing", "true");
    formData.append("metadata.tag", "one");
    formData.append("metadata.tag", "two");

    const request = new Request("https://example.com/users", {
      method: "POST",
      body: formData,
    });

    const result = await run(
      () =>
        uzeValidatedBody(
          z.object({
            name: z.string(),
            content: z.object({
              blob: z.instanceof(File),
              type: z.string(),
            }),
            processingOptions: z.object({
              keepAfterProcessing: z.string(),
            }),
            metadata: z.object({
              tag: z.array(z.string()),
            }),
          }),
        ),
      request,
    );

    expect(result.name).toBe("Ada");
    expect(result.content.blob.name).toBe("hello.txt");
    expect(result.content.type).toBe("text/plain");
    expect(result.processingOptions.keepAfterProcessing).toBe("true");
    expect(result.metadata.tag).toEqual(["one", "two"]);
  });

  test("validates multipart form bodies with indexed array dot-key nesting", async () => {
    const formData = new FormData();
    formData.append("uploadedParts.0.partNumber", "1");
    formData.append("uploadedParts.0.etag", "calmlens-part-1");
    formData.append("uploadedParts.1.partNumber", "2");
    formData.append("uploadedParts.1.etag", "calmlens-part-2");

    const request = new Request("https://example.com/uploads", {
      method: "POST",
      body: formData,
    });

    const result = await run(
      () =>
        uzeValidatedBody(
          z.object({
            uploadedParts: z.array(
              z.object({
                partNumber: z.coerce.number().int().positive(),
                etag: z.string(),
              }),
            ),
          }),
        ),
      request,
    );

    expect(result.uploadedParts).toEqual([
      { partNumber: 1, etag: "calmlens-part-1" },
      { partNumber: 2, etag: "calmlens-part-2" },
    ]);
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

import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { uzeValidatedBody, uzeValidatedQuery, uzeValidatedRequest } from "../src/validation";
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

  test("preserves empty query values as strings", async () => {
    const result = await run(
      () => uzeValidatedQuery(z.object({ query: z.string() })),
      new Request("https://example.com/users?query="),
    );

    expect(result).toEqual({ query: "" });
  });

  test("preserves numeric, boolean and comma-containing search text while coercing typed query fields", async () => {
    for (const search of ["00123", "false", "true", "1,2", "a+b & c"]) {
      const query = new URLSearchParams({ search, page: "2", recursive: "false", ids: "1,2" });
      const result = await run(
        () =>
          uzeValidatedQuery(
            z.object({
              search: z.string(),
              page: z.number().int(),
              recursive: z.boolean(),
              ids: z.array(z.number()),
            }),
          ),
        new Request(`https://example.com/?${query}`),
      );
      expect(result).toEqual({ search, page: 2, recursive: false, ids: [1, 2] });
    }
  });

  test("reports a JSON query value the schema refuses as sent, not as a converted list", async () => {
    // The string is the field's own type: its parsed JSON is what the schema refuses.
    const items = z
      .string()
      .transform((value) => JSON.parse(value))
      .pipe(z.array(z.object({ id: z.string() })));
    const schema = z.object({ items, ids: z.array(z.number()) });
    const sent = { items: '{"author":"a,b"}', ids: "1,2" };
    const error = await run(
      async () => {
        try {
          await uzeValidatedQuery(schema);
        } catch (caught) {
          return caught as any;
        }
      },
      new Request(`https://example.com/?${new URLSearchParams(sent)}`),
    );

    const body = await error.toResponse().json();
    const unconverted = parseZodError(schema.safeParse({ items: sent.items, ids: [1, 2] }).error!);
    expect(body.code).toBe(unconverted.code);
    expect(body.details).toEqual(unconverted.details);
  });

  test("reports an out-of-range numeric query value as out of range", async () => {
    const schema = z.object({ pageSize: z.number().int().min(1).max(100).default(20) });
    const codeFor = async (pageSize: string) => {
      const error = await run(
        async () => {
          try {
            await uzeValidatedQuery(schema);
          } catch (caught) {
            return caught as any;
          }
        },
        new Request(`https://example.com/?pageSize=${pageSize}`),
      );
      const body = await error.toResponse().json();
      return [body.code, body.details.path];
    };

    expect(await codeFor("101")).toEqual(["validation/too-big", "pageSize"]);
    expect(await codeFor("0")).toEqual(["validation/too-small", "pageSize"]);
    expect(await codeFor("lots")).toEqual(["validation/invalid-type", "pageSize"]);
  });

  test("coerces query fields inside a union option", async () => {
    const schema = z.object({
      range: z.union([z.object({ from: z.number(), to: z.number() }), z.object({ last: z.number() })]),
    });
    const result = await run(
      () => uzeValidatedQuery(schema),
      new Request("https://example.com/?range[from]=1&range[to]=5"),
    );

    expect(result).toEqual({ range: { from: 1, to: 5 } });
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

  test("rejects text/plain bodies for object body validation", async () => {
    const request = new Request("https://example.com/users", {
      method: "POST",
      headers: { "content-type": "text/plain;charset=UTF-8" },
      body: "name=Ada",
    });

    const error = await run(async () => {
      try {
        await uzeValidatedBody(z.object({ name: z.string() }));
      } catch (caught) {
        return caught as any;
      }
    }, request);

    expect(error.message).toContain("Unsupported request body content type");
    const response = error.toResponse();
    const body = await response.json();
    expect(response.status).toBe(415);
    expect(body.code).toBe("validation/unsupported-content-type");
    expect(body.details.contentType).toBe("text/plain");
  });

  test("validates multipart form bodies with dot-key nesting", async () => {
    const file = new File(["hello"], "hello.txt", { type: "text/plain" });
    const formData = new FormData();
    formData.append("name", "Ada");
    formData.append("content.data", file);
    formData.append("content.type", "text/plain");
    formData.append("processingOptions.keepContentAfterProcessing", "true");
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
              data: z.instanceof(File),
              type: z.string(),
            }),
            processingOptions: z.object({
              keepContentAfterProcessing: z.string(),
            }),
            metadata: z.object({
              tag: z.array(z.string()),
            }),
          }),
        ),
      request,
    );

    expect(result.name).toBe("Ada");
    expect(result.content.data.name).toBe("hello.txt");
    expect(result.content.type).toBe("text/plain");
    expect(result.processingOptions.keepContentAfterProcessing).toBe("true");
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

  test("maps zod issue codes to uzeful's own validation codes", () => {
    const result = z
      .strictObject({
        name: z.string().min(2),
        count: z.number().max(3),
        kind: z.union([z.literal("a"), z.literal("b")]),
        email: z.email(),
        even: z.number().refine((value) => value % 2 === 0),
      })
      .safeParse({ name: "x", count: 4, kind: "c", email: "nope", even: 3, extra: true });
    if (result.success) throw new Error("expected validation failure");

    const codes = Object.fromEntries(
      parseZodError(result.error).details.issues.map((issue) => [issue.path, issue.code]),
    );
    expect(codes).toEqual({
      name: "validation/too-small",
      count: "validation/too-big",
      kind: "validation/invalid-value",
      email: "validation/invalid-format",
      even: "validation/invalid-value",
      "": "validation/unknown-field",
    });
  });

  test("reports the field missing from the union option a body came closest to", () => {
    const content = z.union([
      z.object({ plainText: z.string(), type: z.string() }),
      z.object({ base64: z.string(), type: z.string() }),
    ]);
    const schema = z
      .union([z.object({ content }), z.object({ part: z.object({ plainText: z.string() }) })])
      .and(z.object({ name: z.string() }));
    const result = schema.safeParse({ name: "a", content: { plainText: "hello" } });
    if (result.success) throw new Error("expected validation failure");

    const parsed = parseZodError(result.error);
    expect(parsed.code).toBe("validation/invalid-type");
    expect(parsed.details.path).toBe("content.type");
    expect(parsed.details.issues.map((issue) => issue.path)).toEqual(["content.type"]);
  });

  test("reports a discriminated union's missing discriminator at its field", () => {
    const schema = z.object({
      item: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("a") }),
        z.object({ kind: z.literal("b"), size: z.number() }),
      ]),
    });
    const missing = schema.safeParse({ item: {} });
    const incomplete = schema.safeParse({ item: { kind: "b" } });
    if (missing.success || incomplete.success) throw new Error("expected validation failure");

    expect(parseZodError(missing.error).details.path).toBe("item.kind");
    expect(parseZodError(incomplete.error).details.path).toBe("item.size");
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

import qs from "qs";
import SendableError from "sendable-error";
import type * as zod from "zod";
import { uzeContextInternal } from "../Context";
import { parseZodError, REQUEST_ERROR_CODES } from "./ValidationUtils";

export {
  REQUEST_ERROR_CODES,
  VALIDATION_ERROR_CODES,
  type ValidationErrorCode,
  type ValidationIssueCode,
} from "./ValidationUtils";

type MultipartFormValue = string | Blob;

const getRequestContentType = (request: Request) =>
  request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();

const getZodSchemaType = (schema: zod.ZodType): string | undefined =>
  (schema as any)._zod?.def?.type ?? (schema as any).def?.type;

const expectsObjectBody = (schema: zod.ZodType) => getZodSchemaType(schema) === "object";

const throwUnsupportedBodyContentType = (contentType: string | undefined) => {
  throw new SendableError({
    message: `Unsupported request body content type${contentType ? ` '${contentType}'` : ""}. Expected application/json or multipart/form-data.`,
    code: REQUEST_ERROR_CODES.UNSUPPORTED_CONTENT_TYPE,
    details: { contentType },
    status: 415,
    public: true,
  });
};

const isArrayPathPart = (part: string) => /^(0|[1-9]\d*)$/.test(part);

const setNestedFormValue = (target: Record<string, any>, key: string, value: MultipartFormValue) => {
  const path = key.split(".").filter(Boolean);
  if (path.length === 0) {
    return;
  }

  let current = target;
  for (let index = 0; index < path.length - 1; index++) {
    const pathPart = path[index]!;
    const nextPathPart = path[index + 1]!;
    const targetKey = Array.isArray(current) && isArrayPathPart(pathPart) ? Number(pathPart) : pathPart;
    current[targetKey] ??= isArrayPathPart(nextPathPart) ? [] : {};
    current = current[targetKey];
  }

  const finalKey = path[path.length - 1]!;
  const targetKey = Array.isArray(current) && isArrayPathPart(finalKey) ? Number(finalKey) : finalKey;
  const existing = current[targetKey];
  if (existing === undefined) {
    current[targetKey] = value;
  } else if (Array.isArray(existing)) {
    existing.push(value);
  } else {
    current[targetKey] = [existing, value];
  }
};

const parseRequestBody = async (request: Request) => {
  const contentType = getRequestContentType(request);
  if (contentType === "multipart/form-data") {
    const formData = await request.formData();
    const body: Record<string, any> = {};
    formData.forEach((value, key) => {
      setNestedFormValue(body, key, value);
    });
    return body;
  }

  return request.json();
};

export const uzeValidated = async <T extends zod.ZodType>(value: any, schema: T): Promise<zod.output<T>> => {
  try {
    return await schema.parseAsync(value);
  } catch (error: any) {
    const parsed = parseZodError(error);
    throw new SendableError({
      message: parsed.message,
      code: parsed.code,
      details: parsed.details,
      status: 400,
      public: true,
    });
  }
};

export const uzeValidatedBody = async <T extends zod.ZodType>(schema: T): Promise<zod.output<T>> => {
  const { request } = uzeContextInternal();
  const contentType = getRequestContentType(request);
  let body: any = {};

  if (expectsObjectBody(schema) && contentType === "text/plain") {
    throwUnsupportedBodyContentType(contentType);
  }

  try {
    body = await parseRequestBody(request);
  } catch {}
  return uzeValidated(body, schema);
};

export const uzeValidatedQuery = async <T extends zod.ZodType>(schema: T): Promise<zod.output<T>> => {
  const { request } = uzeContextInternal();
  const search = new URL(request.url).search.split("?")[1] || "";

  const parsedParams = qs.parse(search);
  // Convert transport strings only where the schema requires another type. Search text such as
  // "00123", "false" and "a,b" must retain its exact value.
  const coerced: { parent: any; key: PropertyKey; path: string; original: string }[] = [];
  for (let pass = 0; pass < 2; pass++) {
    const result = await schema.safeParseAsync(parsedParams);
    if (result.success) return result.data;
    let changed = false;
    // A union's branch issues have paths relative to the union.
    const coerceIssues = (issues: readonly any[], prefix: readonly PropertyKey[]) => {
      for (const issue of issues) {
        const path = [...prefix, ...issue.path];
        if (issue.code === "invalid_union") {
          for (const errors of issue.errors) coerceIssues(errors, path);
          continue;
        }
        if (issue.code !== "invalid_type" || !path.length) continue;
        let parent: any = parsedParams;
        for (const key of path.slice(0, -1)) parent = parent?.[key];
        if (!parent) continue;
        const key = path.at(-1)!;
        const value = parent[key];
        if (typeof value !== "string") continue;
        if (issue.expected === "number" && value.trim() && Number.isFinite(Number(value))) {
          parent[key] = Number(value);
        } else if (issue.expected === "boolean" && (value === "true" || value === "false")) {
          parent[key] = value === "true";
        } else if (issue.expected === "array") {
          parent[key] = value.split(",");
        } else continue;
        coerced.push({ parent, key, path: path.join("."), original: value });
        changed = true;
      }
    };
    coerceIssues(result.error.issues, []);
    if (!changed) break;
  }
  // A conversion the schema still refuses as the wrong type at the same field didn't help: a string
  // the schema parses itself, such as JSON, would be reported as the converted value, so report the
  // value sent. A converted value the field refuses for another reason, such as a number out of
  // range, is the right type and keeps its conversion, so the error names the actual problem.
  const result = await schema.safeParseAsync(parsedParams);
  if (!result.success) {
    const refused = new Set<string>();
    const collect = (issues: readonly any[], prefix: readonly PropertyKey[]) => {
      for (const issue of issues) {
        const path = [...prefix, ...issue.path];
        if (issue.code === "invalid_union") for (const errors of issue.errors) collect(errors, path);
        else if (issue.code === "invalid_type") refused.add(path.join("."));
      }
    };
    collect(result.error.issues, []);
    for (const { parent, key, path, original } of coerced.reverse()) {
      if (refused.has(path)) parent[key] = original;
    }
  }
  return uzeValidated(parsedParams, schema);
};

export const uzeValidatedParams = async <T extends zod.ZodType>(schema: T): Promise<zod.output<T>> => {
  const { request } = uzeContextInternal();
  return uzeValidated(request.params, schema);
};

export const uzeValidatedHeaders = async <T extends zod.ZodType>(schema: T): Promise<zod.output<T>> => {
  const { request } = uzeContextInternal();
  const headersObj: Record<string, string> = {};

  request.headers.forEach((value, key) => {
    headersObj[key] = value;
  });

  return uzeValidated(headersObj, schema);
};

export interface ValidatedRequestSchema<
  TParams extends zod.ZodType = zod.ZodType,
  TQuery extends zod.ZodType = zod.ZodType,
  TBody extends zod.ZodType = zod.ZodType,
  THeaders extends zod.ZodType = zod.ZodType,
> {
  params?: TParams;
  query?: TQuery;
  body?: TBody;
  headers?: THeaders;
}

export interface ValidatedRequest<TParams = any, TQuery = any, TBody = any, THeaders = any> {
  params: TParams;
  query: TQuery;
  body: TBody;
  headers: THeaders;
}

export const uzeValidatedRequest = async <
  TParams extends zod.ZodType = zod.ZodNever,
  TQuery extends zod.ZodType = zod.ZodNever,
  TBody extends zod.ZodType = zod.ZodNever,
  THeaders extends zod.ZodType = zod.ZodNever,
>(
  schema: ValidatedRequestSchema<TParams, TQuery, TBody, THeaders>,
): Promise<
  ValidatedRequest<
    TParams extends zod.ZodNever ? undefined : zod.output<TParams>,
    TQuery extends zod.ZodNever ? undefined : zod.output<TQuery>,
    TBody extends zod.ZodNever ? undefined : zod.output<TBody>,
    THeaders extends zod.ZodNever ? undefined : zod.output<THeaders>
  >
> => {
  const results: any = {
    params: undefined,
    query: undefined,
    body: undefined,
    headers: undefined,
  };

  if (schema.params) {
    results.params = await uzeValidatedParams(schema.params);
  }

  if (schema.query) {
    results.query = await uzeValidatedQuery(schema.query);
  }

  if (schema.body) {
    results.body = await uzeValidatedBody(schema.body);
  }

  if (schema.headers) {
    results.headers = await uzeValidatedHeaders(schema.headers);
  }

  return results;
};

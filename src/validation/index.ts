import qs, { defaultDecoder } from "qs";
import SendableError from "sendable-error";
import type * as zod from "zod/v4";
import { uzeContextInternal } from "../Context";
import { parseZodError } from "./ValidationUtils";

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
  let body: any = {};

  try {
    body = await request.json();
  } catch {}
  return uzeValidated(body, schema);
};

export const uzeValidatedQuery = async <T extends zod.ZodType>(schema: T): Promise<zod.output<T>> => {
  const { request } = uzeContextInternal();
  const search = new URL(request.url).search.split("?")[1] || "";

  const parsedParams = qs.parse(search, {
    decoder: (value, defaultDecoder, charset, key) => {
      if (value === "true") {
        return true;
      }
      if (value === "false") {
        return false;
      }
      if (Number.isFinite(Number(value))) {
        return Number(value);
      }
      return defaultDecoder(value, charset, key);
    },
  });

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

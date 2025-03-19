import SendableError from "sendable-error";
import type * as zod from "zod";
import { uzeContextInternal } from "../Context";
import { parseZodError } from "./ValidationUtils";

export const uzeValidated = async <T>(value: any, schema: zod.ZodType<T>): Promise<T> => {
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

export const uzeValidatedBody = async <T>(schema: zod.ZodType<T>): Promise<T> => {
  const { request } = uzeContextInternal();
  let body: any = {};

  try {
    body = await request.json();
  } catch {}
  return uzeValidated(body, schema);
};

export const uzeValidatedQuery = async <T>(schema: zod.ZodType<T>): Promise<T> => {
  const { request } = uzeContextInternal();
  const searchParams = new URL(request.url).searchParams;

  const parsedParams = Array.from(searchParams.entries()).reduce(
    (acc, [key, value]) => {
      let parsedValue = value;
      try {
        parsedValue = JSON.parse(value);
      } catch {}

      acc[key] = parsedValue;
      return acc;
    },
    {} as Record<string, any>,
  );

  return uzeValidated(parsedParams, schema);
};

export const uzeValidatedParams = async <T>(schema: zod.ZodType<T>): Promise<T> => {
  const { request } = uzeContextInternal();
  return uzeValidated(request.params, schema);
};

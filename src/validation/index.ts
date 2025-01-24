import SendableError from "sendable-error";
import type * as zod from "zod";
import { uzeContextInternal } from "../Context";
import { parseZodError } from "./ValidationUtils";

export const uzeValidatedBody = async <T>(schema: zod.ZodType<T>) => {
  const { request } = uzeContextInternal();
  let body = {};

  try {
    body = await request.json();
  } catch {}
  try {
    return await schema.parseAsync(body);
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

export const uzeValidatedQuery = async <T>(schema: zod.ZodType<T>) => {
  const { request } = uzeContextInternal();
  try {
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

    return await schema.parseAsync(parsedParams);
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

export const uzeValidatedParams = async <T>(schema: zod.ZodType<T>) => {
  const { request } = uzeContextInternal();
  try {
    return await schema.parseAsync(request.params);
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

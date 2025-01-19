import type { ZodError, ZodIssue } from "zod";

interface ParsedValidationError {
  code: string;
  details: any;
  message: string;
}

export const parseZodError = (error: ZodError | ZodIssue): ParsedValidationError => {
  const mainError: any = error;

  if (!mainError.code) {
    const [childMainError, ...subErrors] = (mainError.unionErrors ?? mainError.errors).map(
      parseZodError,
    );
    if (subErrors.length) {
      childMainError.details.errors = subErrors;
    }
    return childMainError;
  }

  const code = `validation/${mainError.code.replace(/_/g, "-")}`;

  const details = {} as any;

  let message = mainError.message;
  if (message === "Required") {
    message = `Missing required field, expected '${mainError.expected}'`;
  }

  const subErrors = mainError.unionErrors ?? mainError.errors;

  if (subErrors?.length) {
    details.errors = subErrors.map(parseZodError);
  }

  const path = mainError.path.join(".");

  return {
    code: code,
    message: `${message}${path ? ` @ ${path}` : ""}`,
    details: {
      ...mainError,
      code: undefined,
      message: undefined,
      errors: undefined,
      unionErrors: undefined,
      ...details,
      path: path,
    },
  };
};

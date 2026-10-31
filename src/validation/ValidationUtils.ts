import type { ZodError, ZodIssue } from "zod";

/**
 * The codes a validation failure can have. They are uzeful's own, so a zod upgrade that renames or
 * adds issue codes cannot change what an API returns.
 */
export const VALIDATION_ERROR_CODES = {
  INVALID_TYPE: "validation/invalid-type",
  TOO_SMALL: "validation/too-small",
  TOO_BIG: "validation/too-big",
  INVALID_FORMAT: "validation/invalid-format",
  INVALID_VALUE: "validation/invalid-value",
  UNKNOWN_FIELD: "validation/unknown-field",
  UNSUPPORTED_CONTENT_TYPE: "validation/unsupported-content-type",
} as const;
export type ValidationErrorCode = (typeof VALIDATION_ERROR_CODES)[keyof typeof VALIDATION_ERROR_CODES];

const ISSUE_CODES: Partial<Record<ZodIssue["code"], ValidationErrorCode>> = {
  invalid_type: VALIDATION_ERROR_CODES.INVALID_TYPE,
  too_small: VALIDATION_ERROR_CODES.TOO_SMALL,
  too_big: VALIDATION_ERROR_CODES.TOO_BIG,
  invalid_format: VALIDATION_ERROR_CODES.INVALID_FORMAT,
  unrecognized_keys: VALIDATION_ERROR_CODES.UNKNOWN_FIELD,
};

interface ParsedValidationError {
  code: ValidationErrorCode;
  details: {
    path: string;
    issues: { path: string; message: string; code: ValidationErrorCode }[];
  };
  message: string;
}

const parseZodIssue = (issue: ZodIssue) => {
  return {
    path: issue.path.join("."),
    message: issue.message,
    // Unions, custom refinements, literals and everything else reject a value the field can't take.
    code: ISSUE_CODES[issue.code] ?? VALIDATION_ERROR_CODES.INVALID_VALUE,
  };
};

export const parseZodError = (error: ZodError): ParsedValidationError => {
  const mainError = error;
  const parsedIssues = mainError.issues.map(parseZodIssue);

  return {
    code: parsedIssues[0].code,
    message: parsedIssues[0].message,
    details: {
      path: parsedIssues[0].path,
      issues: parsedIssues,
    },
  };
};

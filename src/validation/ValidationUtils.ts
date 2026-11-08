import type { ZodError, ZodIssue } from "zod";

/**
 * The codes a validation failure can have. They are uzeful's own, so a zod upgrade that renames or
 * adds issue codes cannot change what an API returns. Every failed validation has the code
 * `INVALID_REQUEST`; each of its `details.issues` has one of the issue codes.
 */
export const VALIDATION_ERROR_CODES = {
  INVALID_REQUEST: "validation/invalid-request",
  INVALID_TYPE: "validation/invalid-type",
  TOO_SMALL: "validation/too-small",
  TOO_BIG: "validation/too-big",
  INVALID_FORMAT: "validation/invalid-format",
  INVALID_VALUE: "validation/invalid-value",
  UNKNOWN_FIELD: "validation/unknown-field",
} as const;
export type ValidationErrorCode = (typeof VALIDATION_ERROR_CODES)[keyof typeof VALIDATION_ERROR_CODES];
/** The code of one validation issue: every validation code but `INVALID_REQUEST`. */
export type ValidationIssueCode = Exclude<ValidationErrorCode, typeof VALIDATION_ERROR_CODES.INVALID_REQUEST>;

/** Request errors that aren't about the request's values. */
export const REQUEST_ERROR_CODES = {
  UNSUPPORTED_CONTENT_TYPE: "request/unsupported-content-type",
} as const;

const ISSUE_CODES: Partial<Record<ZodIssue["code"], ValidationIssueCode>> = {
  invalid_type: VALIDATION_ERROR_CODES.INVALID_TYPE,
  too_small: VALIDATION_ERROR_CODES.TOO_SMALL,
  too_big: VALIDATION_ERROR_CODES.TOO_BIG,
  invalid_format: VALIDATION_ERROR_CODES.INVALID_FORMAT,
  unrecognized_keys: VALIDATION_ERROR_CODES.UNKNOWN_FIELD,
};

interface ParsedValidationError {
  code: typeof VALIDATION_ERROR_CODES.INVALID_REQUEST;
  details: {
    issues: { path: string; message: string; code: ValidationIssueCode }[];
  };
  message: string;
}

type ParsedIssue = ParsedValidationError["details"]["issues"][number];

const parseZodIssue = (issue: ZodIssue, path: readonly PropertyKey[]): ParsedIssue => ({
  path: path.join("."),
  message: issue.message,
  // Unions, custom refinements, literals and everything else reject a value the field can't take.
  code: ISSUE_CODES[issue.code] ?? VALIDATION_ERROR_CODES.INVALID_VALUE,
});

interface FlatIssue {
  issue: ZodIssue;
  path: readonly PropertyKey[];
}

/**
 * The issues behind a failed union are those of the option the value came closest to: the one whose
 * deepest issue is furthest inside the value, then the one with the fewest issues. An object missing
 * one field of an option is reported as that missing field, not as "Invalid input" on the whole
 * union. A value no option gets further into than the union itself, such as a number for a union of
 * literals, keeps the union's own issue. Option issues are relative to the union, so they are
 * prefixed with its path.
 */
const flattenIssues = (issues: readonly ZodIssue[], prefix: readonly PropertyKey[]): FlatIssue[] =>
  issues.flatMap((issue) => {
    const path = [...prefix, ...issue.path];
    if (issue.code !== "invalid_union") return [{ issue, path }];
    let closest: FlatIssue[] = [{ issue, path }];
    let closestDepth = path.length;
    for (const option of issue.errors) {
      const flattened = flattenIssues(option, path);
      const optionDepth = Math.max(...flattened.map((flat) => flat.path.length));
      if (
        optionDepth > closestDepth ||
        (optionDepth === closestDepth && closest[0]?.issue !== issue && flattened.length < closest.length)
      ) {
        closest = flattened;
        closestDepth = optionDepth;
      }
    }
    return closest;
  });

export const parseZodError = (error: ZodError): ParsedValidationError => {
  const parsedIssues = flattenIssues(error.issues, []).map(({ issue, path }) => parseZodIssue(issue, path));

  // One code for every failed validation, so a request with several problems doesn't take its code
  // from whichever issue zod reported first; each issue keeps its own code.
  return {
    code: VALIDATION_ERROR_CODES.INVALID_REQUEST,
    message:
      parsedIssues.length === 1
        ? // The field comes first so the message alone says where to look.
          [parsedIssues[0].path, parsedIssues[0].message].filter(Boolean).join(": ")
        : `The request has ${parsedIssues.length} problems; details.issues lists each.`,
    details: { issues: parsedIssues },
  };
};

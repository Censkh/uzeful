import { prettifyError, treeifyError, ZodError, ZodIssue } from "zod";

interface ParsedValidationError {
  code: string;
  details: any;
  message: string;
}

const parseZodIssue = (issue: ZodIssue) => {
  return {
    path: issue.path.join("."),
    message: issue.message,
    code: issue.code ? `validation/${issue.code.replace(/_/g, "-")}` : "validation/validation-error",
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

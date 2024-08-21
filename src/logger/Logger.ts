//@ts-ignore
import chalk from "chalk";
import { ErrorCode, isSendableError, setErrorLogger } from "sendable-error";

export interface OutputOptions {
  out: typeof console;
  disableTime?: boolean;
  disableLevelLabel?: boolean;
}

const outputOptions: OutputOptions = {
  out: console,
  disableTime: process.env.NODE_ENV !== "production",
};

const ansiRegex = ({ onlyFirst = false } = {}) => {
  const pattern = [
    "[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)",
    "(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))",
  ].join("|");

  return new RegExp(pattern, onlyFirst ? undefined : "g");
};

const stripAnsi = (string: string) => {
  if (typeof string !== "string") {
    throw new TypeError(`Expected a \`string\`, got \`${typeof string}\``);
  }

  return string.replace(ansiRegex(), "");
};

export type Severity = "info" | "warn" | "error" | "debug";

const stringifyValue = (value: any) => {
  let resolvedValue = value;
  if (value && typeof value.message === "string") {
    resolvedValue = value.message;
  }
  return JSON.stringify(resolvedValue);
};

const generateInfoString = (info: any) => {
  if (info === null || info === undefined) {
    return "";
  }

  if (typeof info === "object" && info && Object.keys(info).length === 0) {
    return "";
  }

  return `: ${JSON.stringify(info, null, 1).replace(/\n/g, "")}`;

  /*
  if (typeof info !== "object") {
    return `: ${info.toString()}`;
  }
  const keys = Object.keys(info);
  if (keys.length === 0) {
    return "";
  }
  const strings = keys.map((key) => {
    const value = info[key];
    return `${key}: ${stringifyValue(value)}`;
  });
  return `: [ ${strings.join(", ")} ]`;*/
};

const plain = (text: string) => text;

export const colorFromLevel = (level: Severity): ((text: string) => string) => {
  if (process.env.NODE_ENV === "production") {
    return plain;
  }

  switch (level) {
    case "info":
      return chalk.blueBright;
    case "error":
      return chalk.redBright;
    case "warn":
      return chalk.yellowBright;
    default:
      return chalk.gray;
  }
};

const logError = (level: Severity, source: string, error: Error, options?: LogOptions) => {
  const code = ErrorCode.get(error);
  const errorInfo = { ...options?.errorInfo, code: code.getId(), message: error.message };

  if (isSendableError(error)) {
    Object.assign(errorInfo, { traceId: error.getTraceId(), details: error.getDetails() });
  }

  const lines = (error.stack || error.message || error).toString().split(/\n/g);

  writeMessage(
    level,
    source,
    `Caused by: ${lines[0]}${generateInfoString(errorInfo)}${lines.length > 1 ? `\n${lines.slice(1).join("\n")}` : ""}`,
  );
  const cause: Error | undefined = (error as any).cause;
  if (cause && cause !== error) {
    logError(level, source, cause, { ...options, errorInfo: undefined });
  }
};

export interface LogOptions {
  errorInfo?: any;
}

export const log = (
  level: Severity,
  source: string,
  message: string,
  info?: any,
  error?: Error,
  options?: LogOptions,
) => {
  writeMessage(level, source, `${message}${generateInfoString(info)}`);
  if (error) {
    logError(level, source, error, options);
  }
};

export const assert = (
  source: string,
  condition: boolean,
  message: string,
  info?: any,
  error?: Error,
  options?: LogOptions,
) => {
  if (!condition) {
    log("error", source, message, info, error, options);
  }
};

const formattedNow = () => {
  const string = new Date().toISOString();
  return string.replace(/T/, "").substring(0, string.indexOf(".") - 1);
};

export const enableTestLogging = () => {
  process.env.VERBOSE = "true";
};

const writeMessage = (level: Severity, source: string, message: string) => {
  if (process.env.NODE_ENV === "test" && /test/i.test(process.env.VERBOSE || "")) {
    return;
  }
  let out = outputOptions.out[level];
  if (!out) {
    out = console[level];
    out(`Logger output is missing '${level}' function`, outputOptions.out);
  }
  const prefix = colorFromLevel(level)(level.toString().substring(0, 1));

  message.split(/\n/g).forEach((text, index) => {
    const start = `${outputOptions.disableTime ? "" : `[${chalk.gray(formattedNow())}] `}${outputOptions.disableLevelLabel ? "" : `${prefix} `}${source} - `;
    out(`${index === 0 ? start : " ".repeat(stripAnsi(start).length)}${text}`);
  });
};

const createLogFunction = (level: Severity) => {
  return (source: string, message: string, info?: any, error?: Error, options?: { errorInfo?: any }) => {
    return log(level, source, message, info, error, options);
  };
};

export const info = createLogFunction("info");
export const warn = createLogFunction("warn");
export const debug = createLogFunction("debug");
export const error = createLogFunction("error");

export const logger = Object.assign(
  () => ({
    log,
    info,
    warn,
    debug,
    error,
    assert,
  }),
  {
    setOutput: (options: OutputOptions) => {
      Object.assign(outputOptions, options);
    },
  },
);

setErrorLogger(({ source, message, error, errorInfo, info }) => {
  return logger().error(source, message, info, error, { errorInfo: errorInfo });
});

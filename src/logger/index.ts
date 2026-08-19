import { uzeContextInternal } from "../Context";
import { Priority, uzeBeforeResponse, uzeRequestId } from "../index";
import type { BaseRequest, Middleware } from "../Types";
import { logger } from "./Logger";

export * from "./Logger";

export type RequestInfoGetter = (request: BaseRequest) => Record<string, string | number | undefined | null>;

const SENSITIVE_QUERY_PARAMETER_NAMES = new Set([
  "access_token",
  "api_key",
  "apikey",
  "authorization",
  "client_secret",
  "code",
  "id_token",
  "jwt",
  "key",
  "refresh_token",
  "session",
  "session_token",
  "sig",
  "signature",
  "token",
  "x-api-key",
]);

export const sanitizeRequestUrl = (requestUrl: string) => {
  try {
    const url = new URL(requestUrl);
    for (const [name] of url.searchParams) {
      if (SENSITIVE_QUERY_PARAMETER_NAMES.has(name.toLowerCase())) {
        url.searchParams.set(name, "REDACTED");
      }
    }
    return url.toString();
  } catch {
    return requestUrl;
  }
};

const DEFAULT_REQUEST_INFO_GETTER = (request: BaseRequest) => {
  // @ts-expect-error
  const lowercaseHeaders = request.headers.entries().reduce(
    (acc: any, [key, value]: any) => {
      acc[key.toLowerCase()] = value;
      return acc;
    },
    {} as Record<string, string>,
  );
  return {
    method: request.method.toUpperCase(),
    url: sanitizeRequestUrl(request.url),
    headers: {
      ...lowercaseHeaders,
      authorization: undefined,
      cookie: undefined,
      "api-key": undefined,
      "proxy-authorization": undefined,
      "x-auth-token": undefined,
      "x-api-key": undefined,
      "x-firebase-token": undefined,
    },
  };
};

export interface TraceMiddlewareOptions {
  requestInfoGetter?: RequestInfoGetter;
  extraRequestInfoGetter?: RequestInfoGetter;
}

export const traceMiddleware =
  (options?: TraceMiddlewareOptions): Middleware =>
  async () => {
    const requestInfoGetter = options?.requestInfoGetter ?? DEFAULT_REQUEST_INFO_GETTER;
    const { request, startMs } = uzeContextInternal();
    const requestUrl = sanitizeRequestUrl(request.url);

    const calculateRequestInfo = () => {
      const requestInfo: any = requestInfoGetter(request);
      if (options?.extraRequestInfoGetter) {
        Object.assign(requestInfo, options.extraRequestInfoGetter(request));
      }

      requestInfo.requestId = uzeRequestId();
      return requestInfo;
    };

    logger().info("App", `Calling ${request.method.toUpperCase()} ${requestUrl}`, calculateRequestInfo());

    uzeBeforeResponse(
      (response, error) => {
        const end = Date.now();
        const requestInfo = calculateRequestInfo();
        requestInfo.durationMs = end - startMs;
        if (error) {
          logger().error(
            "App",
            `Failed calling ${request.method.toUpperCase()} ${requestUrl} got status code ${response.status}`,
            {
              ...requestInfo,
              status: response.status,
            },
            error,
          );
        } else {
          logger().info(
            "App",
            `Success calling ${request.method.toUpperCase()} ${requestUrl} got status code ${response.status}`,
            {
              ...requestInfo,
              status: response.status,
            },
          );
        }
      },
      { priority: Priority.LATE },
    );
  };

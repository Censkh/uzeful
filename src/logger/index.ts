import { ErrorCode } from "sendable-error";
import { uzeContextInternal } from "../Context";
import { Priority, uzeBeforeResponse, uzeRequestId } from "../index";
import { RouteNotFoundError } from "../router/RouteNotFoundError";
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

const SENSITIVE_HEADER_NAMES = new Set([
  "api-key",
  "authorization",
  "cookie",
  "proxy-authorization",
  "x-api-key",
  "x-auth-token",
]);

/** Headers that carry the client's IP address, which is personal data and never logged. */
export const CLIENT_ADDRESS_HEADER_NAMES: ReadonlySet<string> = new Set([
  "cf-connecting-ip",
  "cf-connecting-ipv6",
  "cf-pseudo-ipv4",
  "forwarded",
  "true-client-ip",
  "x-client-ip",
  "x-cluster-client-ip",
  "x-forwarded-for",
  "x-real-ip",
]);

/** The URL with the values of credential parameters, and of `sensitiveParameters`, redacted. */
export const sanitizeRequestUrl = (requestUrl: string, sensitiveParameters: readonly string[] = []) => {
  try {
    const url = new URL(requestUrl);
    const extra = new Set(sensitiveParameters.map((name) => name.toLowerCase()));
    for (const [name] of url.searchParams) {
      const lowercaseName = name.toLowerCase();
      if (SENSITIVE_QUERY_PARAMETER_NAMES.has(lowercaseName) || extra.has(lowercaseName)) {
        url.searchParams.set(name, "REDACTED");
      }
    }
    return url.toString();
  } catch {
    return requestUrl;
  }
};

/** The headers without credentials, client IP addresses or `sensitiveHeaders`. */
export const sanitizeRequestHeaders = (headers: Record<string, string>, sensitiveHeaders: readonly string[] = []) => {
  const excludedNames = new Set([
    ...SENSITIVE_HEADER_NAMES,
    ...CLIENT_ADDRESS_HEADER_NAMES,
    ...sensitiveHeaders.map((name) => name.toLowerCase()),
  ]);
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !excludedNames.has(name.toLowerCase())));
};

const DEFAULT_REQUEST_INFO_GETTER = (request: BaseRequest, sensitiveHeaders?: readonly string[]) => {
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
    headers: sanitizeRequestHeaders(lowercaseHeaders, sensitiveHeaders),
  };
};

export interface TraceMiddlewareOptions {
  sensitiveHeaders?: readonly string[];
  /** Query parameters whose values are redacted from logged URLs, such as ones naming files. */
  sensitiveQueryParameters?: readonly string[];
  requestInfoGetter?: RequestInfoGetter;
  extraRequestInfoGetter?: RequestInfoGetter;
}

const ROUTE_NOT_FOUND_CODE = new RouteNotFoundError().getCode().getId();

/** The URL without its query, for lines about missing routes: their query is never useful. */
const withoutQuery = (url: string) => {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
};

export const traceMiddleware =
  (options?: TraceMiddlewareOptions): Middleware =>
  async () => {
    const requestInfoGetter =
      options?.requestInfoGetter ??
      ((request: BaseRequest) => DEFAULT_REQUEST_INFO_GETTER(request, options?.sensitiveHeaders));
    const { request, startMs } = uzeContextInternal();
    const requestUrl = sanitizeRequestUrl(request.url, options?.sensitiveQueryParameters);
    const method = request.method.toUpperCase();

    const calculateRequestInfo = () => {
      const requestInfo: any = requestInfoGetter(request);
      if (options?.extraRequestInfoGetter) {
        Object.assign(requestInfo, options.extraRequestInfoGetter(request));
      }
      if (typeof requestInfo.url === "string") {
        requestInfo.url = sanitizeRequestUrl(requestInfo.url, options?.sensitiveQueryParameters);
      }

      requestInfo.requestId = uzeRequestId();
      return requestInfo;
    };

    logger().info("App", `Calling ${method} ${requestUrl}`, calculateRequestInfo());

    // Only server errors (5xx, which unexpected exceptions become) are logged as errors. A client
    // error the handler meant to send (4xx, such as a validation error or a missing resource) is
    // expected: it is logged at warn with its code and status, without headers. A path nothing
    // serves (a route not found, or a 404 response such as a missing file) is logged at info
    // with its path only.
    uzeBeforeResponse(
      (response, error) => {
        const end = Date.now();
        const requestInfo = calculateRequestInfo();
        requestInfo.durationMs = end - startMs;
        const status = response.status;
        const code = error ? ErrorCode.get(error as Error).getId() : undefined;
        if (status === 404 && (!error || code === ROUTE_NOT_FOUND_CODE)) {
          logger().info("App", `Finished calling ${method} ${withoutQuery(requestUrl)} got status code 404`, {
            method,
            url: withoutQuery(requestUrl),
            requestId: requestInfo.requestId,
            durationMs: requestInfo.durationMs,
            status,
          });
        } else if (error && status < 500) {
          delete requestInfo.headers;
          logger().warn("App", `Finished calling ${method} ${requestUrl} got status code ${status}`, {
            ...requestInfo,
            status,
            code,
          });
        } else if (error || status >= 500) {
          logger().error(
            "App",
            `Failed calling ${method} ${requestUrl} got status code ${status}`,
            {
              ...requestInfo,
              status,
              ...(code ? { code } : {}),
            },
            error as Error | undefined,
          );
        } else {
          logger().info("App", `Success calling ${method} ${requestUrl} got status code ${status}`, {
            ...requestInfo,
            status,
          });
        }
      },
      { priority: Priority.LATE },
    );
  };

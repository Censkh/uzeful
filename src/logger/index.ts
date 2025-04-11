import { uzeContextInternal } from "../Context";
import { uzeAfter, uzeRequestId } from "../index";
import type { BaseRequest, Middleware } from "../Types";
import { logger } from "./Logger";

export * from "./Logger";

export type RequestInfoGetter = (request: BaseRequest) => Record<string, string | number | undefined | null>;
const DEFAULT_REQUEST_INFO_GETTER = (request: BaseRequest) => ({
  method: request.method.toUpperCase(),
  url: request.url,
});

export interface TraceMiddlewareOptions {
  requestInfoGetter?: RequestInfoGetter;
  extraRequestInfoGetter?: RequestInfoGetter;
}

export const traceMiddleware =
  (options?: TraceMiddlewareOptions): Middleware =>
  async () => {
    const requestInfoGetter = options?.requestInfoGetter ?? DEFAULT_REQUEST_INFO_GETTER;
    const { request, startMs } = uzeContextInternal();

    const calculateRequestInfo = () => {
      const requestInfo: any = requestInfoGetter(request);
      if (options?.extraRequestInfoGetter) {
        Object.assign(requestInfo, options.extraRequestInfoGetter(request));
      }

      requestInfo.requestId = uzeRequestId();
      return requestInfo;
    };

    logger().info("App", `Calling ${request.method.toUpperCase()} ${request.url}`, calculateRequestInfo());

    uzeAfter((response, error) => {
      const end = Date.now();
      const requestInfo = calculateRequestInfo();
      requestInfo.durationMs = end - startMs;
      if (error) {
        logger().error(
          "App",
          `Failed calling ${request.method.toUpperCase()} ${request.url} got status code ${response.status}`,
          {
            ...requestInfo,
            status: response.status,
          },
          error,
        );
      } else {
        logger().info(
          "App",
          `Success calling ${request.method.toUpperCase()} ${request.url} got status code ${response.status}`,
          {
            ...requestInfo,
            status: response.status,
          },
        );
      }
    });
  };

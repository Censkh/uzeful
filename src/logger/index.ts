import { uzeContextInternal } from "../Context";
import type { BaseRequest, Middleware } from "../Types";
import { uzeAfter } from "../index";
import { logger } from "./Logger";

export * from "./Logger";

export type RequestInfoGetter = (request: BaseRequest) => Record<string, string | number | undefined | null>;
const DEFAULT_REQUEST_INFO_GETTER = (request: BaseRequest) => ({
  method: request.method.toUpperCase(),
  url: request.url,
});

export interface TraceMiddlewareOptions {
  requestInfoGetter?: RequestInfoGetter;
}

export const traceMiddleware =
  (options?: TraceMiddlewareOptions): Middleware =>
  async () => {
    const requestInfoGetter = options?.requestInfoGetter ?? DEFAULT_REQUEST_INFO_GETTER;
    const { request } = await uzeContextInternal();
    const requestInfo = requestInfoGetter(request);

    logger().info("App", `Calling ${request.method.toUpperCase()} ${request.url}`, requestInfo);

    await uzeAfter((response, error) => {
      if (error) {
        logger().error(
          "App",
          `Failed calling ${request.method.toUpperCase()} ${request.url} get status code ${response.status}`,
          {
            ...requestInfo,
            status: response.status,
          },
          error,
        );
      } else {
        logger().info(
          "App",
          `Success calling ${request.method.toUpperCase()} ${request.url} get status code ${response.status}`,
          {
            ...requestInfo,
            status: response.status,
          },
        );
      }
    });
  };

import { type ContextOptions, createUzeContextHook, runWithContext } from "./Context";
import { errorToResponse } from "./ErrorHandling";
import { createStateKey, uzeState } from "./State";
import type { BaseRequest } from "./Types";
import { logger } from "./logger";

export { type Middleware, type Route } from "./Types";
export { SendableError, ErrorCode } from "sendable-error";
export { uzeState, type StateKey, createStateKey } from "./State";

export { Context, createUzeContextHook, runWithContext } from "./Context";

const isResponse = (response: Response | void): response is Response => response instanceof Response;

export interface Uze<TEnv, TRequest extends BaseRequest = Request> {
  handle: (options: ContextOptions<TEnv, TRequest>, handler: () => Promise<Response>) => Promise<Response>;
  hooks: {
    uzeContext: ReturnType<typeof createUzeContextHook<TEnv, TRequest>>;
  };
}

export interface UzeAdapter<TEnv, TRequest extends BaseRequest = Request> {
  handler: (request: TRequest) => Promise<Response>;
}

export const createUze = <TEnv, TRequest extends BaseRequest = Request>(): Uze<TEnv, TRequest> => {
  return {
    handle: async (options, handler) => {
      return await runWithContext<TEnv, TRequest>(options, async () => {
        let response: Response | undefined;
        try {
          response = await handler();
        } catch (error: any) {
          let response = errorToResponse(error);

          const [getAfterCallbacks] = await uzeState(AFTER_CALLBACKS);
          for (const callback of getAfterCallbacks()) {
            try {
              const newResponse = await callback(response, error);
              if (isResponse(newResponse)) {
                response = newResponse;
              }
            } catch (error: any) {
              logger().error("afterCallback", "Error in afterCallback", {}, error);
              return errorToResponse(error);
            }
          }
          return response;
        }
        if (!response) {
          throw new Error("No response");
        }
        const [getAfterCallbacks] = await uzeState(AFTER_CALLBACKS);
        for (const callback of getAfterCallbacks()) {
          try {
            const newResponse = await callback(response, undefined);
            if (isResponse(newResponse)) {
              response = newResponse;
            }
          } catch (error: any) {
            logger().error("afterCallback", "Error in afterCallback", {}, error);
            return errorToResponse(error);
          }
        }

        return response;
      });
    },
    hooks: {
      uzeContext: createUzeContextHook<TEnv, TRequest>(),
    },
  };
};

export type AfterCallback = (
  response: Response,
  error: Error | undefined,
) => Response | void | Promise<Response | void>;

const AFTER_CALLBACKS = createStateKey<AfterCallback[]>("afterCallbacks", () => []);

export const uzeAfter = async (callback: AfterCallback) => {
  const [getAfterCallbacks] = await uzeState(AFTER_CALLBACKS);

  getAfterCallbacks().push(callback);
};

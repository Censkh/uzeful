import { AFTER_CALLBACKS } from "./After";
import { createUzeContextHook, runWithContext } from "./Context";
import { errorToResponse } from "./ErrorHandling";
import { postProcessResponse } from "./PostProcessResponse";
import { uzeState } from "./State";
import type { BaseRequest, Uze } from "./Types";
import { isResponse } from "./Utils";
import { logger } from "./logger";

export const createUze = <TEnv, TRequest extends BaseRequest = Request>(): Uze<TEnv, TRequest> => {
  return {
    handle: async (options, handler) => {
      return await runWithContext<TEnv, TRequest>(options, async () => {
        let response: Response | undefined;

        try {
          response = await handler();
        } catch (error: any) {
          let response = errorToResponse(error);

          const [getAfterCallbacks] = uzeState(AFTER_CALLBACKS);
          for (const callback of getAfterCallbacks()) {
            try {
              const newResponse = await callback(response, error);
              if (isResponse(newResponse)) {
                response = newResponse;
              }
            } catch (error: any) {
              logger().error("afterCallback", "Error in afterCallback", {}, error);
              return postProcessResponse(errorToResponse(error));
            }
          }
          return postProcessResponse(response);
        }
        if (!response) {
          throw new Error("No response");
        }
        const [getAfterCallbacks] = uzeState(AFTER_CALLBACKS);
        for (const callback of getAfterCallbacks()) {
          try {
            const newResponse = await callback(response, undefined);
            if (isResponse(newResponse)) {
              response = newResponse;
            }
          } catch (error: any) {
            logger().error("afterCallback", "Error in afterCallback", {}, error);
            return postProcessResponse(errorToResponse(error));
          }
        }

        return postProcessResponse(response);
      });
    },
    hooks: {
      uzeContext: createUzeContextHook<TEnv, TRequest>(),
    },
  };
};

import SendableError from "sendable-error";
import { runAfterCallbacks } from "./After";
import { createUzeContextHook, runWithContext } from "./Context";
import type { BaseRequest, Uze } from "./Types";

export const createUzeful = <TEnv, TRequest extends BaseRequest = Request>(): Uze<TEnv, TRequest> => {
  const uzeful = {
    run: async (options, handler) => {
      const result = await runWithContext<any, TEnv, TRequest>(options, async () => {
        let result: any | undefined;

        try {
          result = (await handler()) as any;
        } catch (error: any) {
          const errorResponse = error instanceof Response ? error : SendableError.of(error).toResponse();
          const resolvedError = error instanceof Response ? (error as any).cause : error;
          return runAfterCallbacks(errorResponse, resolvedError);
        }
        return runAfterCallbacks(result, undefined);
      });
      return result;
    },
    fetch: async (options, handler) => {
      return await runWithContext<Response, TEnv, TRequest>(options, async () => {
        let response: Response | undefined;

        try {
          response = await handler();
        } catch (error: any) {
          const errorResponse = error instanceof Response ? error : SendableError.of(error).toResponse();
          const resolvedError = error instanceof Response ? (error as any).cause : error;
          return runAfterCallbacks(errorResponse, resolvedError);
        }
        if (!response) {
          throw new Error("No response");
        }
        return runAfterCallbacks(response, undefined);
      });
    },
    hooks: {
      uzeContext: createUzeContextHook<TEnv, TRequest>(),
    },
  } satisfies Uze<TEnv, TRequest>;

  return uzeful;
};

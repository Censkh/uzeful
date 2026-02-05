import SendableError from "sendable-error";
import { runAfterCallbacks } from "./After";
import { type Context, createUzeContextHook, runWithContext } from "./Context";
import type { KeyStore } from "./cache/KeyStore";
import { createStateKey, uzeState } from "./State";
import type { BaseRequest, Uze } from "./Types";

export type ContextType<TUze extends Uze<any, any>> =
  TUze extends Uze<infer TEnv, infer TRequest> ? Context<TEnv, TRequest> : never;

export interface CacheOptions<TEnv = any, TRequest extends BaseRequest = any> {
  createKeyStore: (context: Context<TEnv, TRequest>) => Promise<KeyStore>;
  getVersion: (context: Context<TEnv, TRequest>) => string;
  getKeyPrefix: (context: Context<TEnv, TRequest>) => string;
}

export interface UzefulOptions<TEnv = any, TRequest extends BaseRequest = any> {
  cache?: CacheOptions<TEnv, TRequest>;
}

// Internal state key for options
const UZEFUL_OPTIONS_KEY = createStateKey<UzefulOptions>("uzefulOptions");

// Internal hook to access options
export const uzeOptions = () => {
  const [getOptions] = uzeState(UZEFUL_OPTIONS_KEY);
  return getOptions() || {};
};

export const createUzeful = <TEnv, TRequest extends BaseRequest = Request>(
  options?: UzefulOptions<TEnv, TRequest>,
): Uze<TEnv, TRequest> => {
  const uzeful = {
    run: async (runOptions, handler) => {
      const result = await runWithContext<any, TEnv, TRequest>(runOptions, async () => {
        // Initialize options state available for this run
        if (options) {
          const [_, setOptions] = uzeState(UZEFUL_OPTIONS_KEY);
          setOptions(options);
        }

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
    fetch: async (runOptions, handler) => {
      return await runWithContext<Response, TEnv, TRequest>(runOptions, async () => {
        // Initialize options state available for this run
        if (options) {
          const [_, setOptions] = uzeState(UZEFUL_OPTIONS_KEY);
          setOptions(options);
        }

        let response: Response | undefined;

        try {
          response = await handler();
        } catch (error: any) {
          console.error("Error in run", error);
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

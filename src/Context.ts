import { AsyncLocalStorage } from "node:async_hooks";
import { setErrorLogger } from "sendable-error";
import type { BaseRequest } from "./Types";
import { logger } from "./logger/Logger";

export type WithParams<TRequest> = TRequest & {
  params?: Record<string, string>;
};

export interface Context<TEnv = unknown, TRequest extends BaseRequest = Request> {
  request: WithParams<TRequest>;
  env: TEnv;
  state: any;
  waitUntil: (promise: Promise<any>) => void;
  rawContext: any;
}

export type ContextOptions<TEnv = unknown, TRequest extends BaseRequest = Request> = Omit<
  Context<TEnv, TRequest>,
  "request" | "state"
> & {
  request: TRequest;
};

const contextStorage = new AsyncLocalStorage<Context>();

export const createUzeContextHook =
  <TEnv = unknown, TRequest extends BaseRequest = Request>() =>
  async (): Promise<Context<TEnv, TRequest>> => {
    const context = contextStorage.getStore();
    if (!context) {
      throw new Error("Cannot use context outside of a context block");
    }
    return context as any;
  };

export const runWithContext = async <TEnv, TRequest extends BaseRequest>(
  options: ContextOptions<TEnv, TRequest>,
  fn: () => Response | Promise<Response>,
) => {
  setErrorLogger((options) => {
    const { error, message, info, errorInfo, source } = options;
    logger().error(
      source,
      message,
      {
        ...info,
        ...errorInfo,
      },
      error,
    );
  });

  const context: Context = {
    ...options,
    // @ts-ignore
    request: options.request,
    state: {},
  };
  return contextStorage.run(context, fn);
};

export const uzeContextInternal = createUzeContextHook();

import { AsyncLocalStorage } from "node:async_hooks";
import { setErrorLogger } from "sendable-error";
import { logger } from "./logger/Logger";
import type { BaseRequest } from "./Types";

export type WithParams<TRequest> = TRequest & {
  params?: Record<string, string>;
};

export interface Context<TEnv = unknown, TRequest extends BaseRequest = Request> {
  request: WithParams<TRequest>;
  startMs: number;
  env: TEnv;
  state: unknown;
  waitUntil: (promise: Promise<any>) => void;
  rawContext: any;
}

export type ContextOptions<TEnv = unknown, TRequest extends BaseRequest = Request> = Omit<
  Context<TEnv, TRequest>,
  "request" | "state" | "startMs" | "waitUntil" | "rawContext"
> & {
  waitUntil?: (promise: Promise<any>) => void;
  rawContext?: any;
  request: TRequest;
};

const CONTEXT_STORAGE = new AsyncLocalStorage<Context>();

export const createUzeContextHook =
  <TEnv = unknown, TRequest extends BaseRequest = Request>() =>
  (): Context<TEnv, TRequest> => {
    const context = CONTEXT_STORAGE.getStore();
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
    const { error, message, info, errorInfo } = options;
    logger().error(
      "Error",
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
    startMs: Date.now(),
    // @ts-ignore
    request: options.request,
    state: {},
  };
  return CONTEXT_STORAGE.run(context, fn);
};

export const uzeContextInternal = createUzeContextHook();

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
  waitUntil: (promiseOrFunction: Promise<any> | (() => Promise<any>), label?: string) => void;
  rawContext: any;
}

export type ContextOptions<TEnv = unknown, TRequest extends BaseRequest = Request> = Omit<
  Context<TEnv, TRequest>,
  "request" | "state" | "startMs" | "waitUntil" | "rawContext"
> & {
  waitUntil: (promise: Promise<any>) => void;
  rawContext?: any;
  request: TRequest;
};

const CONTEXT_STORAGE = new AsyncLocalStorage<Context>();

export const createUzeContextHook =
  <TEnv = unknown, TRequest extends BaseRequest = Request>() =>
  (): Context<TEnv, TRequest> => {
    const context = CONTEXT_STORAGE.getStore();
    if (!context) {
      throw new Error(`Cannot use context outside of a context block: ${new Error().stack}`);
    }
    return context as any;
  };

const quickId = () => {
  return Math.random().toString(36).substring(2, 15);
};

export const runWithContext = async <TResult, TEnv, TRequest extends BaseRequest>(
  options: ContextOptions<TEnv, TRequest>,
  fn: () => TResult | Promise<TResult>,
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

  const { request, waitUntil, ...otherOptions } = options;

  const context = {
    ...otherOptions,
    waitUntil: (promiseOrFunction, label) => {
      const promise = typeof promiseOrFunction === "function" ? promiseOrFunction() : promiseOrFunction;
      const id = label ? `${label} (${quickId()})` : quickId();
      logger().debug("waitUntil", "Promise started", { id });
      promise.finally(() => {
        logger().debug("waitUntil", "Promise finished", { id });
      });
      waitUntil(promise);
    },
    startMs: Date.now(),
    // @ts-ignore
    request: request,
    state: {},
  } satisfies Context;
  return CONTEXT_STORAGE.run(context as any, fn);
};

export const uzeContextInternal = createUzeContextHook();

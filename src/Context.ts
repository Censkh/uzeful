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

export interface UzeTestContext {
  cleanup: () => Promise<void>;
  drainWaitUntils: () => Promise<void>;
}

export type ContextOptions<TEnv = unknown, TRequest extends BaseRequest = Request> = Omit<
  Context<TEnv, TRequest>,
  "request" | "state" | "startMs" | "waitUntil" | "rawContext"
> & {
  waitUntil: (promise: Promise<any>) => void;
  rawContext?: any;
  request: TRequest;
  state?: unknown;
};

const CONTEXT_STORAGE = new AsyncLocalStorage<Context>();

type UzefulInternal = {
  waitUntilErrors: unknown[];
  waitUntilPendingPromises: Set<Promise<unknown>>;
};

const UZEFUL_INTERNAL = Symbol("uzeful.internal");

const getUzefulInternal = <TEnv, TRequest extends BaseRequest>(context: Context<TEnv, TRequest>): UzefulInternal => {
  const internalContext = context as Context<TEnv, TRequest> & {
    [UZEFUL_INTERNAL]?: UzefulInternal;
  };
  return (internalContext[UZEFUL_INTERNAL] ??= {
    waitUntilErrors: [],
    waitUntilPendingPromises: new Set(),
  });
};

export const getCurrentUzeContext = () => CONTEXT_STORAGE.getStore();

export const createUzeContextHook =
  <TEnv = unknown, TRequest extends BaseRequest = Request>() =>
  (): Context<TEnv, TRequest> => {
    const context = CONTEXT_STORAGE.getStore();
    if (!context) {
      throw new Error(`Cannot use context outside of a context block: ${new Error().stack}`);
    }
    return context as any;
  };

export const uzeTestContext = (): UzeTestContext => {
  const context = CONTEXT_STORAGE.getStore();
  if (!context?.rawContext?.__uzeTestContext) {
    throw new Error(`Cannot use test context outside of a test context block: ${new Error().stack}`);
  }

  const drainWaitUntils = async () => {
    const internal = getUzefulInternal(context);
    while (internal.waitUntilPendingPromises.size > 0) {
      await Promise.allSettled(internal.waitUntilPendingPromises);
    }
    if (internal.waitUntilErrors.length > 0) {
      throw internal.waitUntilErrors[0];
    }
  };

  return {
    cleanup: drainWaitUntils,
    drainWaitUntils,
  };
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

  const { request, waitUntil, state, rawContext, ...otherOptions } = options;
  const context: Context<TEnv, TRequest> = {
    ...otherOptions,
    rawContext,
    waitUntil: (promiseOrFunction, label) => {
      const promiseOrThenable =
        typeof promiseOrFunction === "function" && typeof (promiseOrFunction as { then?: unknown }).then !== "function"
          ? promiseOrFunction()
          : promiseOrFunction;
      const promise = Promise.resolve(promiseOrThenable);
      const id = label ? `${label} (${quickId()})` : quickId();
      const internal = getUzefulInternal(context);
      internal.waitUntilPendingPromises.add(promise);
      promise.then(
        () => internal.waitUntilPendingPromises.delete(promise),
        (error) => {
          internal.waitUntilPendingPromises.delete(promise);
          internal.waitUntilErrors.push(error);
          logger().error("waitUntil", "Promise failed with error: ", { id }, error);
        },
      );
      waitUntil(promise);
    },
    startMs: Date.now(),
    request: request as WithParams<TRequest>,
    state: state ?? {},
  };
  return CONTEXT_STORAGE.run(context as unknown as Context, fn);
};

export const uzeContextInternal: <TEnv = unknown, TRequest extends BaseRequest = Request>() => Context<TEnv, TRequest> =
  createUzeContextHook();

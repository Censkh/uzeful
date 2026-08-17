import SendableError from "sendable-error";
import { runAfterCallbacks } from "./After";
import {
  type Context,
  type ContextOptions,
  createUzeContextHook,
  getCurrentUzeContext,
  runWithContext,
  uzeTestContext,
} from "./Context";
import type { CacheStoreType } from "./cache/CacheHooks";
import type { KeyStore } from "./cache/KeyStore";
import { createStateKey, uzeRequestState } from "./State";
import type { BaseRequest, UzeTestOptions } from "./Types";

export type ContextType<TUzeful extends UzefulApp<any, any>> =
  TUzeful extends UzefulApp<infer TEnv, infer TRequest> ? Context<TEnv, TRequest> : never;

export type CacheStoreFactory<TEnv = any, TRequest extends BaseRequest = any> = (
  context: Context<TEnv, TRequest>,
) => Promise<KeyStore>;

export interface CacheOptions<TEnv = any, TRequest extends BaseRequest = any> {
  stores: Partial<Record<CacheStoreType, CacheStoreFactory<TEnv, TRequest>>>;
  getVersion: (context: Context<TEnv, TRequest>) => string;
  getKeyPrefix: (context: Context<TEnv, TRequest>) => string;
}

export interface UzefulAppOptions<TEnv = any, TRequest extends BaseRequest = any> {
  cache?: CacheOptions<TEnv, TRequest>;
  debug?: boolean | ((context: Context<TEnv, TRequest>) => boolean);
}

const UZEFUL_OPTIONS_KEY = createStateKey<UzefulAppOptions>("uzefulOptions");

export const uzeOptions = () => {
  const [getOptions] = uzeRequestState(UZEFUL_OPTIONS_KEY);
  return getOptions() || {};
};

export class UzefulApp<TEnv, TRequest extends BaseRequest = Request> {
  readonly hooks = {
    uzeContext: createUzeContextHook<TEnv, TRequest>(),
  };

  constructor(private readonly options?: UzefulAppOptions<TEnv, TRequest>) {}

  async execute<T>(runOptions: ContextOptions<TEnv, TRequest>, handler: () => Promise<T>): Promise<T> {
    return await runWithContext<T, TEnv, TRequest>(this.withInheritedTestContext(runOptions), async () => {
      this.initializeOptions();
      const result = await handler();
      if (result instanceof Response) {
        return (await runAfterCallbacks(result, undefined)) as T;
      }
      await runAfterCallbacks(new Response(), undefined);
      return result;
    });
  }

  async dispatch(runOptions: ContextOptions<TEnv, TRequest>, handler: () => Promise<Response>): Promise<Response> {
    return await runWithContext<Response, TEnv, TRequest>(this.withInheritedTestContext(runOptions), async () => {
      this.initializeOptions();

      try {
        const response = await handler();
        if (!response) {
          throw new Error("No response");
        }
        return runAfterCallbacks(response, undefined);
      } catch (error: any) {
        const errorResponse = error instanceof Response ? error : SendableError.of(error).toResponse();
        const resolvedError = error instanceof Response ? (error as any).cause : error;
        return runAfterCallbacks(errorResponse, resolvedError);
      }
    });
  }

  async test<T>(options: UzeTestOptions<TEnv>, handler: () => Promise<T>): Promise<T> {
    let cleanup: (() => Promise<void>) | undefined;
    try {
      return await this.execute(
        {
          request: undefined as any,
          env: options.env,
          state: options.state,
          waitUntil: () => {},
          rawContext: { __uzeTestContext: true },
        },
        async () => {
          cleanup = uzeTestContext().cleanup;
          return await handler();
        },
      );
    } finally {
      await cleanup?.();
    }
  }

  private initializeOptions() {
    if (!this.options) {
      return;
    }
    const [, setOptions] = uzeRequestState(UZEFUL_OPTIONS_KEY);
    setOptions(this.options);
  }

  private withInheritedTestContext(runOptions: ContextOptions<TEnv, TRequest>) {
    const currentContext = getCurrentUzeContext();
    if (!currentContext?.rawContext?.__uzeTestContext) {
      return runOptions;
    }

    return {
      ...runOptions,
      state: runOptions.state ?? currentContext.state,
    };
  }
}

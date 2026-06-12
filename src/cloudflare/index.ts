import { createStateKey, uzeRequestState } from "..";
import { createUzeful } from "../CreateUzeful";
import type { BaseRequest, Uze } from "../Types";

export * from "./CloudflareCacheKeyStore";

export const cloudflareFetch = <TEnv, TRequest extends BaseRequest = Request>(
  uze: Uze<TEnv, TRequest>,
  handler: () => Promise<Response>,
) => {
  return async (
    request: TRequest,
    env: TEnv,
    context: { waitUntil: (p: Promise<any>) => void } & Record<string, any>,
  ) => {
    return await uze.fetch(
      {
        request,
        env,
        waitUntil: context.waitUntil.bind(context),
        rawContext: context,
      },
      handler,
    );
  };
};

export const cloudflareRun = <TEnv, TRequest extends BaseRequest = Request>(
  uze: Uze<TEnv, TRequest>,
  handler: () => Promise<void>,
) => {
  return async (env: TEnv, context: { waitUntil: (p: Promise<any>) => void } & Record<string, any>) => {
    return await uze.run(
      {
        request: undefined as any,
        env,
        waitUntil: context.waitUntil.bind(context),
        rawContext: context,
      },
      handler,
    );
  };
};

const QUEUE_STATE_KEY = createStateKey<Record<string, any>>("cloudflare-queue-state");

export const uzeCloudflareQueue = () => {
  const [getQueueState, setQueueState] = uzeRequestState(QUEUE_STATE_KEY);
  return getQueueState();
};

export const cloudflareQueue = <TEnv, TRequest extends BaseRequest = Request>(
  uze: Uze<TEnv, TRequest>,
  handler: () => Promise<void>,
) => {
  return async (
    batch: { messages: ReadonlyArray<{ body: unknown }> },
    env: TEnv,
    context: { waitUntil: (p: Promise<any>) => void } & Record<string, any>,
  ) => {
    return await uze.run(
      {
        request: undefined as any,
        env,
        waitUntil: context.waitUntil.bind(context),
        rawContext: context,
      },
      async () => {
        const [getQueueState, setQueueState] = uzeRequestState(QUEUE_STATE_KEY);
        setQueueState({
          messages: batch.messages,
        });
        await handler();
      },
    );
  };
};

/**
 * Helper function for running tests with Cloudflare test environment
 * Allows using uze hooks in test context
 */
export const cloudflareTest = async <TEnv, TReturn>(env: TEnv, handler: () => Promise<TReturn>): Promise<TReturn> => {
  const uze = createUzeful<TEnv, Request>();
  const waitUntilPromises: Promise<any>[] = [];

  const context = {
    __uzeTestContext: true,
    waitUntil: (promise: Promise<any>) => {
      waitUntilPromises.push(promise);
    },
  };

  const result = await uze.run(
    {
      request: undefined as any,
      env,
      waitUntil: context.waitUntil,
      rawContext: context,
    },
    handler,
  );

  while (waitUntilPromises.length > 0) {
    const batch = waitUntilPromises.splice(0);
    await Promise.all(batch);
  }

  return result;
};

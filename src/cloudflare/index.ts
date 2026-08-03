import { createStateKey, uzeRequestState } from "..";
import type { BaseRequest } from "../Types";
import { UzefulApp } from "../UzefulApp";

export * from "./CloudflareCacheKeyStore";

const QUEUE_STATE_KEY = createStateKey<Record<string, any>>("cloudflare-queue-state");

export const uzeCloudflareQueue = () => {
  const [getQueueState, setQueueState] = uzeRequestState(QUEUE_STATE_KEY);
  return getQueueState();
};

export class CloudflareUzefulApp<TEnv, TRequest extends BaseRequest = Request> extends UzefulApp<TEnv, TRequest> {
  fetch(handler: () => Promise<Response>) {
    return async (
      request: TRequest,
      env: TEnv,
      context: { waitUntil: (promise: Promise<any>) => void } & Record<string, any>,
    ) => {
      return await this.dispatch(
        {
          request,
          env,
          waitUntil: context.waitUntil.bind(context),
          rawContext: context,
        },
        handler,
      );
    };
  }

  run(handler: () => Promise<void>) {
    return async (env: TEnv, context: { waitUntil: (promise: Promise<any>) => void } & Record<string, any>) => {
      return await this.execute(
        {
          request: undefined as any,
          env,
          waitUntil: context.waitUntil.bind(context),
          rawContext: context,
        },
        handler,
      );
    };
  }

  queue(handler: () => Promise<void>) {
    return async (
      batch: { messages: ReadonlyArray<{ body: unknown }> },
      env: TEnv,
      context: { waitUntil: (promise: Promise<any>) => void } & Record<string, any>,
    ) => {
      return await this.execute(
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
  }
}

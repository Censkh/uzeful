import type { BaseRequest } from "../Types";
import { UzefulApp } from "../UzefulApp";

export interface BunUzefulFetchOptions<TEnv, TRequest extends BaseRequest, TServer = unknown> {
  getEnv: (request: TRequest, server?: TServer) => TEnv | Promise<TEnv>;
  waitUntil?: (promise: Promise<unknown>) => void;
  getRawContext?: (request: TRequest, server?: TServer) => unknown;
}

export class BunUzefulApp<TEnv, TRequest extends BaseRequest = Request> extends UzefulApp<TEnv, TRequest> {
  fetch<TServer = unknown>(handler: () => Promise<Response>, options: BunUzefulFetchOptions<TEnv, TRequest, TServer>) {
    return async (request: TRequest, server?: TServer): Promise<Response> => {
      return await this.dispatch(
        {
          request,
          env: await options.getEnv(request, server),
          waitUntil:
            options.waitUntil ??
            ((promise) => {
              void promise.catch(console.error);
            }),
          rawContext: options.getRawContext?.(request, server) ?? { server },
        },
        handler,
      );
    };
  }
}

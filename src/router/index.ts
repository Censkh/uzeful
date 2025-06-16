import { AutoRouter, type AutoRouterType, type IRequest } from "itty-router";
import { uzeContextInternal } from "../Context";
import type { Route } from "../Types";

export interface RouterOptions {
  base?: string;
}

export type Router = Omit<AutoRouterType<IRequest, [], any>, "fetch"> & {
  fetch: () => Promise<Response>;
};

export const createRouter = (options?: RouterOptions): Router => {
  const router = AutoRouter({
    base: options?.base,

    catch: (error) => {
      throw error;
    },
  });
  const originalFetch = router.fetch;
  router.fetch = async () => {
    const { request } = uzeContextInternal();
    return originalFetch(request);
  };

  return router as any;
};

export const lazyRoute = (loader: () => Promise<{ default: Route }>): Route => {
  let routePromise: Promise<{ default: Route }>;
  return async () => {
    const route = await (routePromise || (routePromise = loader()));
    const response: Response = await route.default();

    return response;
  };
};

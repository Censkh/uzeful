import { AutoRouter, type AutoRouterType } from "itty-router";
import { uzeContextInternal } from "../Context";
import type { Route } from "../Types";

export interface RouterOptions {
  base?: string;
}

export type Router = Omit<AutoRouterType, "fetch"> & {
  handler: () => Promise<Response>;
};

export const createRouter = (options?: RouterOptions): Router => {
  const router = AutoRouter({
    base: options?.base,

    catch: (error) => {
      throw error;
    },
  });
  router.handler = async () => {
    const { request } = uzeContextInternal();
    return router.fetch(request);
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

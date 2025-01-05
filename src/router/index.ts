import {AutoRouter, type AutoRouterType} from "itty-router";
import {uzeContextInternal} from "../Context";

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

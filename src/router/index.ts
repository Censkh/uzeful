import { AutoRouter } from "itty-router";
import { uzeContextInternal } from "../Context";

export interface RouterOptions {
  base?: string;
}

export type Router = Omit<typeof AutoRouter, "fetch"> & {
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
    const { request } = await uzeContextInternal();
    return router.fetch(request);
  };

  return router as any;
};

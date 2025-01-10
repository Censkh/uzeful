import { createStateKey, uzeState } from "./State";

export type AfterCallback = (
  response: Response,
  error: Error | undefined,
) => Response | void | Promise<Response | void>;

export const AFTER_CALLBACKS = createStateKey<AfterCallback[]>("afterCallbacks", () => []);

export const uzeAfter = (callback: AfterCallback) => {
  const [getAfterCallbacks] = uzeState(AFTER_CALLBACKS);

  getAfterCallbacks().unshift(callback);
};

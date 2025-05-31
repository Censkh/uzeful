import SendableError from "sendable-error";
import { logger } from "./logger";
import { postProcessResponse } from "./PostProcessResponse";
import { createStateKey, uzeState } from "./State";
import { isResponse } from "./Utils";

export enum Priority {
  LAST = -2,
  LATE = -1,
  NORMAL = 0,
  EARLY = 1,
  FIRST = 2,
}

export type AfterCallback = (
  response: Response,
  error: Error | undefined,
) => Response | void | Promise<Response | void>;

type AfterCallbacksByPriority = Record<Priority, AfterCallback[]>;

export const AFTER_CALLBACKS = createStateKey<AfterCallbacksByPriority>("afterCallbacks", () => ({
  [Priority.LAST]: [],
  [Priority.LATE]: [],
  [Priority.NORMAL]: [],
  [Priority.EARLY]: [],
  [Priority.FIRST]: [],
}));

export interface AfterOptions {
  priority?: Priority;
}

export const uzeAfter = (callback: AfterCallback, options: AfterOptions = {}) => {
  const [getAfterCallbacks] = uzeState(AFTER_CALLBACKS);
  const callbacks = getAfterCallbacks();
  const priority = options.priority ?? Priority.NORMAL;
  callbacks[priority].push(callback);
};

export const runAfterCallbacks = async (response: Response, error: Error | undefined): Promise<Response> => {
  const [getAfterCallbacks] = uzeState(AFTER_CALLBACKS);
  const callbacks = getAfterCallbacks();

  // Execute callbacks in priority order from highest to lowest
  for (const priority of [Priority.FIRST, Priority.EARLY, Priority.NORMAL, Priority.LATE, Priority.LAST]) {
    for (const callback of callbacks[priority]) {
      console.log(callback.toString());
      try {
        const newResponse = await callback(response, error);
        if (isResponse(newResponse)) {
          response = newResponse;
        }
      } catch (error: any) {
        logger().error("afterCallback", "Error in afterCallback", {}, error);
        return postProcessResponse(SendableError.of(error).toResponse());
      }
    }
  }

  return postProcessResponse(response);
};

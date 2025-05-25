import SendableError from "sendable-error";
import { logger } from "./logger";
import { postProcessResponse } from "./PostProcessResponse";
import { createStateKey, uzeState } from "./State";
import { isResponse } from "./Utils";

export enum Priority {
  LOWEST = -2,
  LOW = -1,
  NORMAL = 0,
  HIGH = 1,
  HIGHEST = 2,
}

export type AfterCallback = (
  response: Response,
  error: Error | undefined,
) => Response | void | Promise<Response | void>;

type AfterCallbacksByPriority = Record<Priority, AfterCallback[]>;

export const AFTER_CALLBACKS = createStateKey<AfterCallbacksByPriority>("afterCallbacks", () => ({
  [Priority.LOWEST]: [],
  [Priority.LOW]: [],
  [Priority.NORMAL]: [],
  [Priority.HIGH]: [],
  [Priority.HIGHEST]: [],
}));

export const uzeAfter = (callback: AfterCallback, priority: Priority = Priority.NORMAL) => {
  const [getAfterCallbacks] = uzeState(AFTER_CALLBACKS);
  const callbacks = getAfterCallbacks();
  callbacks[priority].push(callback);
};

export const runAfterCallbacks = async (response: Response, error: Error | undefined): Promise<Response> => {
  const [getAfterCallbacks] = uzeState(AFTER_CALLBACKS);
  const callbacks = getAfterCallbacks();

  // Execute callbacks in priority order from highest to lowest
  for (const priority of [Priority.HIGHEST, Priority.HIGH, Priority.NORMAL, Priority.LOW, Priority.LOWEST]) {
    for (const callback of callbacks[priority]) {
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

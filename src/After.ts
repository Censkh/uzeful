import SendableError from "sendable-error";
import { uzeScheduleWaitUntil, waitForUzeWaitUntils } from "./Context";
import { logger } from "./logger";
import { postProcessResponse } from "./PostProcessResponse";
import { createStateKey, uzeRequestState } from "./State";
import { isResponse } from "./Utils";

export enum Priority {
  LAST = -2,
  LATE = -1,
  NORMAL = 0,
  EARLY = 1,
  FIRST = 2,
}

export type BeforeResponseCallback = (
  response: Response,
  error: Error | undefined,
) => Response | void | Promise<Response | void>;

export type AfterWaitUntilsCallback = (response: Response, error: Error | undefined) => void | Promise<void>;

type BeforeResponseCallbacksByPriority = Record<Priority, BeforeResponseCallback[]>;
type AfterWaitUntilsCallbacksByPriority = Record<Priority, AfterWaitUntilsCallback[]>;

export const BEFORE_RESPONSE_CALLBACKS = createStateKey<BeforeResponseCallbacksByPriority>(
  "beforeResponseCallbacks",
  () => ({
    [Priority.LAST]: [],
    [Priority.LATE]: [],
    [Priority.NORMAL]: [],
    [Priority.EARLY]: [],
    [Priority.FIRST]: [],
  }),
);

export const AFTER_WAIT_UNTILS_CALLBACKS = createStateKey<AfterWaitUntilsCallbacksByPriority>(
  "afterWaitUntilsCallbacks",
  () => ({
    [Priority.LAST]: [],
    [Priority.LATE]: [],
    [Priority.NORMAL]: [],
    [Priority.EARLY]: [],
    [Priority.FIRST]: [],
  }),
);

export interface AfterOptions {
  priority?: Priority;
}

export const uzeBeforeResponse = (callback: BeforeResponseCallback, options: AfterOptions = {}) => {
  const [getBeforeResponseCallbacks] = uzeRequestState(BEFORE_RESPONSE_CALLBACKS);
  const callbacks = getBeforeResponseCallbacks();
  const priority = options.priority ?? Priority.NORMAL;
  callbacks[priority].push(callback);
};

export const uzeAfterWaitUntils = (callback: AfterWaitUntilsCallback, options: AfterOptions = {}) => {
  const [getAfterWaitUntilsCallbacks] = uzeRequestState(AFTER_WAIT_UNTILS_CALLBACKS);
  const callbacks = getAfterWaitUntilsCallbacks();
  const priority = options.priority ?? Priority.NORMAL;
  callbacks[priority].push(callback);
};

export const runBeforeResponseCallbacks = async (response: Response, error: Error | undefined): Promise<Response> => {
  const [getBeforeResponseCallbacks] = uzeRequestState(BEFORE_RESPONSE_CALLBACKS);
  const callbacks = getBeforeResponseCallbacks();

  // Execute callbacks in priority order from highest to lowest
  for (const priority of [Priority.FIRST, Priority.EARLY, Priority.NORMAL, Priority.LATE, Priority.LAST]) {
    for (const callback of callbacks[priority]) {
      try {
        const newResponse = await callback(response, error);
        if (isResponse(newResponse)) {
          response = newResponse;
        }
      } catch (error: any) {
        logger().error("afterCallback", "Error in afterCallback", {}, error);
        return await postProcessResponse(SendableError.of(error).toResponse());
      }
    }
  }
  return await postProcessResponse(response);
};

export const scheduleAfterWaitUntilCallbacks = (response: Response, error: Error | undefined) => {
  const [getAfterWaitUntilsCallbacks] = uzeRequestState(AFTER_WAIT_UNTILS_CALLBACKS);
  const callbacks = getAfterWaitUntilsCallbacks();
  if (Object.values(callbacks).every((callbacksAtPriority) => callbacksAtPriority.length === 0)) {
    return;
  }

  let callbackPromise!: Promise<void>;
  callbackPromise = new Promise<void>((resolve) => setTimeout(resolve, 0)).then(async () => {
    await waitForUzeWaitUntils(callbackPromise);
    for (const priority of [Priority.FIRST, Priority.EARLY, Priority.NORMAL, Priority.LATE, Priority.LAST]) {
      for (const callback of callbacks[priority]) {
        await callback(response, error);
      }
    }
  });
  uzeScheduleWaitUntil(callbackPromise, "After waitUntil callbacks");
};

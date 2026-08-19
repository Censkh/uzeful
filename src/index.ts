import type { Router } from "./router";

export { type BaseErrorCode, ErrorCode, SendableError } from "sendable-error";
export { Priority, uzeAfterWaitUntils, uzeBeforeResponse } from "./After";
export * from "./BuiltinHooks";
export {
  type Context,
  type ContextOptions,
  createUzeContextHook,
  runWithContext,
  type UzeTestContext,
  uzeContextInternal,
  uzeTestContext,
} from "./Context";
export { uzeCookies } from "./Cookies";
export { uzeResponseModifier } from "./PostProcessResponse";
export { createStateKey, type StateKey, uzeRequestState, uzeSharedState } from "./State";
export type { CookieStore, Middleware, Route } from "./Types";
export { type ContextType, UzefulApp, type UzefulAppOptions } from "./UzefulApp";

export function openApiEntry(router: Router) {
  // used for static analysis
}

import type { Router } from "./router";

export { ErrorCode, SendableError } from "sendable-error";
export { Priority, uzeAfter } from "./After";
export * from "./BuiltinHooks";
export { type Context, createUzeContextHook } from "./Context";
export { uzeCookies } from "./Cookies";
export { createUzeful } from "./CreateUzeful";
export { uzeResponseModifier } from "./PostProcessResponse";
export { createStateKey, type StateKey, uzeSharedState, uzeState } from "./State";
export type { CookieStore, Middleware, Route, Uze, UzeAdapter } from "./Types";

export function openApiEntry(router: Router) {
  // used for static analysis
}

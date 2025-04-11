import type { Router } from "./router";

export { ErrorCode, SendableError } from "sendable-error";
export { uzeAfter } from "./After";
export * from "./BuiltinHooks";
export { type Context, createUzeContextHook, runWithContext } from "./Context";
export { createUze } from "./CreateUze";
export { uzeSetHeaders } from "./PostProcessResponse";
export { createStateKey, type StateKey, uzeState } from "./State";
export type { Middleware, Route, Uze, UzeAdapter } from "./Types";

export function openApiEntry(router: Router) {
  // used for static analysis
}

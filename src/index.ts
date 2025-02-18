import type { Router } from "./router";

export type { Middleware, Route, Uze, UzeAdapter } from "./Types";
export { SendableError, ErrorCode } from "sendable-error";
export { uzeState, type StateKey, createStateKey } from "./State";
export { uzeAfter } from "./After";
export { uzeSetHeaders } from "./PostProcessResponse";

export * from "./BuiltinHooks";

export { type Context, createUzeContextHook, runWithContext } from "./Context";

export { createUze } from "./CreateUze";

export function openApiEntry(router: Router) {
  // used for static analysis
}

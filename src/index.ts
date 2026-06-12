import type { SendableError as SendableErrorType } from "sendable-error";
import type { Router } from "./router";

export { ErrorCode, SendableError } from "sendable-error";

export interface BaseErrorCode {
  getId(): string;
  getDefaultMessage(): string | undefined;
  is(error: any): error is SendableErrorType;
  getStatus(): number | undefined;
}
export { Priority, uzeAfter } from "./After";
export * from "./BuiltinHooks";
export {
  type Context,
  type ContextOptions,
  createUzeContextHook,
  runWithContext,
  uzeContext,
} from "./Context";
export { uzeCookies } from "./Cookies";
export { type ContextType, createUzeful } from "./CreateUzeful";
export { uzeResponseModifier } from "./PostProcessResponse";
export { createStateKey, type StateKey, uzeRequestState, uzeSharedState } from "./State";
export type { CookieStore, Middleware, Route, Uze, UzeAdapter } from "./Types";

export function openApiEntry(router: Router) {
  // used for static analysis
}

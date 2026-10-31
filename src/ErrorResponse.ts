import SendableError from "sendable-error";
import { uzeRequestId } from "./BuiltinHooks";
import { getCurrentUzeContext } from "./Context";

/**
 * The response for an error: `{ code, message, requestId, details }`. `requestId` is the request's
 * ID (`uzeRequestId`), which is how a client quotes it to support. It replaces sendable-error's
 * `traceId`, a hash of the error's stack that identifies where it was thrown, not the request.
 */
export const toErrorResponse = (error: unknown): Response => {
  const sendableError = SendableError.of(error as Error);
  const { traceId: _traceId, ...body } = sendableError.toResponseBody();
  const response = Response.json(
    { ...body, ...(getCurrentUzeContext() ? { requestId: uzeRequestId() } : {}) },
    { status: sendableError.getStatus() },
  );
  (response as Response & { cause?: unknown }).cause = sendableError;
  return response;
};

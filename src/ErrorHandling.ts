import SendableError from "sendable-error";

export const errorToResponse = (error: Error) => {
  const sendableError = SendableError.of(error);

  const response = Response.json(sendableError.toResponse(), {
    status: sendableError.getStatus(),
  });
  response.headers.set("X-Trace-Id", sendableError.getTraceId());
  return response;
};

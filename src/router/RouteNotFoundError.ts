import SendableError from "sendable-error";

export class RouteNotFoundError extends SendableError {
  constructor() {
    super({ status: 404, public: true, message: "Route not found", code: "misc/route-not-found" });
  }
}

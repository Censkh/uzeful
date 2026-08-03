import { Readable } from "node:stream";
import type { Request as ExpressRequest, Response as ExpressResponse, NextFunction, RequestHandler } from "express";
import { UzefulApp, type UzefulAppOptions } from "../UzefulApp";

export interface ExpressUzefulAppOptions<TEnv> extends UzefulAppOptions<TEnv, Request> {
  getEnv: (request: ExpressRequest, response: ExpressResponse) => TEnv | Promise<TEnv>;
}

const requestToFetchRequest = (request: ExpressRequest): Request => {
  const origin = `${request.protocol}://${request.get("host") ?? "localhost"}`;
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        headers.append(name, entry);
      }
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  return new Request(new URL(request.originalUrl || request.url, origin), {
    method: request.method,
    headers,
    body: hasBody ? (Readable.toWeb(request) as ReadableStream) : undefined,
    duplex: "half",
  } as RequestInit);
};

const sendFetchResponse = (fetchResponse: Response, response: ExpressResponse, next: NextFunction) => {
  response.status(fetchResponse.status);
  for (const [name, value] of fetchResponse.headers) {
    response.set(name, value);
  }

  if (!fetchResponse.body) {
    response.end();
    return;
  }

  Readable.fromWeb(fetchResponse.body as never)
    .on("error", next)
    .pipe(response);
};

export class ExpressUzefulApp<TEnv> extends UzefulApp<TEnv, Request> {
  constructor(private readonly expressOptions: ExpressUzefulAppOptions<TEnv>) {
    super(expressOptions);
  }

  fetch(handler: () => Promise<Response>): RequestHandler {
    return (request, response, next) => {
      void (async () => {
        const fetchResponse = await this.dispatch(
          {
            request: requestToFetchRequest(request),
            env: await this.expressOptions.getEnv(request, response),
            waitUntil: () => {},
            rawContext: { request, response, next },
          },
          handler,
        );
        sendFetchResponse(fetchResponse, response, next);
      })().catch(next);
    };
  }
}

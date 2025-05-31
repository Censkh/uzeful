import type { ContextOptions, createUzeContextHook } from "./Context";

export interface BaseHeaders {
  get(name: string): string | null;
  has(name: string): boolean;
  set(name: string, value: string): void;
}

export interface BaseRequest {
  readonly headers: BaseHeaders;
  readonly method: string;
  readonly url: string;
  readonly body: any;
}

export type Middleware = () => void | Promise<void>;
export type Route = () => Promise<Response> | Response;

export interface Uze<TEnv, TRequest extends BaseRequest = Request> {
  handle: (options: ContextOptions<TEnv, TRequest>, handler: () => Promise<Response>) => Promise<Response>;
  hooks: {
    uzeContext: ReturnType<typeof createUzeContextHook<TEnv, TRequest>>;
  };
}

export interface UzeAdapter<TEnv, TRequest extends BaseRequest = Request> {
  handler: (request: TRequest) => Promise<Response>;
}

export interface CookieStore {
  get(name: string): { name: string; value: string } | undefined;
  getAll(): { name: string; value: string }[];
  has(name: string): boolean;
  set(
    name: string,
    value: string,
    options?: {
      expires?: Date;
      maxAge?: number;
      domain?: string;
      path?: string;
      secure?: boolean;
      httpOnly?: boolean;
      sameSite?: "strict" | "lax" | "none";
    },
  ): void;
  delete(name: string): void;
}

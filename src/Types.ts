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

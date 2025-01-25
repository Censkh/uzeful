import { createStateKey, uzeState } from "./State";

const EXTRA_HEADERS = createStateKey<Record<string, string>>("headers", () => ({}));

export const postProcessResponse = (response: Response) => {
  const [getExtraHeaders] = uzeState(EXTRA_HEADERS);
  const extraHeaders = getExtraHeaders();

  try {
    for (const [key, value] of Object.entries(extraHeaders)) {
      response.headers.set(key, value);
    }
  } catch (error: any) {}

  return response;
};

export const uzeSetHeaders = (headers: Record<string, string>) => {
  const [getHeaders, setHeaders] = uzeState(EXTRA_HEADERS);
  setHeaders(headers);
};

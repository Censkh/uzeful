import { createStateKey, uzeRequestState } from "./State";

type ResponseModifier = (response: Response) => void | Promise<void>;

const RESPONSE_MODIFIERS = createStateKey<ResponseModifier[]>("responseModifiers", () => []);

export const postProcessResponse = async (response: Response) => {
  const [getModifiers] = uzeRequestState(RESPONSE_MODIFIERS);
  const modifiers = getModifiers();
  if (!modifiers || modifiers.length === 0) {
    return response;
  }

  // 101 Switching Protocols is a special case where we don't modify the response
  if (response.status === 101) {
    return response;
  }

  // also don't modify responses that are redirects
  if (response.status >= 300 && response.status < 400) {
    return response;
  }

  // A copy with mutable headers (a fetched or cached response's are immutable) that takes over the
  // body. Not `clone()`: that tees the body and leaves one branch unread, and workerd's tee stops
  // pulling a streamed body once the unread branch's queue is full, so a body produced on demand
  // stalls after its first chunk and the runtime cancels the request as hung.
  const modifiedResponse = new Response(response.body, response);

  for (const modifier of modifiers) {
    await modifier(modifiedResponse);
  }

  return modifiedResponse;
};

export const uzeResponseModifier = (modifier: ResponseModifier) => {
  const [, setModifiers] = uzeRequestState(RESPONSE_MODIFIERS);
  setModifiers((prev) => {
    return [...prev, modifier];
  });
};

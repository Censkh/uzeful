import { createStateKey, uzeState } from "./State";

type ResponseModifier = (response: Response) => void;

const RESPONSE_MODIFIERS = createStateKey<ResponseModifier[]>("responseModifiers", () => []);

export const postProcessResponse = (response: Response) => {
  const [getModifiers] = uzeState(RESPONSE_MODIFIERS);
  const modifiers = getModifiers();
  if (!modifiers || modifiers.length === 0) {
    return response;
  }

  const modifiedResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });

  for (const modifier of modifiers) {
    modifier(modifiedResponse);
  }

  return modifiedResponse;
};

export const uzeResponseModifier = (modifier: ResponseModifier) => {
  const [, setModifiers] = uzeState(RESPONSE_MODIFIERS);
  setModifiers((prev) => {
    return [...prev, modifier];
  });
};

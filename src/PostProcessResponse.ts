import { createStateKey, uzeState } from "./State";

type ResponseModifier = (response: Response) => void;

const RESPONSE_MODIFIERS = createStateKey<ResponseModifier[]>("responseModifiers", () => []);

export const postProcessResponse = (response: Response) => {
  const [getModifiers] = uzeState(RESPONSE_MODIFIERS);
  const modifiers = getModifiers();
  if (!modifiers || modifiers.length === 0) {
    return response;
  }

  if (response.status === 101) {
    // 101 Switching Protocols is a special case where we don't modify the response
    return response;
  }

  const modifiedResponse = response.clone() as Response;

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

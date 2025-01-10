import { createStateKey, uzeState } from "./State";

const REQUEST_ID = createStateKey<string>("requestId", () => {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
});

export const uzeRequestId = () => {
  const [getRequestId] = uzeState(REQUEST_ID);
  return getRequestId();
};

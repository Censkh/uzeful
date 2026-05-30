import { createUzeful } from "../src";

export const run = async <T>(handler: () => T | Promise<T>, request = new Request("https://example.com/")) => {
  const uze = createUzeful<Record<string, unknown>, Request>();
  return uze.run({ request, env: {}, waitUntil: () => {}, rawContext: {} }, handler);
};

import { UzefulApp } from "../src";

export const run = async <T>(handler: () => T | Promise<T>, request = new Request("https://example.com/")) => {
  const uze = new UzefulApp<Record<string, unknown>, Request>();
  return uze.execute({ request, env: {}, waitUntil: () => {}, rawContext: {} }, handler);
};

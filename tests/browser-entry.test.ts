import { expect, test } from "bun:test";
import { uzeContextInternal, uzeCookies } from "../src/index.browser";

test("browser entry stubs request-local hooks", () => {
  expect(uzeCookies()).toBeUndefined();
  expect(uzeContextInternal()).toBeUndefined();
});

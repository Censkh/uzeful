import { describe, expect, test } from "bun:test";
import { Priority, UzefulApp, uzeAfter, uzeCookies, uzeResponseModifier } from "../src";

describe("responses, after hooks, and cookies", () => {
  test("runs after hooks by priority and allows response replacement", async () => {
    const seen: string[] = [];

    const response = await new UzefulApp<Record<string, unknown>, Request>().dispatch(
      { request: new Request("https://example.com/"), env: {}, waitUntil: () => {}, rawContext: {} },
      async () => {
        uzeAfter(
          (current) => {
            seen.push("last");
            expect(current.headers.get("x-after")).toBe("first");
          },
          { priority: Priority.LAST },
        );
        uzeAfter(
          () => {
            seen.push("first");
            return new Response("changed", { headers: { "x-after": "first" } });
          },
          { priority: Priority.FIRST },
        );

        return new Response("original");
      },
    );

    expect(seen).toEqual(["first", "last"]);
    expect(await response.text()).toBe("changed");
    expect(response.headers.get("x-after")).toBe("first");
  });

  test("applies response modifiers but skips redirects", async () => {
    const ok = await new UzefulApp<Record<string, unknown>, Request>().dispatch(
      { request: new Request("https://example.com/"), env: {}, waitUntil: () => {}, rawContext: {} },
      async () => {
        uzeResponseModifier((response) => response.headers.set("x-modified", "yes"));
        return new Response("ok");
      },
    );

    const redirect = await new UzefulApp<Record<string, unknown>, Request>().dispatch(
      { request: new Request("https://example.com/"), env: {}, waitUntil: () => {}, rawContext: {} },
      async () => {
        uzeResponseModifier((response) => response.headers.set("x-modified", "yes"));
        return Response.redirect("https://example.com/next", 302);
      },
    );

    expect(ok.headers.get("x-modified")).toBe("yes");
    expect(redirect.headers.get("x-modified")).toBeNull();
  });

  test("reads, sets, and deletes cookies through Set-Cookie modifiers", async () => {
    const response = await new UzefulApp<Record<string, unknown>, Request>().dispatch(
      {
        request: new Request("https://example.com/", { headers: { cookie: "session=abc; theme=dark" } }),
        env: {},
        waitUntil: () => {},
        rawContext: {},
      },
      async () => {
        const cookies = uzeCookies();
        expect(cookies.get("session")).toEqual({ name: "session", value: "abc" });
        expect(cookies.has("theme")).toBe(true);

        cookies.set("session", "next", { httpOnly: true, sameSite: "lax" });
        expect(cookies.get("session")).toEqual({ name: "session", value: "next" });

        cookies.delete("theme");
        expect(cookies.has("theme")).toBe(false);

        return new Response("ok");
      },
    );

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("session=next");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=lax");
    expect(setCookie).toContain("theme=");
    expect(setCookie).toContain("Max-Age=-1");
  });
});

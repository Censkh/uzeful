import { parse as parseCookies } from "cookie";
import { uzeContextInternal } from "./Context";
import { uzeResponseModifier } from "./PostProcessResponse";
import { createStateKey, uzeState } from "./State";
import type { CookieStore } from "./Types";

const COOKIE_STATE_KEY = createStateKey<CookieStore>("cookies");

export const uzeCookies = (): CookieStore => {
  const { request } = uzeContextInternal();
  const [getCookieStore, setCookieStore] = uzeState(COOKIE_STATE_KEY);

  const existingStore = getCookieStore();
  if (existingStore) {
    return existingStore;
  }

  // Use cookie library to parse cookies
  const cookieHeader = request.headers.get("Cookie") || "";
  const parsedCookies = parseCookies(cookieHeader);

  // Convert to array format while preserving all cookies
  const cookies = Object.entries(parsedCookies)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([name, value]) => ({ name, value }));

  const store: CookieStore = {
    get(name: string) {
      return cookies.find((cookie) => cookie.name === name);
    },
    getAll() {
      return cookies;
    },
    has(name: string) {
      return cookies.some((cookie) => cookie.name === name);
    },
    set(
      name: string,
      value: string,
      options?: {
        expires?: Date;
        maxAge?: number;
        domain?: string;
        path?: string;
        secure?: boolean;
        httpOnly?: boolean;
        sameSite?: "strict" | "lax" | "none";
      },
    ) {
      const cookieParts = [`${name}=${value}`];

      if (options?.expires) {
        cookieParts.push(`Expires=${options.expires.toUTCString()}`);
      }
      if (options?.maxAge) {
        cookieParts.push(`Max-Age=${options.maxAge}`);
      }
      if (options?.domain) {
        cookieParts.push(`Domain=${options.domain}`);
      }
      if (options?.path) {
        cookieParts.push(`Path=${options.path}`);
      } else {
        cookieParts.push("Path=/");
      }
      if (options?.secure) {
        cookieParts.push("Secure");
      }
      if (options?.httpOnly) {
        cookieParts.push("HttpOnly");
      }
      if (options?.sameSite) {
        cookieParts.push(`SameSite=${options.sameSite}`);
      }

      uzeResponseModifier((response) => {
        response.headers.append("Set-Cookie", cookieParts.join("; "));
      });

      // Remove any existing cookies with this name
      const newCookies = cookies.filter((cookie) => cookie.name !== name);
      // Add the new cookie
      newCookies.push({ name, value });
      cookies.length = 0;
      cookies.push(...newCookies);
    },
    delete(name: string) {
      this.set(name, "", { maxAge: -1 });
      const newCookies = cookies.filter((cookie) => cookie.name !== name);
      cookies.length = 0;
      cookies.push(...newCookies);
    },
  };

  return setCookieStore(store);
};

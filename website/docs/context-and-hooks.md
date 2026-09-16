---
sidebar_position: 2
description: Build typed dependency hooks, share initialization within a request, and test lifecycle work without starting a server.
---

# Context and hooks

A hook is an ordinary function that uses the current request's context. Start with a small hook for a dependency you already pass around, then compose it where needed.

## Export your typed context

Create the app in a module that your hooks can import. Keep server startup in a separate entry file so importing a hook in a test does not start a server.

```ts title="app.ts"
import { BunUzefulApp } from "uzeful/bun";

export interface Env {
  catalog: {
    findName(id: string): Promise<string | null>;
  };
}

export const app = new BunUzefulApp<Env>();
export const uzeContext = app.hooks.uzeContext;
```

```ts title="catalog.ts"
import { uzeContext } from "./app";

export function uzeCatalog() {
  return uzeContext().env.catalog;
}

export async function findProductName(id: string) {
  return uzeCatalog().findName(id);
}
```

The app's environment type flows through `uzeContext()` to `uzeCatalog()`. Accessing an existing dependency needs no additional state; use request state when you want to construct or load something once.

### What is in the context?

| Field | Purpose |
| --- | --- |
| `request` | The current request; Fetch adapters expose a standard `Request`. Absent in `app.test`, scheduled work, and queue handlers. |
| `env` | The bindings, dependencies, or configuration supplied by the adapter or test. |
| `startMs` | Context start time in milliseconds, useful for elapsed-time measurements. |
| `waitUntil(work, label?)` | Track a promise or an async function as background work. |
| `rawContext` | Adapter-specific details, such as the Cloudflare execution context. |
| `state` | Internal state container; use `uzeRequestState` for typed access. |

## Request-scoped state

Define a key once at module scope. Each request gets its own value for that key.

```ts
import { createStateKey, uzeRequestState } from "uzeful";

const ITEM_COUNT = createStateKey<number>("item-count", () => 0);

export function uzeItemCount() {
  return uzeRequestState(ITEM_COUNT);
}

// Inside a handler or hook:
const [getCount, setCount] = uzeItemCount();
setCount((count) => count + 1);
console.log(getCount()); // 1 on the first increment in this request
```

The tuple contains a getter function and a setter function. Call the getter to read the latest value. If you omit a default, include `undefined` in the key's type until you have set a value.

Creating a key inside the hook creates a new identity on every call, so callers will not share state. Keep the key at module scope; keep the request-owned value inside request state.

## Share asynchronous initialization

Store the promise before awaiting it. Two callers in the same request can then share one lookup, even when they start concurrently.

This example builds on `app.ts` and `catalog.ts` above:

```ts title="featured-product.ts"
import { createStateKey, uzeRequestState } from "uzeful";
import { uzeCatalog } from "./catalog";

const FEATURED_NAME = createStateKey<Promise<string | null> | undefined>(
  "featured-name",
);

export function uzeFeaturedName(): Promise<string | null> {
  const [getName, setName] = uzeRequestState(FEATURED_NAME);
  const existing = getName();
  if (existing) return existing;

  const pending = uzeCatalog().findName("featured");
  setName(pending);
  return pending;
}
```

The promise also preserves a `null` result and a rejection for the rest of that request. If your application needs retries, handle that explicitly. A new request starts with fresh state.

Use one key per dependency. For lookups with varying arguments, store a map keyed by those arguments or use a [cache namespace](./caching.md).

## Request lifecycle

Register lifecycle hooks while the context is active. For example, attach a request ID to the response and log its status after tracked background work finishes:

```ts
import { uzeAfterWaitUntils, uzeBeforeResponse, uzeRequestId } from "uzeful";
import { uzeContext } from "./app";

export function uzeRequestLogging() {
  const requestId = uzeRequestId();
  const { startMs } = uzeContext();

  uzeBeforeResponse((response) => {
    const headers = new Headers(response.headers);
    headers.set("x-request-id", requestId);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  });

  uzeAfterWaitUntils((response) => {
    console.log({ requestId, status: response.status, elapsedMs: Date.now() - startMs });
  });
}
```

Call `uzeRequestLogging()` once in your handler. Registration adds a callback each time; it is not automatically deduplicated.

| API | When to use it |
| --- | --- |
| `uzeBeforeResponse(callback)` | Change or replace the response before it is returned. Async callbacks are awaited. |
| `uzeContext().waitUntil(work, label?)` | Track work that can continue without blocking the response. Register it before returning. |
| `uzeAfterWaitUntils(callback)` | Finish cleanup or reporting after tracked background work settles. This cannot change the returned response. |

Both lifecycle hooks accept `{ priority: Priority.FIRST }` (or `EARLY`, `NORMAL`, `LATE`, `LAST`) as a second argument. Callbacks run in that order and in registration order within each priority.

Background execution follows the [runtime adapter](./adapters.md). Use a durable queue for work that must survive a process exit.

## Test without a server

Supply a fake dependency and call your hook inside `app.test`. This runnable Bun test checks both the result and shared initialization:

```ts title="featured-product.test.ts"
import { expect, test } from "bun:test";
import { app } from "./app";
import { uzeFeaturedName } from "./featured-product";

test("loads the featured name once per request", async () => {
  let calls = 0;
  const env = {
    catalog: {
      async findName(id: string) {
        calls += 1;
        return id === "featured" ? "Notebook" : null;
      },
    },
  };

  await app.test({ env }, async () => {
    const names = await Promise.all([uzeFeaturedName(), uzeFeaturedName()]);
    expect(names).toEqual(["Notebook", "Notebook"]);
    expect(calls).toBe(1);
  });

  await app.test({ env }, async () => {
    expect(await uzeFeaturedName()).toBe("Notebook");
    expect(calls).toBe(2);
  });
});
```

`app.test` creates a context and drains tracked background work before completing. A tracked background failure rejects the test call. To wait for that work inside your assertions, use `await uzeTestContext().drainWaitUntils()` from `uzeful`.

Tests created this way have no HTTP request. For hooks that read headers, cookies, or the URL, call the adapter's `fetch` handler with a real `Request` instead.

## Hooks in reusable packages

Application code should use its exported typed `uzeContext`. A package that cannot import the application can use `uzeContextInternal<Env>()` from `uzeful`, with a type describing the environment it requires. That type is a contract for the host application; it does not validate bindings at runtime.

## Common mistakes

- **“Cannot use context outside of a context block”:** move the hook call into a handler or `app.test`. Export hook functions at module scope, but call them inside a context.
- **Repeated initialization:** create the state key once and store an in-flight promise before awaiting it.
- **State shared between users:** use `uzeRequestState` for request-owned values. `uzeMemoryState` is backed by a process-local global map and is shared across requests; it is not distributed storage.
- **Unexpected request access errors in tests or jobs:** these contexts have no request. Supply a real request through `fetch`, or keep that hook focused on `env` and state.

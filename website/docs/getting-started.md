---
id: getting-started
slug: /
title: Backend hooks with shared context
sidebar_label: Getting started
hide_title: true
description: Stop threading request context through your backend. Build typed hooks for dependencies, state, and lifecycle work with Uzeful.
---

Your route needs a database. Your service needs the current user. Your logger needs a request ID. Passing all of them through every function makes a small change spread across your backend.

**Uzeful gives ordinary functions access to the active request.** Write a focused hook once, then call it from handlers, services, or other hooks. Types follow your environment, and request state stays with the request across `await` calls.

## Why Uzeful?

- **Less wiring:** read typed dependencies where you need them, without adding a context argument to every intermediate function.
- **One place for request state:** share a resolved service or an in-flight lookup within a request.
- **Lifecycle work close to the feature:** register response headers, background work, and cleanup from your hooks.
- **A familiar handler:** return a Fetch `Response` on Bun, Cloudflare Workers, or Express.

Use it when request-aware code is spread across several layers. Pure calculations can stay plain functions with explicit arguments; hooks are useful at the points that need request context.

## Install

```bash
npm install uzeful
```

The runtime adapters ship in the same package. The example below uses Bun so you can try it without configuring external services. For an existing Worker or Express app, jump to [runtime adapters](./adapters.md).

## Your first application

Save this as `server.ts`:

```ts
import { uzeRequestId } from "uzeful";
import { BunUzefulApp } from "uzeful/bun";

const app = new BunUzefulApp<{ serviceName: string }>();
const uzeContext = app.hooks.uzeContext;

function uzeGreeting() {
  const { request, env } = uzeContext();
  const name = new URL(request.url).searchParams.get("name") ?? "world";
  return `Hello, ${name}! From ${env.serviceName}.`;
}

Bun.serve({
  port: 3000,
  fetch: app.fetch(
    async () => Response.json({
      message: uzeGreeting(),
      requestId: uzeRequestId(),
    }),
    { getEnv: () => ({ serviceName: "my-api" }) },
  ),
});
```

Start the server, then call it from another terminal:

```bash
bun run server.ts
```

```bash
curl 'http://localhost:3000/?name=Ada'
```

The response contains `"message": "Hello, Ada! From my-api."` and a generated request ID. Calls to `uzeRequestId()` within the same request return the same ID; a new request gets a new one.

### What just happened?

1. `app.fetch` creates a context for the incoming request.
2. `getEnv` supplies the dependencies or configuration your hooks can read.
3. `uzeGreeting()` reads that context without receiving it as an argument.
4. The handler returns a standard `Response`.

Uzeful uses `AsyncLocalStorage` to carry context through asynchronous calls. Call context-dependent hooks inside a handler, a hook called by that handler, or `app.test`. Calling them during module initialization throws because no request is active.

The `uze` prefix is a naming convention. Hooks are ordinary functions: they can accept arguments, compose other hooks, and run conditionally. They do not trigger rendering or require a fixed call order.

## Build something useful next

| I want to… | Read |
| --- | --- |
| Share a database, initialize a service once, or test a hook | [Context and hooks](./context-and-hooks.md) |
| Add response headers or finish background work | [Request lifecycle](./context-and-hooks.md#request-lifecycle) |
| Cache a lookup across requests and invalidate it | [Caching](./caching.md) |
| Connect a Worker, queue, scheduled job, or Express server | [Runtime adapters](./adapters.md) |

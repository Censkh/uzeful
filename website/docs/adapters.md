---
sidebar_position: 4
description: Connect Uzeful to Bun, Cloudflare Workers, queues, scheduled jobs, and Express with working handler examples.
---

# Runtime adapters

Choose the adapter at your application's entry point. Your handler reads typed dependencies from `app.hooks.uzeContext()` and returns a Fetch `Response`.

| Runtime | Import | Where you supply the environment |
| --- | --- | --- |
| Bun | `uzeful/bun` | `getEnv` in `app.fetch(handler, options)` |
| Cloudflare Workers | `uzeful/cloudflare` | Worker bindings, passed by the runtime |
| Express | `uzeful/express` | `getEnv` in the app constructor |

All `fetch` adapters expect an async handler: `async () => Response`. Runtime-neutral dependencies can move between adapters; platform-specific bindings still need replacements.

## Bun

```ts title="server.ts"
import { BunUzefulApp } from "uzeful/bun";

const app = new BunUzefulApp<{ serviceName: string }>();
const uzeContext = app.hooks.uzeContext;

Bun.serve({
  port: 3000,
  fetch: app.fetch(
    async () => Response.json({ service: uzeContext().env.serviceName }),
    { getEnv: () => ({ serviceName: "api" }) },
  ),
});
```

Run `bun run server.ts`, then `curl http://localhost:3000`. The response is `{"service":"api"}`.

`getEnv(request, server)` runs for each request and may return a value or promise. Optional `getRawContext(request, server)` controls `rawContext`; the default is `{ server }`. Optional `waitUntil(promise)` lets you integrate background work with your host's lifecycle.

## Cloudflare Workers

In an existing Worker project, configure a `SERVICE_NAME` variable and use:

```ts title="src/index.ts"
import { CloudflareUzefulApp } from "uzeful/cloudflare";

interface Env {
  SERVICE_NAME: string;
}

const app = new CloudflareUzefulApp<Env>();
const uzeContext = app.hooks.uzeContext;

export default {
  fetch: app.fetch(async () => {
    return Response.json({ service: uzeContext().env.SERVICE_NAME });
  }),
};
```

Uzeful uses `node:async_hooks`. Ensure your Worker's compatibility settings support it; see Cloudflare's [Node.js compatibility documentation](https://developers.cloudflare.com/workers/runtime-apis/nodejs/). Binding types such as `KVNamespace` and `D1Database` come from your Worker project's runtime types.

### Scheduled work

`app.run(handler)` returns a function accepting `(env, context)`. Wrap it to account for the controller argument in Cloudflare's [scheduled handler signature](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/):

```ts
const runScheduledWork = app.run(async () => {
  console.log("Scheduled run:", uzeContext().env.SERVICE_NAME);
});

export default {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    await runScheduledWork(env, ctx);
  },
};
```

This snippet uses `app`, `Env`, and `uzeContext` from the Worker example. Add `scheduled` to the same default export if you also handle HTTP requests, and configure a Cron Trigger to invoke it.

### Queue messages

The queue adapter exposes the current messages through `uzeCloudflareQueue()`:

```ts
import { uzeCloudflareQueue } from "uzeful/cloudflare";

// Add this handler to your Worker's default export.
const queue = app.queue(async () => {
  const { messages } = uzeCloudflareQueue();
  for (const message of messages) {
    console.log("Received:", message.body);
  }
});
```

Use your application's validation before treating message bodies as domain objects. The hook exposes an object containing `messages`, rather than the complete batch object.

Scheduled and queue handlers have environment and state, but no HTTP request. Hooks used in these handlers should not read `uzeContext().request`.

## Express

Install Express alongside Uzeful:

```bash
npm install express uzeful
```

```ts title="server.ts"
import express from "express";
import { ExpressUzefulApp } from "uzeful/express";

const uzeful = new ExpressUzefulApp({
  getEnv: () => ({ serviceName: "api" }),
});
const uzeContext = uzeful.hooks.uzeContext;

const app = express();
app.use(uzeful.fetch(async () => {
  return Response.json({ service: uzeContext().env.serviceName });
}));
app.listen(3000);
```

Run this TypeScript example with Bun (`bun run server.ts`) or your project's TypeScript execution setup. `curl http://localhost:3000` returns `{"service":"api"}`.

The adapter converts the incoming request to a Fetch `Request` and streams your Fetch response back to Express. `getEnv(request, response)` may be async. `rawContext` contains the original Express `request`, `response`, and `next`.

Mount the adapter before middleware that consumes the request body if your hooks will call `request.json()` or `request.text()`; it reads the original request stream.

## Background work differs by runtime

`uzeContext().waitUntil(...)` tracks work in every adapter:

- **Cloudflare:** forwards the work to the execution context's `waitUntil`.
- **Bun:** uses your supplied `waitUntil` callback, or attaches a rejection handler by default.
- **Express:** tracks the promise through Uzeful without a host lifetime-extension mechanism.
- **Tests:** `app.test` waits for tracked work and reports background failures.

Tracking a promise does not make it durable. For jobs that must survive restarts, enqueue them in your application's durable job system.

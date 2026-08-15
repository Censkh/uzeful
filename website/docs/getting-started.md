---
sidebar_position: 1
slug: /getting-started
---

# Getting started

Uzeful is a small, typed application foundation for backend code. It gives hooks a request context without coupling the code inside those hooks to a specific HTTP runtime.

## Install

```bash
npm install uzeful
```

Add the adapter for the environment you run in. The Cloudflare and Express adapters are exported from the same package.

## Your first application

Create an application instance, export the context hook, then use it from your handlers and domain hooks.

```ts
import { CloudflareUzefulApp } from "uzeful/cloudflare";

interface Env {
  DB: D1Database;
}

const uzeful = new CloudflareUzefulApp<Env>();
export const uzeContext = uzeful.hooks.uzeContext;

const handler = async (): Promise<Response> => {
  const { env } = uzeContext();
  const users = await env.DB.prepare("select * from users").all();
  return Response.json(users);
};

export default {
  fetch: uzeful.fetch(handler),
};
```

The handler is run inside an isolated request context. Any hook that calls `uzeContext()` during that handler gets the correctly typed request, environment, state, and lifecycle helpers.

## Next steps

- Learn how [context and hooks](/docs/context-and-hooks) work.
- Add [cache state](/docs/caching) with explicit edge or replicated storage.
- Run the same handler with a [Cloudflare or Express adapter](/docs/adapters).

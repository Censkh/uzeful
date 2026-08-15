---
sidebar_position: 4
---

# Adapters

`UzefulApp` owns context and lifecycle behavior. Runtime subclasses only translate platform calls into that shared application model.

## Cloudflare Workers

Use `CloudflareUzefulApp` to create Worker `fetch`, scheduled, and queue handlers.

```ts
import { CloudflareUzefulApp } from "uzeful/cloudflare";

const uzeful = new CloudflareUzefulApp<Env>();

export default {
  fetch: uzeful.fetch(handleRequest),
  scheduled: uzeful.run(runScheduledWork),
  queue: uzeful.queue(processMessages),
};
```

Within a queue handler, `uzeCloudflareQueue()` provides the current message batch.

## Express

`ExpressUzefulApp` produces an Express request handler. It converts the incoming request to the standard Fetch API shape, executes your Uzeful handler, then streams the Fetch response back to Express.

```ts
import express from "express";
import { ExpressUzefulApp } from "uzeful/express";

const uzeful = new ExpressUzefulApp({
  getEnv: () => ({ database }),
});

const app = express();
app.use(uzeful.fetch(handleRequest));
```

Your hooks remain the same: they use `uzeful.hooks.uzeContext`, not Express request globals. That keeps them easy to test and portable to another adapter.

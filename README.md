# uzeful

Hooks for the backend.

## Features

- DX improvements
- state management
- logger
- unified error handling interface

`uzeful` provides request context in backend environments together with helpers for logging, error handling, and state management.

```javascript
// route handler for getting user info
export default async function getUserInfo() {
  const { request } = uzeContext();
  
  const db = await uzeDatabase();
  const user = await db.execute("...");

  return Response.json({
    user,
  })
}
```

## Installation

```bash
npm install uzeful
```

## Getting Started

### Cloudflare Workers

- make sure you [enable node compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/) in your
  `wrangler.toml` file

```typescript
import {CloudflareUzefulApp} from "uzeful/cloudflare";
import type {D1Database, Request} from "@cloudflare/workers-types";

export interface Env {
  DB: D1Database;
}

const uze = new CloudflareUzefulApp<Env, Request>();

// hook to use in all of your route handlers
export const uzeContext = uze.hooks.uzeContext;

// code that processes requests
const handler = async (): Promise<Response> => {
  const context = uzeContext();
...
}

export default {
  fetch: uze.fetch(handler),
};
```

#### With router

```typescript

import {createRouter} from "uzeful/router";

const router = createRouter()
  .all("*", () => {
    return Response.json({message: "Hello World"});
  });

export default {
  fetch: uze.fetch(router.fetch),
};
```

## Usage

### Making Hooks

Making a hook is as simple as making a function with the prefix `uze`. No magic required. As long as you run these
functions within the `handler` function you pass to `uze` you will be able to access the current request context.

```typescript
export const uzeDatabase = async () => {
  const { env } = uzeContext();
  return env.DB;
}
```

### After Hooks

Use `uzeBeforeResponse` to modify a response before it is returned. This can be useful when you want to add
headers to a response, such as CORS.

```typescript
import {uzeBeforeResponse} from "uzeful";
import {createRouter} from "uzeful/router";

const router = createRouter()
  .all("*", async () => {
    uzeBeforeResponse((response) => {
      response.headers.set("Access-Control-Allow-Origin", "*");
    });
  })
  .get("/users/:id", userHandler);
```

### State Management

A lot of the time you want to manage state related to a single request. `uze` provides a way to do this with `useState`.

```typescript
import {uzeRequestState, createStateKey} from "uzeful";

export interface UserAccount {
  id: string;
  name: string;
}

const USER_ACCOUNT_KEY = createStateKey<UserAccount>("user-account");

export default async function getUserInfo() {
  const [getUserAccount, setUserAccount] = uzeRequestState(USER_ACCOUNT_KEY);

  let userAccount = await getUserAccount();
  if (!userAccount) {
    userAccount = await fetchUserAccount();
    setUserAccount(userAccount);
  }

  return Response.json({
    userAccount,
  });
}
```

#### With defaults

```typescript
import {uzeRequestState, createStateKey} from "uzeful";

const EVENTS_KEY = createStateKey<string[]>("events", () => ["defaultEvent"]);

export default async function getUserInfo() {
  const [getEvents] = uzeRequestState(EVENTS_KEY);

  let events = await getEvents();
  events.push("newEvent");
  console.log(events); // ["defaultEvent", "newEvent"]

...
}
```

### Error Handling

Uze exposes `SendableError` which provides a unified interface to handle errors. For the full
documentation: https://www.npmjs.com/package/sendable-error

```typescript
import {SendableError} from "uzeful";

export default async function getUserInfo() {
  const db = await uzeDatabase();

  const user = await db.execute("...");

  if (!user) {
    throw new SendableError({
      message: "User not found",
      status: 404,
      public: true,
      code: "users/not-found"
    });
  }

...
}
```

**Note:** all errors are __private__ by default. This means the response body will contain an obfuscated error. To make
an error public, set the `public` property to `true`.

The maintained guides for context, caching, and runtime adapters live in `website/docs`.

### Router

`uze` provides a wrapper around `itty-router`'s `AutoRouter` to provide a simple way to define routes.

See the full documentation here: https://itty.dev/itty-router/routers/autorouter

```typescript

import {createRouter} from "uzeful/router";

const router = createRouter()
  .all("*", () => {
    return Response.json({message: "Hello World"});
  });
```

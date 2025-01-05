# uze

Hooks for the backend.

## Features

- DX improvements
- state management
- logger
- unified error handling interface

`uze` allows you to access the context of a request with zero hassel in backend environments and provides helpers for
logging, error handling & managing state

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
npm install uze
```

## Getting Started

### Cloudflare Workers

- make sure you [enable node compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/) in your
  `wrangler.toml` file

```typescript
import {createUze} from "uze";
import type {D1Database, Request} from "@cloudflare/workers-types";

export interface Env {
  DB: D1Database;
}

const uze = createUze<Env, Request>();

// hook to use in all of your route handlers
export const uzeContext = uze.hooks.uzeContext;

// code that processes requests
const handler = async (): Promise<Response> => {
  const context = uzeContext();
...
}

export default {
  fetch: async (req: Request, env: Env, ctx: any) => {
    return await uze.handle(
      {
        request: req,
        env,
        waitUntil: ctx.waitUntil,
        rawContext: ctx,
      },
      handler
    );
  },
};
```

#### With router

```typescript

import {createRouter} from "uze/router";

const router = createRouter()
  .all("*", () => {
    return Response.json({message: "Hello World"});
  });

export default {
  fetch: async (req: Request, env: Env, ctx: any) => {
    return await uze.handle(
      {
        request: req,
        env,
        waitUntil: ctx.waitUntil,
        rawContext: ctx,
      },
      router.handler,
    );
  },
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

You can use the `uzeAfter` hook to run code after the response has been created. This can be useful when you want to add
headers to a response, such as CORS.

```typescript
import {uzeAfter} from "uze";
import {createRouter} from "uze/router";

const router = createRouter()
  .all("*", async () => {
    uzeAfter((response) => {
      response.headers.set("Access-Control-Allow-Origin", "*");
    });
  })
  .get("/users/:id", userHandler);
```

### State Management

A lot of the time you want to manage state related to a single request. `uze` provides a way to do this with `useState`.

```typescript
import {uzeState, createStateKey} from "uze";

export interface UserAccount {
  id: string;
  name: string;
}

const USER_ACCOUNT_KEY = createStateKey<UserAccount>("user-account");

export default async function getUserInfo() {
  const [getUserAccount, setUserAccount] = uzeState(USER_ACCOUNT_KEY);

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
import {uzeState, createStateKey} from "uze";

const EVENTS_KEY = createStateKey<string[]>("events", () => ["defaultEvent"]);

export default async function getUserInfo() {
  const [getEvents] = uzeState(EVENTS_KEY);

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
import {SendableError} from "uze";

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

**Note:** all errors are __private__ by default. This means the response body will contain and obfuscated error. To make
an error public, set the `public` property to `true`.

### Router

`uze` provides a wrapper around `itty-router`'s `AutoRouter` to provide a simple way to define routes.

See the full documentation here: https://itty.dev/itty-router/routers/autorouter

```typescript

import {createRouter} from "uze/router";

const router = createRouter()
  .all("*", () => {
    return Response.json({message: "Hello World"});
  });
```

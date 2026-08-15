---
sidebar_position: 2
---

# Context and hooks

Hooks are plain functions. A `uze` prefix is a convention that signals the function reads or writes request-scoped state.

## Expose the context hook

Every application instance owns its own context hook. Export it from the module where you create the app so its types follow the runtime environment.

```ts
const uzeful = new CloudflareUzefulApp<Env>();
export const uzeContext = uzeful.hooks.uzeContext;
```

## Build focused hooks

Use the context only where it adds value. This keeps route handlers thin and leaves dependencies explicit.

```ts
export const uzeDatabase = () => {
  const { env } = uzeContext();
  return env.DB;
};

export const uzeCurrentUser = async () => {
  const request = uzeContext().request;
  const db = uzeDatabase();
  return await findUserFromRequest(db, request);
};
```

## Request-scoped state

`uzeRequestState` stores a value for the duration of one request. Define stable state keys at module scope.

```ts
import { createStateKey, uzeRequestState } from "uzeful";

const CURRENT_USER = createStateKey<User>("current-user");

export const uzeCurrentUser = async () => {
  const [getUser, setUser] = uzeRequestState(CURRENT_USER);
  const cached = getUser();
  if (cached) return cached;

  const user = await loadUser();
  setUser(user);
  return user;
};
```

## Test hook code

Run domain hooks through the same application instance. `test` provides an isolated context and performs cleanup after the callback completes.

```ts
await uzeful.test({ env: testEnv }, async () => {
  expect(await uzeCurrentUser()).toEqual(expectedUser);
});
```

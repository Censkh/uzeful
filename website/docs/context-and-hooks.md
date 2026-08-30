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

## Dependency hook pattern

The usual pattern for a service, model, database, or API dependency is to resolve it lazily and store it in request
state. Define the state key once at module scope, return the existing value when present, and create or resolve the
dependency only on the first call in that request.

Reusable backend packages should use `uzeContextInternal<Env>()` so they do not depend on a concrete application
instance:

```ts
import { createStateKey, uzeContextInternal, uzeRequestState } from "uzeful";

type ServicesEnv = {
  database: Database;
};

const DATABASE_STATE = createStateKey<Database | undefined>("database");

export const uzeDatabase = (): Database => {
  const [getDatabase, setDatabase] = uzeRequestState(DATABASE_STATE);
  const existing = getDatabase();
  if (existing) return existing;

  const database = uzeContextInternal<ServicesEnv>().env.database;
  setDatabase(database);
  return database;
};
```

This gives every request a stable dependency identity without leaking request-owned instances into global state. The
`uze` prefix signals that the function must run inside an active Uzeful context.

For asynchronous construction, store the promise before awaiting it so concurrent callers in the same request share
one initialization:

```ts
const SERVICE_STATE = createStateKey<Promise<Service> | undefined>("service");

export const uzeService = (): Promise<Service> => {
  const [getService, setService] = uzeRequestState(SERVICE_STATE);
  const existing = getService();
  if (existing) return existing;

  const service = createService();
  setService(service);
  return service;
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

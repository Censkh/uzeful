---
sidebar_position: 3
description: Cache lookups across requests with named stores, explicit expiration, background writes, and versioned invalidation.
---

# Caching

Use request state to reuse a value during one request. Use a cache store when later requests should be able to reuse it too.

Uzeful adds typed namespaces, request-local reads, and lifecycle-aware writes around a configured key store. You choose the backing storage and how stale the data may be.

## Choose the scope and store

| Scope | Intended use | Example store |
| --- | --- | --- |
| `edge` | Data that can be cached independently at an edge location | `CloudflareCacheKeyStore` from `uzeful/cloudflare` |
| `replicated` | Cached data shared through a remote storage service | `KVKeyStore` from `uzeful/cache/kv`, or `UpstashKeyStore` from `uzeful/cache/upstash` |

These names select entries in your configuration. They do not add replication or consistency guarantees to the underlying store. Choose storage whose behavior fits your application, and keep authoritative data in your database.

For local development and tests, `InMemoryKeyStore` from `uzeful/cache/in-memory` holds values in one process. Reuse the same store instance across requests when you want cache hits between them.

## A complete cache-aside example

This Bun server caches a catalog lookup for five minutes. The in-memory catalog stands in for your database or API client.

```ts title="server.ts"
import { BunUzefulApp } from "uzeful/bun";
import { createVersionedCacheNamespace, uzeCacheState } from "uzeful/cache";
import { InMemoryKeyStore } from "uzeful/cache/in-memory";

type Product = { id: string; name: string };
type Env = { catalog: { find(id: string): Promise<Product | null> } };

const store = new InMemoryKeyStore();
const app = new BunUzefulApp<Env>({
  cache: {
    stores: { replicated: async () => store },
    getVersion: () => "1",
    getKeyPrefix: () => "catalog-demo",
  },
});
const uzeContext = app.hooks.uzeContext;
const PRODUCTS = createVersionedCacheNamespace<Product>({
  id: "products",
  type: "replicated",
});

async function uzeProduct(id: string) {
  const cache = uzeCacheState(PRODUCTS);
  const cached = await cache.getItem(id);
  if (cached != null) return cached;

  const product = await uzeContext().env.catalog.find(id);
  if (product) await cache.setItem(id, product, Date.now() + 5 * 60_000);
  return product;
}

Bun.serve({
  port: 3000,
  fetch: app.fetch(
    async () => {
      const id = new URL(uzeContext().request.url).searchParams.get("id") ?? "notebook";
      const product = await uzeProduct(id);
      return product
        ? Response.json(product)
        : new Response("Product not found", { status: 404 });
    },
    {
      getEnv: () => ({
        catalog: {
          async find(id) {
            console.log("Catalog lookup:", id);
            return id === "notebook" ? { id, name: "Notebook" } : null;
          },
        },
      }),
    },
  ),
});
```

Run `bun run server.ts`, then call `curl 'http://localhost:3000/?id=notebook'` twice. Both responses contain the product; the catalog lookup logs once. Restarting the server clears this in-memory cache.

The `replicated` slot here uses local memory for the demo. Replace its factory with a remote store to share cached data across processes.

## Read, write, and invalidate

Call `uzeCacheState(namespace)` inside an active context. It returns:

| Method | Use |
| --- | --- |
| `getItem(key)` / `setItem(key, value, expiresAt?)` | Read or write a named item. Await the write to wait for storage. |
| `get()` / `set(value, expiresAt?)` | Read or write one value for the whole namespace. |
| `clearItem(key)` | Remove an item from request-local cache and backing storage. |
| `getItems(keys)` | Read multiple items; results follow input order. |
| `setItems([{ key, value, expiresAt }])` / `clearItems(keys)` | Write or remove multiple items. |
| `setItemInBackground(key, value, expiresAt?)` | Update request-local state immediately and schedule the storage write. |
| `setInBackground(value, expiresAt?)` / `setItemsInBackground(items)` | Schedule a namespace value or a batch of writes. |

Read results can be `null` or `undefined`; handle both as a miss. For example, `cached != null` checks for a present value.

**`expiresAt` is an absolute timestamp in milliseconds**, such as `Date.now() + 60_000`, not a duration or Unix seconds. Single-item writes with ten seconds or less remaining stay request-local and skip the backing store. Set an explicit expiration for data that should age out.

After updating a product in your database, invalidate its cached copy inside that request:

```ts
await uzeCacheState(PRODUCTS).clearItem(productId);
```

Here, `PRODUCTS` is the namespace above and `productId` is the ID you just updated. Cache invalidation does not make database writes and cache operations atomic.

Background write methods return immediately. Schedule them while the context is active; use awaited writes when your handler needs confirmation that storage has completed.

## Version and partition your keys

- `getKeyPrefix` separates applications, environments, or tenants that share storage. Include tenant identity in your prefix or item key when caching tenant-specific data.
- `createCacheNamespace` uses its literal `id`. Change that ID when you want a new namespace.
- `createVersionedCacheNamespace` also includes the value from `getVersion`. Bump it when the cached data shape changes.

Changing a version routes future reads to new keys. It does not delete old entries; expiration controls how long they remain in storage.

## Cloudflare storage configuration

In a Worker project with a `KV` binding and an `APP_ENV` variable:

```ts
import { CloudflareUzefulApp, CloudflareCacheKeyStore } from "uzeful/cloudflare";
import { KVKeyStore } from "uzeful/cache/kv";

interface Env {
  KV: KVNamespace;
  APP_ENV: string;
}

const app = new CloudflareUzefulApp<Env>({
  cache: {
    stores: {
      edge: async () => new CloudflareCacheKeyStore(),
      replicated: async ({ env }) => new KVKeyStore(env.KV),
    },
    getVersion: () => "1",
    getKeyPrefix: ({ env }) => env.APP_ENV,
  },
});
```

`CloudflareCacheKeyStore` stores JSON values. For full HTTP responses, use the native Cache API so response streams and headers remain intact.

If you see `Cache store 'replicated' is not configured` (or `'edge'`), add a factory for the namespace's `type` to the app whose handler is running. There is no automatic fallback store.

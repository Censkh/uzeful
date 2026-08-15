---
sidebar_position: 3
---

# Caching

Uzeful cache hooks make storage intent explicit. Configure one or more stores on the app, then select the cache scope when creating a namespace.

## Choose the right scope

| Store | Use it for | Avoid it for |
| --- | --- | --- |
| `edge` | Public, immutable, or safely stale data close to the user | Database records, authorization, or anything requiring cross-PoP consistency |
| `replicated` | Shared application data and cache state that must survive a different edge location | Large binary response bodies |

Cloudflare's Cache API is edge-local. It is excellent for CDN responses, but it is not a replicated datastore.

## Configure stores

```ts
import { CloudflareCacheKeyStore } from "uzeful/cloudflare";
import { KVKeyStore } from "uzeful/cache/kv";

const uzeful = new CloudflareUzefulApp<Env>({
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

## Namespace cache state

Use a named namespace and give its data a clear ownership boundary. A changed version gives you a clean cache without global deletion.

```ts
const PRODUCT_CACHE = createCacheNamespace<Product>({
  id: "product[byId]:1",
  type: "replicated",
});

export const uzeProduct = () => {
  const { get, set } = uzeCacheState(PRODUCT_CACHE);
  return { get, set };
};
```

`CloudflareCacheKeyStore` stores JSON values. For HTTP responses such as asset downloads, use the native Cloudflare Cache API directly so the response stream, headers, and cache key remain intact.

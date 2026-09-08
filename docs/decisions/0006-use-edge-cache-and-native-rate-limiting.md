# ADR 0006: Use Edge Cache and Native Rate Limiting

## Status

Accepted in part. The IP-keyed rate-limit requirement is superseded by [ADR 0008](0008-withdraw-ip-keyed-rate-limiting.md). The cache, no-client-storage, and native-binding decisions remain accepted.

## Context

Cast data changes infrequently, while the public Cloudflare Worker must limit redundant TMDB traffic and coarse abuse without adding a database or client persistence.

## Decision

Use the Workers Cache API (`caches.default`) for normalized cast responses rather than Workers KV. Cache successful responses for about 24 hours and not-found results for about one hour. Never cache malformed or schema-invalid responses. V1 has no client-side cache or `browser.storage`.

Use Cloudflare's native Workers Rate Limiting binding as coarse, IP-keyed abuse mitigation. Cached responses remain servable without consuming TMDB-hitting work.

## Rationale

The Cache API requires no additional persistence service and is sufficient for idempotent, non-critical GETs. Backend caching benefits all clients and avoids browser-side schema and invalidation complexity. Native rate limiting is simpler than a manual KV counter.

## Consequences

Cache behavior is edge-local and may occasionally produce an extra TMDB request without affecting correctness. Client-side offline support is not provided. The binding's account-tier availability and exact limits remain an implementation spike and must not be assumed before configuration.

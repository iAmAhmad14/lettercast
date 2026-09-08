# ADR 0008: Use a TMDB Movie Resource Key for Rate Limiting

## Status

Accepted. Supersedes only the IP-keyed portion of ADR 0006.

## Context

ADR 0006 selected Cloudflare's native Workers Rate Limiting binding and assumed `CF-Connecting-IP` as its key. The completed platform spike verified that the binding is generally available and suitable for coarse, per-location mitigation. It also found that Cloudflare's current documentation explicitly advises against IP-address keys because NAT, mobile networks, and privacy proxies can group unrelated users.

Cloudflare accepts any string as a rate-limit key and documents resource- and path-specific limits. Lettercast v1 has no user identity, and the TMDB movie ID is already the only approved Letterboxd-derived application data sent to the backend.

## Decision

Retain the native Workers Rate Limiting binding as the v1 abuse-control mechanism. Use a resource-scoped key derived only from the validated TMDB movie ID:

```text
get-cast:{tmdbMovieId}
```

Do not include IP addresses, cookies, extension or client identifiers, persistent client state, fingerprints, user accounts, or other personal or user-identifying data in the key.

Exact numeric limits and the permitted 10- or 60-second period remain implementation and deployment configuration decisions.

## Rationale

The resource key protects TMDB-hitting work for a specific cast resource without creating user identity or expanding browser data collection. It requires no additional permissions, storage, analytics, or tracking. Rate limiting remains coarse upstream abuse protection rather than authentication or exact accounting.

## Consequences

ADR 0006 remains authoritative for Workers Cache API usage, cache TTLs, no client-side storage, and use of the native binding. It is no longer authoritative for IP keying.

Counters for `get-cast:{tmdbMovieId}` are shared by requests for the same movie within a Cloudflare location. They are location-scoped, asynchronously updated, permissive, and eventually consistent. This strategy does not provide a per-caller or globally synchronized limit and does not prevent broad enumeration across many movie IDs.

Account deployment and exact limits still require implementation-time verification, but they do not block implementation planning. No later tuning may add user identity, client-side storage, broad permissions, analytics, or tracking incidentally.

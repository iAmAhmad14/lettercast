# ADR 0010: Treat the Cast Endpoint as an Unauthenticated Public API

## Status

Accepted. Supersedes the requirement that every Worker request carry the exact Chrome-extension Origin and clarifies ADR 0007's statement that Origin/CORS is not authentication.

## Context

The R-14 live smoke test proved that the R-11 MV3 service worker can make its permitted production fetch without Chromium supplying an `Origin` header. The Worker rejected that legitimate request under the exact-Origin admission policy. A direct client can also spoof the public extension Origin, so the old check did not authenticate callers.

Lettercast cannot safely embed a client secret in a public unpacked extension. User accounts, cookies, fingerprints, client IDs, persistent storage identity, and broader permissions are outside v1.

## Decision

Treat only `GET /v1/movie/{tmdbMovieId}/cast` as an unauthenticated public endpoint:

- accept requests with no `Origin`;
- when `Origin` is present, accept only `chrome-extension://oibdnmbbockloodlflplcjdfpnnlppnl`;
- reject every other supplied Origin and never emit wildcard CORS;
- emit `Access-Control-Allow-Origin` only when the approved Origin was supplied;
- add no extension ID header, client credential, user identity, or client storage.

Retain strict method/path/ID validation, cache-first processing, `get-cast:{tmdbMovieId}` rate limiting, the single TMDB credits endpoint, and all existing privacy and runtime boundaries.

## Rationale

This model works with verified MV3 behavior and describes the real trust boundary honestly. Public Origin or extension-ID values are spoofable, while a genuine client secret cannot be protected in distributed extension code. The narrow contract, caching, resource limiter, and Cloudflare platform limits provide proportionate abuse mitigation for a showcase project without tracking users.

## Consequences

Non-browser callers may access the endpoint by omitting or spoofing `Origin`. CORS continues to block unapproved browser origins when they supply Origin, but it is not authentication. The resource limiter remains coarse, location-scoped, eventually consistent, and vulnerable to broad enumeration across movie IDs; this residual risk is accepted for v1.

Production implementation and deployment must change before R-14 can resume. Tests must cover absent-Origin success, incorrect-Origin rejection without an allow-origin header, exact-Origin behavior, no wildcard CORS, and unchanged cache/rate-limit ordering. This decision does not authorize deployment by itself.

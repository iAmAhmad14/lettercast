# ADR 0002: Separate Runtime Trust Boundaries

## Status

Accepted. Clarified by [ADR 0009](0009-load-profile-images-directly-from-tmdb.md) for browser-managed profile-image subresources.

## Context

Lettercast interacts with mutable Letterboxd markup, an extension runtime, a public backend, and TMDB. These systems have different trust levels and change independently.

## Decision

Separate responsibilities across three runtimes:

- The content script reads and renders Letterboxd DOM and performs no network requests.
- The MV3 service worker validates extension messages, acts as the extension's sole network egress, and translates backend failures.
- The Cloudflare Worker holds the TMDB credential, calls TMDB, validates and normalizes upstream data, caches results, and applies abuse controls.

The TMDB credential exists only as a Wrangler secret in Cloudflare.

## Rationale

Routing network traffic through the service worker avoids dependence on Letterboxd's page CSP. Keeping the credential in Cloudflare prevents it from being recoverable from the extension bundle. Clear ownership limits the impact of external markup or API changes.

## Consequences

Only a TMDB movie ID crosses from the browser to the backend. Runtime messages and backend responses are validated at the service-worker boundary; raw TMDB responses are validated in the Cloudflare Worker. Internal TypeScript values do not require runtime validation by default. No logic may depend on service-worker state surviving suspension.

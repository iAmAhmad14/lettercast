# ADR 0007: Enforce Least Privilege and Data Minimization

## Status

Accepted. Clarified by [ADR 0009](0009-load-profile-images-directly-from-tmdb.md) for direct TMDB CDN image requests.

## Context

A film-page extension can expose browsing activity or gain unnecessary access if permissions, telemetry, remote code, or logging expand casually. A TMDB movie ID combined with an IP address can reveal viewing-page history.

## Decision

Use the narrowest content-script match for supported Letterboxd film pages and grant host access only to the Cloudflare Worker for service-worker fetches. Do not request `cookies`, `tabs`, `storage`, broad host access, or speculative permissions.

Only the TMDB movie ID may leave the browser. V1 has no analytics or telemetry vendor. Use the default MV3 CSP, HTTPS only, no remote scripts, no `eval`, and no `new Function`. Production diagnostics must not retain detailed `(IP, tmdbId)` request histories beyond operational necessity.

## Rationale

These restrictions reduce privacy exposure, review burden, compromise impact, and accidental expansion beyond the product's single purpose.

## Consequences

Features requiring new data collection, permissions, storage, or remote execution cannot be added incidentally. They require explicit architectural review and, once available, an ADR. Origin and CORS checks are only layered abuse controls, not authentication. The TMDB secret must never enter source control or the extension bundle.

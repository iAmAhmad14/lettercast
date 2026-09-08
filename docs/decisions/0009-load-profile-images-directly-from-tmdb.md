# ADR 0009: Load Profile Images Directly from TMDB

## Status

Accepted. Clarifies ADR 0002 and ADR 0007.

## Context

Lettercast needs to display TMDB profile images without turning the Cloudflare Worker into an image proxy. The CSP spike found no CSP header or meta policy on three sampled Letterboxd film pages and successfully loaded an inserted `w185` profile image from `image.tmdb.org` in Chromium without a policy violation.

A direct `<img>` load is a browser-managed subresource request. It must be distinguished from content-script `fetch`/XHR and from Lettercast's application-data flow through the service worker.

## Decision

Load validated TMDB profile paths directly over HTTPS from TMDB's image CDN, using an officially documented size. Do not proxy profile images through the Cloudflare Worker in v1.

The content script still performs no `fetch` or XHR, and the service worker remains the sole application/API network egress. The TMDB movie ID remains the only Letterboxd-derived application data sent to the backend. The CDN request necessarily contains the selected TMDB profile path and ordinary network request metadata; it must not carry additional Letterboxd-derived data intentionally.

## Rationale

Direct loading works under the verified current page policy, avoids backend bandwidth and cache complexity, and keeps the Worker limited to its narrow cast-data contract.

## Consequences

TMDB's CDN participates in image delivery and receives the normal metadata associated with those requests. A failed or blocked image must fall back to a neutral placeholder without changing Letterboxd content.

Current CSP compatibility is operational evidence, not a permanent contract. A future requirement to proxy images, broaden remote hosts, or transmit more page-derived data requires architectural review and a new ADR.

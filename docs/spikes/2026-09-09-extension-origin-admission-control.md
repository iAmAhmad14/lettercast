# Spike: Extension-Origin Admission Control

**Result:** PASS — the security decision is ready; production implementation remains pending
**Investigated:** 2026-09-09

## Question

Can Lettercast authenticate or reliably admit its MV3 service-worker requests using the Chrome-extension `Origin`, or another identity-free browser signal?

## Why It Matters

R-14 proved that the production extension cannot currently use the Worker: its real service-worker fetch omitted `Origin`, while the Worker requires the exact extension Origin. Any replacement must preserve the narrow API, TMDB secret isolation, least privilege, and the prohibition on user/client identity.

## Verification Method

- Loaded the exact R-11 extension extraction in an isolated Chromium profile and visited the live Dune: Part Two page.
- Recorded only the request method, URL, body/cookie presence, Origin presence, response status, and current Letterboxd identity/cast signals.
- Sent a credential-free control request with the approved Origin.
- Reviewed Chrome's [cross-origin extension request documentation](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests), Cloudflare's [service-token documentation](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/), and the existing [native rate-limiting evidence](2026-09-08-cloudflare-workers-rate-limiting.md).

## Concrete Evidence

The live page exposed movie type `movie`, TMDB ID `693134`, one matching TMDB movie link, one cast panel, and 99 native cast links. The extension made exactly one `GET` to `/v1/movie/693134/cast`, with no body or cookie. Chromium supplied no `Origin`; production returned typed `403 UNKNOWN` with no `Access-Control-Allow-Origin`, and Lettercast left the native page unchanged.

A direct request carrying `Origin: chrome-extension://oibdnmbbockloodlflplcjdfpnnlppnl` returned `200` with the exact allow-origin response. This proves the current Worker policy functions as implemented, but also demonstrates that a non-browser client can supply the public Origin value.

Chrome documents host permissions as the mechanism allowing extension service workers to fetch remote hosts. It does not document `Origin` as an extension authentication guarantee. Cloudflare Access service tokens require a client ID and secret; an unpacked public extension cannot keep such a credential confidential.

| Option | Result |
|---|---|
| Require exact `Origin` | Rejected: blocks the verified MV3 request path. |
| Public extension-ID/custom header | Rejected as authentication: the value and extension code are public and spoofable; a non-simple header would also add protocol complexity. |
| Embedded key or signed request | Rejected: private material cannot remain secret in the extension bundle. |
| User authentication or persistent client identity | Rejected: outside v1 and contrary to privacy constraints. |
| Content-script or direct TMDB fetch | Rejected: breaks the service-worker boundary or exposes the TMDB credential. |
| Unauthenticated narrow Worker endpoint | Accepted: compatible with MV3 and honest about the endpoint's actual security boundary. |

## Result

Treat `GET /v1/movie/{tmdbId}/cast` as an unauthenticated public endpoint. Accept an absent `Origin`. If `Origin` is present, accept only the approved extension Origin and reject every other value. Emit the exact allow-origin header only for the approved supplied Origin; never emit wildcard CORS.

CORS remains browser-side abuse reduction, not authentication. The actual abuse controls are the single fixed route, strict positive-integer ID and response validation, cache-first processing, the movie-resource rate limiter, bounded TMDB access, and Cloudflare platform controls. No new client identifier or secret is introduced.

## Confidence and Limitations

Confidence is high for the observed R-11 Chromium request and the inability of a public extension value to authenticate a caller. Installed Chrome command-line automation did not load the extension in a separate temporary profile, so final stable-Chrome acceptance remains part of the repeated R-14 check.

The public endpoint can be called by scripts that omit or spoof `Origin`, and the movie-resource limiter does not prevent enumeration across many IDs. This is accepted residual risk for a showcase release, not exact abuse accounting.

## Architecture Effect

ADR 0010 supersedes the assumption that exact Origin is required for admission. Runtime boundaries, permissions, privacy rules, the TMDB endpoint, cache, and rate-limit key remain unchanged. Production code and deployment must be updated and verified before R-14 can pass.

## Remaining Uncertainty

Implementation must prove missing-Origin success, rejection of every incorrect supplied Origin, no wildcard CORS, unchanged rate-limit behavior, and successful live Chrome rendering. Aggregate Cloudflare usage should be reviewed operationally without adding user-level telemetry.

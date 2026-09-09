# Lettercast Architecture

Lettercast is a Chrome-first browser extension that adds actor profile images and character names to Letterboxd movie pages using TMDB data. This document is the current architecture source of truth for v1. Decision history lives in [`docs/decisions/`](decisions/), and implementation evidence lives in [`docs/spikes/`](spikes/).

This document distinguishes locked architectural decisions from verified implementation facts and remaining questions. It does not define a repository layout or an implementation plan.

## 1. Architecture Decisions

- Build the extension on Manifest V3 with WXT. Use pnpm as the package manager.
- Support canonical Letterboxd film-detail pages for movies only in v1.
- Use Model B rendering: add a visually distinct, extension-owned cast block and never edit Letterboxd cast nodes.
- Identify films only from TMDB identity already present on the page. Never use fuzzy title/year matching or actor identity matching.
- Separate the system into a DOM-only content script, an ephemeral MV3 service worker, and a public Cloudflare Worker.
- Make the service worker the extension's sole programmatic network egress and expose only one `get-cast` operation.
- Keep the TMDB credential only in Cloudflare as a Wrangler secret.
- Call only TMDB `GET /movie/{id}/credits`; the Cloudflare Worker is not a generic proxy.
- Use the Workers Cache API for backend caching. Do not use client-side storage in v1.
- Use Cloudflare's native Workers Rate Limiting binding for coarse abuse mitigation with the resource-scoped key `get-cast:{tmdbMovieId}`. Do not use IP or client identity. See ADR 0008.
- Load validated profile images directly from TMDB's CDN. This is a browser-managed subresource path, not a second application/API operation. See ADR 0009.
- Treat the single cast endpoint as an unauthenticated public API. Accept absent Origin, reject every incorrect supplied Origin, and never emit wildcard CORS. See ADR 0010.
- Keep permissions and data collection narrow. Do not add analytics, remote scripts, `eval`, `new Function`, or speculative permissions.

## 2. Runtime Boundaries

| Component | Owns | Must not own |
|---|---|---|
| Content script | Letterboxd DOM inspection, movie identity extraction, idempotency, request dispatch, extension-owned rendering | `fetch`/XHR, credentials, TMDB response validation, actor matching |
| MV3 service worker | Runtime-message validation, the single backend request, backend-response validation, error translation | TMDB credentials, response normalization, persistent correctness state |
| Cloudflare Worker | Request validation, TMDB credential and call, TMDB response validation, normalization, cache, rate limiting | Letterboxd DOM knowledge, user accounts, a generic proxy, a database |

The boundaries are deliberate trust boundaries. Letterboxd DOM, callers of the public Worker, backend responses, and TMDB responses are all treated as untrusted at their respective boundaries.

## 3. Verified Runtime Flow

1. At `document_idle`, the content script checks that it is on a supported film page and locates the server-rendered cast area.
2. It reads the TMDB type and ID from the page's existing TMDB signals and requires a positive movie ID with agreeing signals. Missing, invalid, conflicting, or TV identity causes a silent stop with no message.
3. It checks its own idempotency marker. If already enhanced, it stops.
4. It sends `{ type: "get-cast", tmdbId }` to the service worker.
5. The service worker validates the message and requests `GET /v1/movie/{tmdbId}/cast` from the Cloudflare Worker.
6. The Cloudflare Worker validates the method and path ID. It accepts absent Origin for the verified MV3 request path, applies the exact CORS response only when the approved extension Origin is supplied, rejects other supplied Origins, and then checks `caches.default`.
7. On a cache miss, the Worker applies the native rate limiter with `get-cast:{tmdbMovieId}` and calls TMDB `GET /movie/{id}/credits` with its Bearer secret. Numeric thresholds remain deployment configuration.
8. The Worker validates the TMDB payload, normalizes the fields Lettercast uses, caches an eligible result, and returns the narrow JSON contract.
9. The service worker validates the backend response and returns a typed success or failure to the content script.
10. On success, the content script inserts one extension-owned cast block. Profile images load directly from TMDB's CDN. On any failure, Letterboxd's page remains usable and unchanged.

No step may depend on service-worker memory surviving suspension. Optional in-memory de-duplication may only be best-effort.

## 4. Letterboxd DOM and Lifecycle

The 2026-09-08 [TMDB markup spike](spikes/2026-09-08-letterboxd-tmdb-markup.md) and [initial-markup spike](spikes/2026-09-08-letterboxd-initial-cast-markup.md) verified the following on Dune: Part Two, The Matrix, and Parasite:

```html
<body data-tmdb-type="movie" data-tmdb-id="693134">
<a href="https://www.themoviedb.org/movie/693134/"
   data-track-action="TMDB">TMDB</a>
<div id="tab-panel-cast">
  <div class="cast-list text-sluglist">...</div>
</div>
```

The current tracking value is uppercase `TMDB`, not the proposal's earlier `TMDb`. The body attributes, outbound TMDB link, and full sampled cast lists were present in initial HTML; the rendered Dune DOM matched the initial cast count. These are verified implementation facts, not a public Letterboxd contract.

The initial implementation therefore uses `document_idle` with no `MutationObserver`. If required markup is absent, it declines gracefully. A document-wide or permanent observer is prohibited. A bounded, narrowly scoped observer may be considered only if later evidence establishes asynchronous markup; it must not be added speculatively.

The outbound `/movie/{id}/` link is the primary identity signal. `body[data-tmdb-id]` and `body[data-tmdb-type="movie"]` corroborate it. The content script must decline before sending a message if the signals are absent, disagree, are invalid, or indicate a non-movie. Markup fixtures and periodic live checks must protect against drift. Logged-in, localized, experimental, and user-scoped variants were not verified by the spike.

R-15 verified that the current Task (2025) miniseries page exposes an empty movie ID and an outbound TMDB `/tv/228305/` link while retaining native cast markup. The production artifact correctly declined without a backend request or DOM change. This is implementation evidence for the existing movie-only boundary, not TV support or a reason to add fallback matching.

## 5. Rendering Model

Lettercast renders a new block built entirely from TMDB results, ordered using TMDB data. Letterboxd's own cast nodes remain untouched. This structurally avoids false actor attribution and guarantees that extension failure cannot corrupt the native cast display.

Rendering must be idempotent and use `textContent` and safe property/attribute assignment, never external-data `innerHTML`. Missing character data is omitted. Missing or failed images use a neutral placeholder.

The v1 implementation renders at most ten members in TMDB order in a responsive grid. Portraits reserve an 80-by-120 CSS-pixel area, and the renderer supplies required TMDB attribution. These are implementation details, not additional identity or matching rules.

No actor-to-actor matching is permitted, including matching by name, position, slug, or inferred ordering.

## 6. Message and Backend Contracts

The runtime contract has one request/response operation:

```ts
type GetCastRequest = { type: "get-cast"; tmdbId: number };

type GetCastResponse =
  | { ok: true; cast: CastMember[] }
  | {
      ok: false;
      error:
        | "UNSUPPORTED_MEDIA_TYPE"
        | "BACKEND_UNAVAILABLE"
        | "TIMEOUT"
        | "INVALID_ID"
        | "RATE_LIMITED"
        | "UNKNOWN";
    };
```

The Cloudflare endpoint is only:

```text
GET /v1/movie/{tmdbId}/cast
```

Its normalized success payload is:

```ts
type CastMember = {
  id: number;
  name: string;
  character: string | null;
  profilePath: string | null;
  order: number;
};

type CastResponse = { cast: CastMember[] };
```

No runtime handler accepts an arbitrary URL. No new backend operation or TMDB endpoint may be added without an architecture decision and ADR.

## 7. Validation Boundaries

- Validate runtime messages at the service-worker boundary.
- Validate Cloudflare backend responses at the service-worker boundary.
- Validate method, path ID, and allowed request shape at the Cloudflare Worker boundary.
- Validate raw TMDB payloads inside the Cloudflare Worker before normalization or caching.
- Use TypeScript types without runtime validation for internal values produced entirely by trusted Lettercast code, unless they cross a runtime boundary later.

Schemas model only fields Lettercast uses. Malformed or schema-invalid responses are never partially trusted or cached.

## 8. TMDB and Profile Images

The Worker calls only `GET /movie/{id}/credits`, once per eligible cache miss. It validates `cast[].id`, `name`, `character`, `profile_path`, and `order`, then converts empty or missing optional values to `null`. No per-actor requests or TV fallback are allowed.

TMDB's documented profile sizes currently include `w45`, `w185`, `h632`, and `original`. The [image-size spike](spikes/2026-09-08-tmdb-profile-image-size.md) verified that `w185` loads from `https://image.tmdb.org/t/p/` and supplies about two source pixels per CSS pixel when rendered at 92 CSS pixels wide. The v1 renderer uses `w185` for its 80-CSS-pixel-wide portraits. Re-evaluate the size only if a later layout exceeds the verified range or adopts responsive `srcset`; `w92` must not be treated as an official profile size merely because it currently resolves.

Direct TMDB CDN loading is the approved image-delivery path. Image proxying through the Cloudflare Worker is not justified by current evidence and would require architectural review.

## 9. Network, CSP, Permissions, and Privacy

The content script performs no `fetch` or XHR. All Lettercast API traffic flows through the service worker to the one Cloudflare origin. Inserting an approved TMDB `<img>` causes a browser-managed CDN subresource request; it is not a second application/API operation and must not become a route for arbitrary remote resources.

On 2026-09-08, the [CSP and image-loading spike](spikes/2026-09-08-letterboxd-csp-tmdb-images.md) found no CSP or report-only CSP response header and no CSP meta element on three sampled Letterboxd film pages. A live Chromium probe successfully loaded an inserted `w185` TMDB profile image with no `securitypolicyviolation`. This verifies current compatibility, not a permanent guarantee. Image errors must degrade to a placeholder without affecting the page.

Only the TMDB movie ID is sent as Letterboxd-derived application data. Lettercast must not send page URLs, titles, cookies, account state, usernames, ratings, reviews, lists, or DOM content. Direct image requests necessarily request a TMDB profile path from TMDB's CDN; this path originates in the validated backend response, not from Letterboxd identity extraction.

Manifest access must be limited to the supported Letterboxd page match and the Cloudflare Worker origin required by the service worker. Do not request `cookies`, `tabs`, `storage`, broad host access, or speculative permissions. Use HTTPS everywhere and the default MV3 extension CSP. Do not add remote scripts, `eval`, `new Function`, analytics, or a telemetry vendor.

The v1 showcase is distributed as a GitHub Release ZIP loaded manually as an unpacked extension. A committed public manifest `key` gives production builds stable Chrome extension ID `oibdnmbbockloodlflplcjdfpnnlppnl`. The public key is not a credential; corresponding private signing material must never enter Git, documentation, logs, extension output, or release artifacts.

The [extension-Origin spike](spikes/2026-09-09-extension-origin-admission-control.md) verified that the R-11 MV3 service-worker fetch omitted `Origin`. The endpoint is therefore deliberately unauthenticated and public. An absent Origin is accepted. If Origin is present, only `chrome-extension://oibdnmbbockloodlflplcjdfpnnlppnl` is accepted and echoed; every other value is rejected without an allow-origin header. Wildcard CORS is prohibited. CORS is browser-side abuse reduction, not authentication, and direct clients can omit or spoof Origin.

No custom extension-ID header, embedded client credential, user identity, or persistent client state may be added. Production diagnostics must not retain detailed `(IP, tmdbId)` histories beyond operational necessity. Credentials never enter source control or the extension bundle.

## 10. Caching and Rate Limiting

### Architectural decisions

- Use `caches.default`, not Workers KV, for normalized backend responses.
- Cache successful responses for approximately 24 hours and not-found results for approximately one hour.
- Never cache malformed, schema-invalid, authentication-failure, or transient upstream-failure responses as successful data.
- Keep v1 free of `browser.storage` and client-side caching.
- Use Cloudflare's native Workers Rate Limiting binding as coarse abuse mitigation, not authentication or exact accounting.
- Derive the rate-limit key only from the validated movie ID: `get-cast:{tmdbMovieId}`.
- Do not use IP addresses, cookies, extension/client identifiers, persistent client state, fingerprints, user accounts, or additional identifying data for rate limiting.
- Check cache before rate-limiting TMDB-hitting work so an eligible cache hit remains servable.

### Verified platform details

The [rate-limiting spike](spikes/2026-09-08-cloudflare-workers-rate-limiting.md) verified that the binding is generally available and documented for production use. Current configuration requires Wrangler 4.36.0 or later, a `ratelimits` binding, a positive-integer string `namespace_id`, and a `simple` limit with a 10- or 60-second period. Runtime use returns a `{ success }` result. Counters are per key and Cloudflare location, asynchronously updated, permissive, and unsuitable for exact accounting.

### Resource-key behavior and remaining configuration

Cloudflare accepts arbitrary string keys and documents resource- and path-specific limits. Lettercast uses `get-cast:{tmdbMovieId}`, derived only from the movie ID already present in the validated request. Requests for the same movie share a counter within a Cloudflare location. This is intentionally not a per-caller limit and does not stop broad enumeration across many movie IDs.

The counters are location-scoped, asynchronously updated, permissive, and eventually consistent. They protect upstream work coarsely and are not suitable for exact accounting. Exact request thresholds remain tunable implementation details. Availability must also be confirmed by deployment on the selected Cloudflare account; current public documentation states no binding-specific paid-plan gate, but the account has not been tested. Neither item blocks implementation planning.

## 11. Failure and Graceful Degradation

The universal rule is that failures leave Letterboxd usable and unchanged.

| Condition | Required behavior |
|---|---|
| Unsupported page, missing cast container, or invalid/ambiguous identity | Stop without a backend request or DOM change |
| TV/miniseries identity | Stop client-side; do not attempt a TV endpoint |
| Backend unavailable or timeout | Render no block |
| Invalid runtime or backend response | Return a typed failure; trust no partial payload |
| TMDB 401 | Treat as operator-side backend unavailability |
| TMDB 404 | Decline to enhance; eligible for short negative caching |
| TMDB 429 or transient 5xx | Do not create a retry storm; degrade to no enhancement |
| Empty cast | Render nothing or an honest empty state; never fabricate |
| Missing character or image | Omit the field or use the neutral placeholder |
| CDN image failure | Replace with the neutral placeholder |

The implemented TMDB request timeout is 5 seconds and the service-worker backend timeout is 10 seconds. Neither boundary retries automatically. These are bounded implementation details and do not make page usability depend on the extension.

## 12. Performance and Lifecycle Constraints

Enhancement begins at `document_idle` and never blocks Letterboxd's render. Each page view sends at most one cast operation, and each eligible backend cache miss makes at most the approved credits request. The v1 implementation performs no automatic retry and no per-actor API call.

DOM work is bounded, idempotent, and performed once. Images should be lazy-loaded with reserved dimensions or aspect ratio to limit layout shift. No document-wide observation is allowed.

## 13. Verification Strategy

Tests must follow the runtime boundaries:

- Pure tests cover ID parsing, boundary schemas, normalization, error mapping, cache keys, ordering, and any chosen cast cap.
- DOM fixture tests cover the verified `body` attributes, uppercase `TMDB` link, initial cast container, graceful selector failure, idempotency, partial data, and safe rendering.
- Service-worker tests cover cold-start-safe message handling, request validation, backend validation, and error translation.
- Cloudflare runtime tests cover absent-Origin admission, incorrect supplied-Origin rejection, exact CORS behavior, request checks, TMDB validation, Cache API behavior, secrets, and the selected rate-limit configuration.
- A small browser smoke test covers extension loading, real runtime messaging, rendering, image fallback, and service-worker wake behavior against local fixtures.

Vitest runs deterministic contract, DOM, service-worker, Cloudflare runtime, and cross-boundary integration tests. Playwright runs a limited packaged-extension smoke suite against local fixtures with all external requests intercepted. Root lint, type-check, test, build, security, and browser checks are composed by `corepack pnpm run ci` and require no production credential.

Live Letterboxd markup and CSP checks remain periodic evidence gathering, not deterministic CI. They must not make pull-request checks depend on Letterboxd or TMDB availability.

## 14. V1 Scope and Non-Goals

V1 includes movie-page detection, verified TMDB ID extraction, Model B cast rendering, one service-worker message, the narrow Worker endpoint, TMDB validation/normalization, backend caching, coarse abuse mitigation, least-privilege permissions, graceful degradation, and required TMDB attribution.

V1 excludes TV/miniseries support, actor matching, fuzzy search, lists, reviews, diary entries, person pages, embedded movie cards, Firefox release, settings UI, user accounts, a database, client storage, offline support, analytics, recommendations, and arbitrary TMDB metadata. React, a design system, and repository abstractions are not architectural requirements.

## 15. Decision and Evidence Records

The accepted ADRs in [`docs/decisions/`](decisions/) protect the architecture's major decisions. ADR 0008 replaces ADR 0006's IP-based rate-limit key with `get-cast:{tmdbMovieId}`; ADR 0006's cache, no-client-storage, and native-binding decisions remain accepted. ADR 0009 clarifies that direct profile-image subresources do not weaken the service worker's exclusive ownership of application/API egress or permit additional Letterboxd-derived data collection. ADR 0010 supersedes exact-Origin admission and treats the narrow cast endpoint as unauthenticated and public.

The completed notes in [`docs/spikes/`](spikes/) are evidence records. They support current implementation details but do not make Letterboxd markup or operational headers stable public contracts.

## 16. Remaining Questions

The original spikes, rate-limit key, and extension admission model are resolved. ADR 0010 is deployed in production and its absent-, exact-, incorrect-, malformed-, and wildcard-Origin behavior is verified. Remaining uncertainty is operational:

1. **Markup variability — operational risk.** Logged-in, localized, experimental, and future Letterboxd variants remain unsampled. Fixtures, graceful decline, and periodic live verification are the mitigation.

No architectural question remains open. R-14 live browser acceptance passed after the ADR 0010 rollout. Remaining graceful-failure and image acceptance work does not justify adding identity, storage, broader permissions, another endpoint, or wildcard CORS.

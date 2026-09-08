# Letterboxd × TMDB Cast Enhancement — Architecture Proposal

A browser extension that enhances Letterboxd film pages with actor profile images and character names sourced from TMDB. This document is the architecture design for v1 — no implementation, no folder structure, no code.

Before the walkthrough: none of the agreed technology choices are being overridden here. Where this document pushes back, it's on ambiguity the brief itself flagged as open (the cast-enhancement model, TV/movie scope) — those are being resolved, not relitigated.

---

## 1. Architecture Summary

Three components, three trust levels:

- **Content script** (Letterboxd film pages only) — reads DOM, extracts a validated TMDB movie ID, asks for cast data, renders an extension-owned block. No network, no secrets, minimal permissions.
- **MV3 service worker** — the extension's only network egress point. Validates the one message type it accepts, calls the Cloudflare Worker, translates results/errors back. Ephemeral, stateless across wake cycles.
- **Cloudflare Worker** — the extension's only privileged backend. Holds the TMDB credential, calls exactly one TMDB endpoint, validates and normalizes the response, caches it, rate-limits abuse. Untrusted-caller posture.

The two decisions everything else hangs off:

1. **Cast enhancement is extension-rendered, not Letterboxd-node-editing** (Model B) — this eliminates actor-identity matching as a problem class rather than solving it.
2. **Movie identity comes from an existing TMDB reference already on the page**, never from fuzzy title/year search — this eliminates wrong-movie risk as a problem class too.

Everything downstream (failure handling, testing, caching) is simpler because these two problems were designed away rather than defended against.

## 2. System Components and Responsibilities

| Component | Owns | Does not own |
|---|---|---|
| Content script | Letterboxd DOM reading/writing, identity extraction, idempotency, request dispatch | Network calls, credentials, business validation of TMDB shape |
| Service worker | Message validation, single fetch to Worker, error translation | TMDB credential, response normalization, caching |
| Cloudflare Worker | TMDB credential, TMDB call, response validation/normalization, caching, rate limiting | Anything Letterboxd-specific, user accounts, persistence beyond cache |

Five conceptual modules (not necessarily five files, not five classes): Letterboxd DOM adapter, extension orchestration (content script glue), runtime-message contract, TMDB/backend response contract (shared types), Cloudflare TMDB adapter. Each is a boundary because a different *external system* changes independently on the other side of it (Letterboxd's markup, TMDB's schema, the extension's own message shape).

## 3. End-to-End Runtime Data Flow

1. User navigates to a canonical Letterboxd film page → content script runs.
2. Content script confirms page shape (cast container present) and extracts + validates a TMDB movie ID (see §8). Invalid/absent/TV → stop, page untouched.
3. Content script checks for its own idempotency marker on the cast container; if present, stop.
4. Content script sends one message: `{ type: "get-cast", tmdbId: <number> }` to the service worker.
5. Service worker validates the message shape (Zod), `fetch`es the Cloudflare Worker at `GET /v1/movie/{tmdbId}/cast`.
6. Cloudflare Worker validates the request (method, id shape, Origin), checks its edge cache, on miss calls TMDB `GET /movie/{id}/credits` with the Bearer secret, validates the TMDB response (Zod), normalizes to `{cast: [{id, name, character, profilePath, order}]}`, writes cache, returns JSON with `Cache-Control`.
7. Service worker receives the response, maps non-2xx/timeout/parse-failure to a typed error, returns `{ok: true, cast} | {ok: false, error}` to the content script.
8. Content script renders an extension-owned block from `cast` (or does nothing on error), marks the container as enhanced.

No step depends on state surviving a service-worker sleep/wake cycle.

## 4. Content Script Boundary

**Responsibilities:** page-shape detection, TMDB ID extraction/validation, cast-container location, idempotency check, one outbound message, DOM rendering via `textContent`/attribute assignment (never `innerHTML` with TMDB- or DOM-derived strings), lifecycle handling.

**Explicitly excluded:** any `fetch`, any credential, any decision about *what counts as valid TMDB data* (that's the shared contract, validated on the service-worker/Worker side — the content script trusts the shape it's handed only because it already went through Zod upstream, not because it re-validates).

**Injection timing:** run at `document_idle`. Letterboxd's film pages are server-rendered per-navigation (not a client-routed SPA for the film→film case), so a fresh content-script execution per film page load is the expected model — this is an assumption to confirm, not treated as certain (see §23). Given that, the default is: no MutationObserver at all. If a spike shows cast markup arrives after initial paint (e.g., behind a "Show All" expando), the fallback is a single `MutationObserver` scoped to the cast container's parent node only, disconnected after first successful read or after a bounded timeout — never `document.body`-wide, never permanent.

**Idempotency:** on successful enhancement, set a data attribute (e.g. `data-lbtmdb-enhanced="1"`) on the cast container. Every entry point checks this first. This is also what makes re-running safe if Letterboxd re-renders part of the page.

## 5. Service Worker and Messaging Boundary

**Why it exists at all:** a content script's network requests run in the context of the host page and are subject to that page's Content-Security-Policy `connect-src` — Letterboxd could tighten its CSP at any time and silently break a content-script-originated `fetch` to your Cloudflare domain, with no way for you to detect or prevent it. A background/service-worker context's network requests are governed by the *extension's* permissions, not the visited page's CSP. That's the concrete reason to route all egress through the service worker rather than fetching directly from the content script. Secondary benefits: it lets the content script hold zero permissions beyond its Letterboxd match pattern, and it centralizes message/error handling in one place.

**Lifecycle:** register the `onMessage` listener at the top level of the entrypoint module (fires reliably on wake). Treat every invocation as a cold start. Any in-memory de-dupe of concurrent identical requests (a nice-to-have, not required) must be documented as best-effort and safe to lose — never load-bearing.

**Messaging contract:** one operation, request/response (not a port — there's no ongoing conversation, just one round trip per page):

```
Request:  { type: "get-cast", tmdbId: number }
Response: { ok: true, cast: CastMember[] }
        | { ok: false, error: "UNSUPPORTED_MEDIA_TYPE" | "BACKEND_UNAVAILABLE"
                            | "TIMEOUT" | "INVALID_ID" | "RATE_LIMITED" | "UNKNOWN" }
```

The service worker validates the inbound message with Zod even though it currently only receives messages from its own content script — the boundary is validated because it's a trust boundary in principle (extension code, running against untrusted page context), not because a hostile page is expected to be message-capable (a page can't call `chrome.runtime.sendMessage` into the extension without `externally_connectable`, which is not declared here). No generic "fetch this URL" operation is ever exposed, by design.

## 6. Cloudflare Worker Boundary

Responsibilities, and why each belongs here specifically: validate the request (method + numeric id + Origin check against `chrome-extension://<known-id>` and/or CORS allow-list); hold and apply the TMDB Bearer secret; call exactly one TMDB endpoint; validate TMDB's response shape before trusting it; normalize to the extension's own compact shape; cache the normalized response; apply proportionate rate limiting; translate upstream failures to a small stable error vocabulary; emit minimal diagnostics.

**Explicitly not:** a generic proxy, a generic "any TMDB endpoint" pass-through, a user-account backend, or a database — none of those serve the stated purpose (protect the credential, expose a narrow contract), so they're excluded rather than deferred.

**Origin/CORS as an operational control, not authentication:** checking the `Origin: chrome-extension://<id>` header and/or a CORS allow-list filters out casual/browser-based abuse and stray traffic. It is trivially spoofable by anyone making a direct HTTP request with curl — that's stated plainly, not glossed over. It pairs with rate limiting as *layered* mitigation, never presented as auth.

**TMDB call shape:** `GET /movie/{id}/credits` — not `?append_to_response=credits` on the full movie-details endpoint, because title/poster/overview aren't needed (Letterboxd already renders those); pulling them would mean validating and then discarding fields the product never uses.

**Rate limiting mechanism:** Cloudflare's native Workers Rate Limiting binding is the right fit here rather than a KV-based counter or an external service. It gives a Worker a counter to consult per request — pass a key such as an IP and get back whether that key is within budget — with no separate cloud resource to provision; the limit configuration ships with the binding itself. Configure a `simple` limiter keyed on `CF-Connecting-IP`, with a period of 10 or 60 seconds and a request-count limit generous enough for a single Letterboxd browsing session but well below what a scraping loop would sustain. Its real limitation, worth stating plainly: it's a binding-local counter, not a globally synchronized one — treat it as coarse abuse mitigation, not exact usage metering. On a 429, cache remains servable (a rate-limited caller can still get a *cached* response if one exists — the throttle targets TMDB-hitting work, not all traffic).

- **Recommendation / why / tradeoff / status:** Use the Rate Limiting binding over KV-based manual counting → simpler, no extra namespace to manage, purpose-built. Tradeoff: coarser/approximate, and it's a relatively newer Cloudflare primitive so worth a quick confirmation at implementation time that it's available on the account tier in use. **Hard v1 decision** (the Worker is public and discoverable the moment it's deployed, so *some* mitigation is not optional) but the exact limit numbers are safely tunable later.

## 7. TMDB Integration Strategy

- Credential: Wrangler secret, Cloudflare-only, never touches the extension bundle.
- Endpoint: `GET /movie/{id}/credits`, single call per cache-miss request — no per-actor requests, since the credits endpoint already returns the full cast array.
- Runtime validation: Zod schema for exactly the fields used (`cast[].id`, `.name`, `.character`, `.profile_path`, `.order`); everything else in TMDB's response is ignored, not modeled.
- Normalization: `{cast: [{id, name, character: string | null, profilePath: string | null, order: number}]}`, cast list capped (e.g., top ~25 by TMDB's own `order`) to bound payload/DOM size for ensemble films.
- Empty/missing `character` → `null`, rendered as omitted, never as a placeholder guess.
- Missing `profile_path` → `null`, rendered with a neutral placeholder, never a broken image.
- 401 (bad/expired credential) → this is an operator-side incident, not a per-request condition: translate to `BACKEND_UNAVAILABLE` for the client and treat as an alert-worthy condition in Worker logs.
- 404 → surfaced to the client as "decline to enhance," no TV fallback attempted.
- 429 from TMDB → back off, surface `BACKEND_UNAVAILABLE`/negative-cache briefly, don't retry synchronously against the user's request.
- 5xx/timeout → one short retry (small timeout budget, no exponential backoff chain) then surface `BACKEND_UNAVAILABLE`.
- Timeout budget: a few seconds total for the TMDB call; the content script's own wait should be short enough that a slow backend degrades to "no enhancement" rather than a visibly hung page.

## 8. Letterboxd Integration and Cast-Matching Strategy

**Page scope (v1):** canonical film-detail pages only — `letterboxd.com/film/<slug>/` and equivalent user-scoped variants of the *same* film page. Explicitly **not** supported: lists, individual reviews, diary entries, search results, actor/person pages, or movie cards embedded in other pages. This is a deliberate scope cut, not an oversight.

**Movies vs. TV — explicit decision: movies only, no TV/miniseries handling in v1.** Letterboxd sources its film metadata from TMDB, and Letterboxd's own tooling treats this as fundamentally movie-shaped: its TMDB-import mechanism is documented as valid only for movies, explicitly not for TV shows. Supporting TV would mean a second TMDB endpoint shape (`/tv/{id}/aggregate_credits`, episode-scoped cast, different `character` semantics) for a page type the brief already said to avoid unless there's a strong reason — there isn't one yet.

**Movie identification (the load-bearing decision):**

- Community-documented Letterboxd markup exposes TMDB identity two ways: a `data-tmdb-id` attribute present on at least one page element, and a separate outbound anchor carrying `data-track-action="TMDb"` whose href points at the film's TMDB page. This is directionally reliable but not certain-as-of-today — Letterboxd's markup isn't a public contract and could have shifted since that was documented; confirming current markup is listed as an implementation spike in §23, not assumed here.
- **Primary signal:** the TMDb outbound anchor's href, because its path segment (`/movie/{id}-slug` vs `/tv/{id}-slug`) disambiguates media type *and* ID in one read — a semantic DOM signal, not a layout-position guess.
- **Corroborating signal:** the `data-tmdb-id` attribute, used to cross-check the ID parsed from the anchor when both are present.
- **Validation:** ID must parse as a positive integer; media-type segment must be `movie`. If the two signals disagree, or only one is present with no way to confirm media type, or the segment is `tv`, or nothing is found — **decline to enhance.** No fuzzy title/year search is ever attempted as a fallback; a plausible-but-wrong ID is strictly worse than no enhancement.
- This check happens **client-side, before any message is sent** — a `/tv/` link means zero network calls, not a wasted round trip that comes back 404.

**Cast enhancement model — explicit decision: Model B (extension-owned rendering), not Model A (editing Letterboxd's existing cast nodes).**

Why B and not A: Model A requires matching a Letterboxd-rendered actor name to a specific TMDB cast entry — by name string, by position, or some combination — and every one of those is fragile in ways that produce *silently wrong* attribution: TMDB and Letterboxd can differ in cast ordering, credited-as names, romanization, an actor appearing twice (multiple roles), or one dataset simply lagging the other by the sync window Letterboxd itself documents. Given the stated invariant — wrong metadata is worse than omitted metadata — the only way to make wrong-actor-attribution *structurally impossible*, rather than merely unlikely, is to not attempt entry-level identity matching at all.

So: the content script leaves Letterboxd's existing cast markup **completely untouched** and inserts a new, extension-owned, visually distinct block (e.g. "Cast, via TMDB" with its own container class) built entirely from the TMDB response, ordered by TMDB's own `order` field, next to the original. If the extension fails at any point, the original cast list is exactly as it always was — nothing was ever at risk of being wrong, because nothing existing was ever touched. The failure mode this model produces is "TMDB's cast list is incomplete/differs slightly from Letterboxd's," which is a disclosed data-completeness limitation, not a false-attribution incident.

- **Recommendation:** Model B. **Why:** structurally eliminates the wrong-attribution failure class rather than mitigating it. **Tradeoff:** two cast presentations visible on the page instead of one enriched presentation — slightly more visual footprint, and it doesn't "fix" Letterboxd's own list if Letterboxd's happens to be stale. **Status: hard v1 decision** — it changes what the DOM adapter needs to do and what the Worker's response shape needs to support, so it's not something to leave open into implementation.

## 9. Data Models and Validation Boundaries

Three schemas, three places, deliberately not unified into one "shared package" abstraction beyond what's needed:

- **TMDB raw → validated (Cloudflare Worker, Zod):** only the fields listed in §7.
- **Backend contract (Cloudflare Worker → service worker, Zod on the service-worker side too — never trust the network call blindly):** `{cast: [{id: number, name: string, character: string | null, profilePath: string | null, order: number}]}`.
- **Runtime message contract (content script ↔ service worker, Zod on the service-worker side):** the request/response shapes in §5.

Internal-only shapes (e.g. a DOM-rendering view model derived from `CastMember`) use plain TypeScript types — no runtime validation needed for data the extension's own code produced.

## 10. Security and Privacy Model

**Trust boundaries, explicitly:**

1. Letterboxd DOM → content script: **untrusted** (external, mutable markup).
2. Content script → service worker: validated defensively, though practically same-extension.
3. Service worker → Cloudflare Worker: an owned backend, but still validate the response — a compromised/misconfigured Worker deploy shouldn't get a free pass.
4. Any caller → Cloudflare Worker: **untrusted** (publicly reachable, discoverable).
5. TMDB → Cloudflare Worker: external API, validated before use.

**What leaves the browser: exactly one thing — a TMDB movie ID.** Not the Letterboxd URL, not the page title, not cookies, not session/auth state, not username, not ratings/reviews/lists, not arbitrary DOM/HTML, not browsing history in any broader sense. The extension never reads `document.cookie` or any Letterboxd-authenticated state, and has no reason to request `cookies` permission.

**Worth naming plainly rather than hand-waving:** a TMDB movie ID *is* browsing-activity data — it tells you what film the user is currently looking at. Combined with an IP address in a request log, a series of these over time is a re-derivable watch-page history. This is why:

- Production logs should not retain `(IP, tmdbId)` pairs beyond what's operationally necessary for abuse response — short retention, ideally aggregate/count-based rather than per-request-detailed where Cloudflare's tooling allows it.
- No analytics/telemetry vendor in v1 — none is needed for the product to function, and adding one would mean shipping a third party into the one part of the data flow that's genuinely privacy-sensitive.
- Development diagnostics (verbose per-request logging, response bodies) are dev-only and must not ship to production logging config.

**Hard security rules, restated as commitments rather than aspirations:** no TMDB secret ever enters the extension bundle (it exists only as a Wrangler secret); no secrets in the repo; no remote script loading (MV3's default CSP already forbids this — no custom CSP override needed); no `eval`/`new Function`; no generic "fetch anything" message operation; all DOM text sourced from TMDB is inserted via `textContent`/property assignment, never `innerHTML`; HTTPS only, everywhere.

## 11. Permissions / CSP Approach

- **Content-script match pattern:** the narrowest pattern that matches canonical film pages only (e.g. `*://letterboxd.com/film/*`), not `*://*.letterboxd.com/*`. Manifest-declared `matches` for a content script is sufficient for it to run and read/write that page's DOM — it does not by itself grant it network reach elsewhere.
- **Host permissions:** the Cloudflare Worker's origin, needed only by the background/service-worker context for its `fetch` call. The content script needs none.
- **API permissions:** none beyond `scripting`/whatever WXT's manifest generation requires for the declared content script — no `cookies`, no `tabs`, no `storage` (see below), no broad host permission.
- **CSP:** rely on MV3's default extension CSP (`script-src 'self'`, no remote code) rather than declaring a custom, looser one. There's no feature here that needs one.
- No speculative permissions "for later" — Firefox and future features get their own permission requests when they're actually built.

## 12. Caching / Rate-Limiting Strategy

**Client-side (browser.storage): none in v1 — explicitly.** There's no settings UI, no user-specific data worth persisting, and the backend cache already removes the redundant-TMDB-call problem across *all* users, not just one. A per-browser cache would add storage schema, invalidation, and quota-handling complexity for a marginal win. If this changes — e.g. an offline-tolerance requirement emerges — that's a new, justified requirement, not a default.

**Backend caching:** use the Workers **Cache API** (`caches.default`), not Workers KV, as the primary mechanism. Cache key: the normalized request URL, e.g. `https://<worker-host>/v1/movie/{id}/cast`. Freshness: set `Cache-Control: public, max-age=86400` (~24h) on successful normalized responses — cast data changes rarely, and Letterboxd itself documents a real sync lag against TMDB, so a day-scale TTL is consistent with how fresh the underlying data realistically is anyway. Negative caching: cache a 404-equivalent ("not found on TMDB") for a much shorter TTL (e.g. 1h) so a transient TMDB hiccup doesn't get baked in as a false negative for a full day. Malformed/validation-failure responses are **never** cached — always retried fresh next time, since caching a bad shape would compound a bug.

**Why Cache API over KV here:** it's zero-additional-infrastructure (no namespace to provision/bind), and the consistency model it offers (per-edge-location, eventually-consistent-enough) is a fine match for idempotent, non-critical GETs where an occasional cache miss just means one extra TMDB call — not a correctness problem. KV would buy global consistency and explicit programmatic TTL control at the cost of an extra binding and slightly higher write latency; worth revisiting only if hit-rate visibility across regions becomes something that actually needs reasoning about.

**Rate limiting:** covered in §6 — Workers Rate Limiting binding, keyed on IP, interacts with caching such that a rate-limited request can still be served from cache.

## 13. Failure and Graceful-Degradation Strategy

Universal rule: **the underlying Letterboxd page is never broken by extension failure.** Every failure mode below resolves to "leave the page as Letterboxd rendered it" or "render a partial, honestly partial, extension block" — never a guess.

| Condition | Behavior |
|---|---|
| Unsupported Letterboxd page (not a film page) | Content script never activates (match pattern) |
| Missing/invalid TMDB identifier | Decline silently; no message sent |
| TV/miniseries-backed entry | Decline client-side before any request (see §8) |
| Missing cast container | Decline; log dev-only diagnostic |
| Backend unavailable | No block rendered; page unaffected |
| Network timeout | Same as backend unavailable |
| TMDB auth failure (401) | Surfaced to client as `BACKEND_UNAVAILABLE`; alerting concern on the ops side |
| TMDB 404 | Decline to enhance; short negative cache |
| TMDB 429 | `BACKEND_UNAVAILABLE` to client; no synchronous retry storm |
| TMDB 5xx | One bounded retry, then `BACKEND_UNAVAILABLE` |
| Schema validation failure (either boundary) | Treated as `UNKNOWN`/backend error; never partially trusted |
| Zero cast returned | Render nothing, or a minimal "no cast data available" note — never fabricate |
| Partial cast data (some missing character/image) | Render what's present; omit the missing field per-entry |
| "Actor match failure" | N/A by design — Model B has no per-actor matching step to fail |
| Missing profile image | Neutral placeholder, not a broken `<img>` |
| Missing character name | Omit the character line for that entry |
| Image load failure at render time | `onerror` swap to the same neutral placeholder |

## 14. Performance Strategy

Enhancement starts at `document_idle`, after Letterboxd's own render — never blocking or racing the host page. One network round trip per page view (content script → service worker → Cloudflare, cache-hit path is typically the common case after the first global request for a given film). No N+1 TMDB calls (credits endpoint returns the full cast in one call). DOM work is bounded (a capped-length list, built once, inserted once). Images use native `loading="lazy"` and reserved dimensions/aspect-ratio placeholders to avoid layout shift as they load. No document-wide observation (§4/§8) — the single largest avoidable performance/complexity cost in a Letterboxd-adjacent extension is exactly that kind of blanket DOM watching, and it's excluded by design, not by discipline.

## 15. Testing Architecture

**Pure/unit (Vitest, no DOM/network):** TMDB-ID extraction/parsing and its validation rules, response normalization (TMDB raw → backend contract), error-code mapping, cache-key derivation, cast-list capping/ordering logic.

**Vitest + jsdom:** Letterboxd fixture parsing against saved HTML snapshots (including a "markup changed, our selector no longer matches" fixture, asserting graceful decline, not a crash); enrichment against a fixture with a well-formed cast container; idempotency (run twice on the same DOM, assert single block); partial-data rendering; safe-output assertions (no raw HTML strings ever reach the DOM as markup).

**Service-worker tests:** exercise the `onMessage` handler directly with an in-memory fake of the extension APIs rather than a real browser — WXT's own testing setup wraps exactly this: its Vitest integration polyfills the extension API with an in-memory implementation, built on the same cross-browser `browser` API abstraction WXT provides at build time, so the same handler code is exercised under test as under Chrome. This is enough to cover message validation and error-mapping without spinning up a real browser for every test.

**Cloudflare Worker tests:** request validation (method/shape/Origin), the TMDB adapter (mocked fetch, exercising the 401/404/429/5xx/timeout paths), response normalization, and cache-decision logic (does a given TMDB response get cached, with what TTL, and is a validation failure correctly *not* cached). A Cloudflare-specific Vitest pool (running against the actual `workerd` runtime rather than Node/jsdom mocks) is worth using specifically for the Cache API and secrets-binding behavior — those are exactly the parts that behave subtly differently outside the real runtime, and this project is small enough that adopting it doesn't add meaningful overhead.

**Playwright — intentionally small:** real extension load, real content-script execution against a **local static fixture page** styled like a Letterboxd film page (never live Letterboxd — markup drift would make CI flaky for reasons outside anyone's control), real runtime messaging end-to-end, and a service-worker wake/response smoke test. What's *not* practical to guarantee automatically: that today's selectors still match Letterboxd's actual production markup — that's a live-monitoring/manual-spot-check concern, not a CI-automatable one.

## 16. Observability / Debugging

Development: content-script `console.debug` behind a build-time flag (stripped in production builds), service-worker inspection via the extension's own DevTools background page, Cloudflare Worker `wrangler tail` during development. Structured error categories (the same enum from §5) used consistently across all three layers so a symptom maps to one of a small, known set of causes. Production: no verbose logging, no request-body/PII-adjacent logging, error counts/categories only where Cloudflare's own tooling provides them for free — no bespoke telemetry platform.

## 17. V1 Must Have / Should Have / Later

**MUST HAVE:** film-page detection + TMDB ID extraction/validation (§8); Model-B cast rendering; service worker + narrow message contract; Cloudflare Worker with credential protection, TMDB call, validation, normalization; backend caching (Cache API); basic rate limiting; graceful-degradation behavior for every case in §13; least-privilege manifest permissions; TMDB attribution notice (minimal form).

**SHOULD HAVE:** negative caching for TMDB 404s; a small Playwright smoke suite; a Cloudflare-specific Vitest test pool; lazy image loading with placeholder sizing.

**LATER:** additional cast metadata beyond image/character; Firefox build; any client-side cache; any settings/options UI beyond the attribution notice; multi-page-type support (lists, reviews, actor pages); TV/miniseries handling.

**Not entering v1, by design, not oversight:** React, a settings UI, user accounts, a database, analytics, recommendations, reviews/ratings features, arbitrary TMDB metadata beyond cast, multiple Letterboxd page types, a Firefox release, offline support, client-side sync, a generic backend framework, a premature design system, speculative abstraction layers.

## 18. Non-Goals

Not a general Letterboxd-enhancement platform. Not a TMDB proxy for other extensions or third parties. Not a data-collection product — no user profiling, no cross-session identity, no analytics. Not an authentication system — the CORS/Origin check is abuse mitigation, stated plainly as such, not security theater dressed up as auth.

## 19. Future Firefox Considerations

Nothing in this design is Chrome-exclusive at the architecture level: WXT treats cross-browser output (Chrome, Firefox, Safari, Edge) as a first-class build target and provides a unified `browser` API wrapper over the Chrome/Firefox namespace differences, so writing against that abstraction now costs nothing and pays off later. The one thing that would make Firefox support *materially* harder if done carelessly: leaning on Chrome-specific service-worker quirks instead of the `browser.runtime` messaging shape — this design already avoids that by keeping the message contract minimal and framework-abstracted. Nothing here is deferred *by adding* Firefox-specific code paths now — it's deferred by simply not writing anything that would need undoing.

## 20. Agentic Development Boundaries

**Good independent-agent-task seams** (mapping to the module boundaries in §2, not coincidentally): the Letterboxd DOM adapter (fixture-driven, testable in isolation); TMDB response normalization; the Cloudflare Worker's request-handling/validation/rate-limiting; test fixtures themselves; the Playwright smoke layer.

**Boundaries future agents must not cross casually:**

- An agent working the DOM adapter must not change the runtime-message contract shape.
- An agent working the Cloudflare Worker must not introduce a second TMDB endpoint or a generic proxy operation without a new ADR.
- No agent adds `browser.storage`, a new permission, or a new host_permission without that being a deliberate, documented decision — not an incidental implementation convenience.
- No agent reintroduces per-actor identity matching (i.e., quietly drifts back toward Model A) — this is the single invariant most worth protecting, since it's the one a "helpful" agent might reach for without realizing the tradeoff was already made deliberately.
- No agent adds a document-wide `MutationObserver` as a "just in case" fix for a flaky selector.

## 21. ADR-Worthy Decisions

Cast enhancement: Model B over Model A. Movie identification: existing-TMDB-reference extraction over fuzzy matching. Scope: movies-only, canonical film pages only, no TV in v1. Service worker as the sole egress point (CSP-of-host-page justification). Messaging: single narrow request/response operation, not a generic fetch bridge. Caching: Workers Cache API over KV. Rate limiting: native Rate Limiting binding, framed as abuse mitigation not authorization. Images: direct-from-TMDB-CDN, not proxied through Cloudflare (pending the CSP spike in §23). No client-side storage in v1.

## 22. Documentation Topics to Create Later

Architecture overview; runtime/data flow; extension boundary responsibilities; MV3 lifecycle assumptions; Letterboxd DOM adapter strategy (and its fixture-update process); TMDB integration/contract; backend request/response contract; security model and trust boundaries; privacy/data-minimization statement (useful verbatim input for the Chrome Web Store privacy disclosure, too); caching and rate-limiting policy; failure-handling matrix (§13 is a first draft of this); testing strategy per layer; observability/debugging guide; deployment boundaries (extension vs. Worker release independence); the ADR list from §21; deferred-decisions log; future-Firefox notes; agent-development invariants.

## 23. Open Questions / Implementation Spikes

These are explicitly *not* decided here — they need a browser/live-site check before implementation, not an assumption baked into the architecture:

1. **Confirm current Letterboxd markup** for the `data-tmdb-id` attribute and the `data-track-action="TMDb"` anchor against today's live film pages — the source behind §8 is not fresh, and Letterboxd's markup is not a contract.
2. **Confirm whether cast content is present in initial HTML** or arrives after an async/expand interaction — determines whether the fallback scoped-observer path in §4/§8 is needed at all.
3. **Confirm whether Letterboxd's page-level CSP restricts `img-src`** in a way that would block content-script-inserted `<img>` tags pointing at `image.tmdb.org` — this determines whether "direct from TMDB CDN" (the default recommendation) actually works, or whether images need proxying through Cloudflare after all.
4. **Confirm current availability/limits of the Workers Rate Limiting binding** on the Cloudflare account tier in use before committing wrangler config to it.
5. **TMDB profile image size choice** (e.g. `w185` vs `w92`) — a quick visual check against Letterboxd's existing layout width, not an architectural question.

## 24. Final Architecture Decisions

- **Scope:** canonical Letterboxd film pages, movies only, no TV.
- **Identity:** existing TMDB reference on the page (outbound TMDb link primary, `data-tmdb-id` corroborating); decline on absence/mismatch/TV; no fuzzy matching, ever.
- **Cast model:** extension-owned rendering (Model B), additive to Letterboxd's own markup, never editing or replacing it.
- **Boundaries:** content script (DOM only) → service worker (sole egress, ephemeral, stateless) → Cloudflare Worker (credential, TMDB call, validation, normalization, caching, rate limiting).
- **Messaging:** one narrow request/response operation, Zod-validated, typed error vocabulary.
- **Storage:** none in v1.
- **Caching:** Workers Cache API, ~24h positive / ~1h negative TTL.
- **Rate limiting:** native Rate Limiting binding, IP-keyed, framed as abuse mitigation.
- **Images:** direct from TMDB's CDN, lazy-loaded, pending the CSP spike.
- **Security:** least-privilege manifest, no secret in the extension, default MV3 CSP, no generic proxy anywhere in the system.
- **Testing:** unit → jsdom → service-worker (fake-browser) → Cloudflare Worker (real-runtime pool) → small Playwright smoke, in that order of volume.

This is precise enough to hand to the next phase (repo layout, task breakdown for Codex CLI) without reopening any of the above — the open items in §23 are verification spikes, not undecided architecture.

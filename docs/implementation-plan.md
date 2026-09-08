# Lettercast v1 Implementation Plan

## Readiness Gate

Planning may proceed. The architecture, accepted ADRs, and five completed spikes contain no unresolved issue that materially blocks implementation. The remaining items are bounded implementation or deployment work:

- verify the native rate-limit binding on the selected Cloudflare account;
- select and approve a numeric limit with a supported 10- or 60-second period;
- confirm that the final portrait width remains at most about 92 CSS pixels when using `w185`;
- mitigate unverified Letterboxd variants through fixtures, fail-closed behavior, and periodic live checks.

These items must be completed in the tasks below and must not be resolved by adding identity, storage, broader permissions, another TMDB endpoint, fuzzy matching, actor matching, or a document-wide observer.

## Plan Conventions

The expected layout is a minimal pnpm workspace with `apps/extension`, `apps/worker`, `packages/contracts`, and `tests/e2e`. Task LC-001 establishes the actual tool-native paths; later path references mean those paths or their documented equivalents. It also creates the canonical root scripts. After LC-001, every task runs the relevant subset of `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`; browser smoke tests use `pnpm test:e2e`, and the final aggregate check uses `pnpm ci`.

## LC-001 — Scaffold the Workspace and Toolchain

**Objective:** Create the smallest buildable pnpm workspace for the WXT MV3 extension, Cloudflare Worker, shared contracts, and tests.

**Dependencies:** None.

**Expected files/modules:** Root `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, TypeScript and lint configuration; `apps/extension/`; `apps/worker/`; `packages/contracts/`; test configuration.

**Implementation work:** Pin supported Node and pnpm versions; scaffold WXT as Manifest V3 and a module-format Worker compatible with the currently verified Wrangler API; enable strict TypeScript; add unit/DOM/Worker test environments; create root scripts for lint, type-check, unit tests, build, end-to-end tests, and aggregate CI. Keep entrypoints inert and request no speculative permissions. Record only conventions enforced by committed configuration.

**Definition of done:** A clean install produces both artifacts from empty entrypoints, the generated extension manifest is MV3, and all root scripts exist and return successfully.

**Tests required:** Baseline test-runner smoke tests for each workspace package and an assertion that the extension manifest version is 3.

**Validation:** `pnpm install --frozen-lockfile`; `pnpm lint`; `pnpm typecheck`; `pnpm test`; `pnpm build`.

**References:** Architecture §§1–2, 13; ADR 0001; ADR 0002.

## LC-002 — Define Shared Contracts and Boundary Schemas

**Objective:** Make the one allowed operation and its runtime validation explicit without validating trusted internal values redundantly.

**Dependencies:** LC-001.

**Expected files/modules:** `packages/contracts/src/` modules for cast types, runtime messages, backend payloads, errors, and their boundary parsers; package tests.

**Implementation work:** Define `CastMember`, `CastResponse`, `GetCastRequest`, and the typed `GetCastResponse` union exactly as documented. Add parsers for inbound runtime messages and backend success/error payloads. Accept only `type: "get-cast"` and a positive integer `tmdbId`; reject unknown operations, arbitrary URLs, malformed members, unsafe/non-relative profile paths, and unexpected response shapes. Keep the raw TMDB schema Worker-local because it belongs to a different boundary.

**Definition of done:** Extension packages consume one shared contract package, invalid external values cannot become trusted types, and no extra message or backend operation exists.

**Tests required:** Valid and invalid IDs; unknown fields/operations; malformed cast entries; every documented error code; missing, nullable, and wrong-type fields.

**Validation:** `pnpm lint`; `pnpm typecheck`; `pnpm test`; `pnpm build`.

**References:** Architecture §§6–7; ADR 0002; ADR 0003.

## LC-003 — Build the Cloudflare HTTP Boundary

**Objective:** Implement the public Worker's narrow request boundary independently of TMDB behavior.

**Dependencies:** LC-002.

**Expected files/modules:** `apps/worker/src/index.ts` plus route, request-validation, CORS/origin-policy, and response helpers; Worker boundary tests.

**Implementation work:** Accept only `GET /v1/movie/{tmdbId}/cast`; parse a positive integer path ID; reject other methods, paths, query-driven upstream targets, and invalid IDs. Implement the documented operational Origin/CORS policy as a layered control, not authentication. Return bounded, non-sensitive errors and inject downstream dependencies so tests never require live TMDB.

**Definition of done:** The Worker exposes exactly one route, cannot proxy arbitrary URLs, emits consistent JSON responses, and does not log page data, credentials, or detailed viewer histories.

**Tests required:** Allowed route; invalid/overflow ID; wrong method; extra path/query attempts; allowed/disallowed or absent Origin behavior; no upstream call on rejected requests.

**Validation:** `pnpm --filter <worker-package> test`; `pnpm typecheck`; `pnpm build`, substituting the actual package name established in LC-001.

**References:** Architecture §§2, 6–7, 9, 11; ADR 0002; ADR 0003; ADR 0007.

## LC-004 — Implement TMDB Credits Fetching and Normalization

**Objective:** Retrieve and normalize only the movie credits data required by Lettercast.

**Dependencies:** LC-003.

**Expected files/modules:** Worker-local TMDB client, raw-response schema, normalizer, error mapping, environment types, and tests.

**Implementation work:** Read the Bearer credential only from the Worker environment; call only `GET /movie/{id}/credits`; apply a bounded timeout and no automatic retry unless separately justified by evidence. Validate raw `cast[].id`, `name`, `character`, `profile_path`, and `order` before use. Normalize empty optional values to `null`, preserve TMDB ordering deterministically, and expose only the shared cast contract. Map 401, 404, 429, timeout, malformed JSON, schema failure, and transient 5xx without leaking upstream details.

**Definition of done:** One eligible invocation makes at most one credits request, malformed data is never partially trusted, and neither credentials nor arbitrary TMDB fields reach the client.

**Tests required:** Normal payload; empty cast; null/empty optional fields; malformed JSON/schema; 401/404/429/5xx; timeout; URL and authorization-header assertions; proof that no other endpoint is called.

**Validation:** Worker unit tests; `pnpm lint`; `pnpm typecheck`; `pnpm build`.

**References:** Architecture §§3, 6–8, 11–12; ADR 0002; ADR 0003; ADR 0005.

## LC-005 — Add Workers Cache API Behavior

**Objective:** Cache normalized results at the edge without making cache state necessary for correctness.

**Dependencies:** LC-004.

**Expected files/modules:** Worker cache-key and cache-policy modules, request pipeline integration, and cache tests.

**Implementation work:** Use `caches.default` with a canonical key derived from the fixed route and validated movie ID. Check cache before rate limiting or TMDB access. Cache successful normalized responses for approximately 24 hours and not-found results for approximately one hour. Do not cache malformed/schema-invalid responses, authentication failures, rate limits, timeouts, or transient upstream failures. Ensure a cache miss or edge-local eviction merely causes another valid request.

**Definition of done:** Eligible hits bypass both limiter and TMDB; positive and negative entries have the intended TTL class; prohibited failures never become cached success data.

**Tests required:** Hit/miss; canonical keys; positive and 404 TTLs; cache write/read failure; prohibited-cache status matrix; concurrent requests remain correct even if duplicated.

**Validation:** Worker cache tests; `pnpm test`; `pnpm typecheck`; `pnpm build`.

**References:** Architecture §§3, 10–12; ADR 0006; ADR 0008.

## LC-006 — Add Resource-Scoped Native Rate Limiting

**Objective:** Protect cache-miss TMDB work with Cloudflare's native binding and no caller identity.

**Dependencies:** LC-005.

**Expected files/modules:** Worker environment/binding types, rate-limit adapter, request-pipeline integration, Wrangler environment configuration, and tests.

**Implementation work:** Invoke the limiter only after an eligible cache miss and before TMDB. Use exactly `get-cast:{tmdbMovieId}` from the validated ID. Never read IP headers or add cookies, client IDs, fingerprints, accounts, or persistence. Keep the adapter injectable for tests and handle `{ success: false }` as a typed rate-limited response. Prepare environment-specific configuration using Wrangler 4.36.0 or later; do not label a numeric threshold final until it is verified and approved.

**Definition of done:** Tests prove the exact key and cache-first ordering; rejection prevents TMDB access; no identity-derived input exists in the implementation. A deployable configuration path is documented, with production threshold approval explicitly outstanding until LC-013.

**Tests required:** Exact key; separate counters by movie ID; cache hit skips limiter; denied limit skips TMDB; binding failure degrades safely; static check for prohibited key sources.

**Validation:** Worker rate-limit tests; Wrangler configuration validation/dry run where supported; `pnpm lint`; `pnpm typecheck`; `pnpm build`.

**References:** Architecture §§3, 9–10; ADR 0006 as superseded in part by ADR 0008; rate-limiting spike.

## LC-007 — Implement the MV3 Service-Worker Boundary

**Objective:** Make the service worker the extension's only application/API network egress.

**Dependencies:** LC-002 and a stable Worker response contract from LC-003–LC-006.

**Expected files/modules:** WXT background entrypoint, message handler, fixed backend client, timeout/error mapper, and service-worker tests.

**Implementation work:** Register the runtime listener at module top level. Validate every message with the shared request parser; form only the fixed Worker URL from `tmdbId`; use HTTPS and a bounded timeout; validate every backend response before returning it. Map transport, timeout, invalid-response, backend, and rate-limit failures into the documented vocabulary. Use no storage and make every invocation correct after a cold start; any in-memory de-duplication must be optional and correctness-neutral.

**Definition of done:** Only a valid `get-cast` message can cause a fetch, the fetch targets only the configured Worker origin, invalid backend data is rejected, and restarting the handler changes no result semantics.

**Tests required:** Invalid sender payloads; exact request URL; every error mapping; timeout; malformed/non-JSON backend responses; fresh-handler/cold-start runs; assertion that no persistent or required memory state exists.

**Validation:** Extension service-worker tests; `pnpm lint`; `pnpm typecheck`; `pnpm build`.

**References:** Architecture §§2–3, 6–7, 9, 11–12; ADR 0001; ADR 0002; ADR 0003; ADR 0007.

## LC-008 — Implement Letterboxd Page Detection and TMDB ID Extraction

**Objective:** Identify supported movie pages from verified DOM signals and fail closed on uncertainty.

**Dependencies:** LC-001; shared request type from LC-002.

**Expected files/modules:** Content-side page detector and identity extractor; sanitized HTML fixtures based on completed spikes; DOM tests.

**Implementation work:** At `document_idle`, require the supported canonical film-page context and the server-rendered cast container. Parse the outbound TMDB `/movie/{id}/` link as the primary signal and corroborate it with `body[data-tmdb-id]` and `body[data-tmdb-type="movie"]`; account for the verified uppercase `data-track-action="TMDB"`. Require agreeing positive integer IDs. Return no identity for absent, conflicting, invalid, or TV signals. Add no fallback based on title, year, names, slugs, ordering, or inferred identity, and add no observer.

**Definition of done:** Supported fixtures yield one movie ID; every ambiguous or unsupported fixture yields no request-ready value; production code contains no title/year or actor matching path.

**Tests required:** Dune/Matrix/Parasite-shaped fixtures; uppercase tracking value; malformed and conflicting IDs; missing link/body data; TV type; missing cast container; unrelated Letterboxd pages; duplicate signals.

**Validation:** DOM fixture tests; `pnpm lint`; `pnpm typecheck`; `pnpm build`.

**References:** Architecture §§3–4, 11–14; ADR 0004; ADR 0005; markup and initial-markup spikes.

## LC-009 — Build the Extension-Owned Cast Renderer and CSS

**Objective:** Render a safe, distinct Model B cast block without touching Letterboxd cast nodes.

**Dependencies:** LC-002 and LC-008.

**Expected files/modules:** Content-side renderer, stylesheet, placeholder/local attribution assets if required, and DOM rendering tests.

**Implementation work:** Create nodes using `textContent` and safe property/attribute assignment only. Use TMDB order; omit absent character text; use a neutral local placeholder for missing/failed images; construct image URLs only from validated relative profile paths and the fixed HTTPS `image.tmdb.org/t/p/w185/` base. Lazy-load images and reserve dimensions. Choose the smallest usable item count/layout, verify portraits do not exceed about 92 CSS pixels, and re-evaluate image sizing before merge if they do. Include current required TMDB attribution after checking TMDB's official requirements. Use a stable extension-owned marker for idempotency and never modify, replace, or annotate native cast nodes.

**Definition of done:** One deterministic block renders from valid cast data, a second render is a no-op, external strings cannot create markup, image failures show placeholders, attribution is present, and the native cast subtree is byte-for-byte/structurally unchanged by tests.

**Tests required:** Complete/partial/empty cast; hostile text; invalid or null profile path; image error; deterministic ordering; idempotency; native-node preservation; responsive width and reserved image geometry.

**Validation:** DOM/unit tests; production build inspection; `pnpm lint`; `pnpm typecheck`; `pnpm build`.

**References:** Architecture §§5, 8–9, 11–12, 14; ADR 0004; ADR 0009; CSP and image-size spikes.

## LC-010 — Compose the Content-Script Lifecycle and Failure Handling

**Objective:** Connect extraction, one runtime request, and rendering while preserving Letterboxd on every failure.

**Dependencies:** LC-007, LC-008, LC-009.

**Expected files/modules:** WXT content entrypoint, orchestration module, and lifecycle/failure tests.

**Implementation work:** Run once at `document_idle`; check support, cast location, identity, and existing extension block before messaging. Send at most one `get-cast` request per page view. Render only a validated successful non-empty result (or a deliberately documented honest empty state); otherwise make no DOM change. Catch messaging, timeout, context-invalidation, rendering, and image failures locally. Perform no `fetch`/XHR, use no client storage, and install no `MutationObserver`.

**Definition of done:** The success path inserts exactly one extension-owned block; all documented failures leave the original page usable and unchanged; repeated entry is harmless; the only outbound application value is `tmdbId`.

**Tests required:** Full success; unsupported/missing/ambiguous page; every typed service-worker error; rejected message promise; empty cast; duplicate invocation; renderer exception; assertions for zero content-script network calls and zero observers.

**Validation:** Content integration tests; `pnpm lint`; `pnpm typecheck`; `pnpm test`; `pnpm build`.

**References:** Architecture §§3–5, 9, 11–12; ADR 0002; ADR 0004; ADR 0005; ADR 0007.

## LC-011 — Add Cross-Boundary Integration Tests

**Objective:** Verify the complete v1 contract across components without live third-party dependencies.

**Dependencies:** LC-003–LC-010.

**Expected files/modules:** Worker integration suites, extension message/content integration suites, shared test doubles, and representative fixtures.

**Implementation work:** Exercise the Worker with fake TMDB, Cache API, and limiter dependencies; exercise the service worker against a controlled Worker response; exercise the content script through a fake runtime transport. Assert the end-to-end field shape, error translation, cache-before-limit-before-TMDB ordering, one request per page, cold-start safety, and fail-closed DOM behavior. Ensure fixtures contain only the verified Letterboxd signals and no live personal data.

**Definition of done:** Tests cover the successful data path and every failure boundary, prove that only a movie ID crosses from page logic into the backend request, and require no network or credentials.

**Tests required:** Success, positive cache hit, negative cache hit, limiter denial, malformed TMDB, malformed Worker response, backend timeout, unsupported media, and service-worker re-instantiation.

**Validation:** `pnpm test`; `pnpm typecheck`; `pnpm build`.

**References:** Architecture §§2–3, 7, 10–13; ADRs 0002–0008.

## LC-012 — Add Limited Chromium/Playwright Smoke Tests

**Objective:** Verify the built MV3 extension, real runtime messaging, and visible rendering in Chromium.

**Dependencies:** LC-010 and LC-011.

**Expected files/modules:** `tests/e2e/`, a test-only WXT configuration if needed, local fixture/backend harness, and Playwright configuration.

**Implementation work:** Load the unpacked production-like extension in a persistent Chromium context. Serve or route a Letterboxd-shaped film fixture and a controlled Worker endpoint without contacting Letterboxd or TMDB. Smoke-test initial enhancement, one message, Model B placement, image fallback, reload/idempotency, and a fresh extension context/service-worker wake path. Keep localhost/test permissions out of the production manifest and keep the suite intentionally small and deterministic.

**Definition of done:** The packaged extension enhances the supported fixture through actual browser messaging; a failure fixture remains unchanged; the emitted production manifest is unaffected by test-only hosts.

**Tests required:** One happy path, one backend failure, one invalid-identity page, one image failure, and one cold/fresh service-worker path.

**Validation:** `pnpm build`; `pnpm test:e2e`.

**References:** Architecture §§3–5, 9, 11–13; ADR 0001; ADR 0002; ADR 0004; ADR 0009.

## LC-013 — Complete Permissions, Security, and Deployment Review

**Objective:** Prove least privilege and close the deployment-level Cloudflare checks before release.

**Dependencies:** LC-006, LC-007, LC-010, LC-012.

**Expected files/modules:** Production WXT manifest configuration, Wrangler production configuration, security-check scripts/tests, deployment notes, and secret setup documentation.

**Implementation work:** Inspect the emitted manifest for only the supported Letterboxd match and Worker host access; verify absence of `cookies`, `tabs`, `storage`, broad hosts, and speculative permissions. Scan source and bundles for remote scripts, `eval`, `new Function`, analytics, credentials, content-script fetch/XHR, and unapproved endpoints. Confirm the TMDB token is a Wrangler secret. On the selected Cloudflare account, validate the native binding and approve a documented numeric limit using a supported period; verify the key remains `get-cast:{tmdbMovieId}` and acknowledge location-scoped/eventually consistent behavior. Capture a network trace showing that the movie ID is the only Letterboxd-derived application data sent.

**Definition of done:** Security checks pass on built artifacts, the secret is absent from Git and bundles, account deployment confirms the binding, and the initial rate-limit values have explicit operational approval. If account access is unavailable, record a release blocker rather than weakening or replacing the mechanism.

**Tests required:** Automated manifest assertions; forbidden-code/permission scans; Worker secret-missing behavior; deployment smoke for cache hit/miss and limiter denial; privacy-focused request inspection.

**Validation:** `pnpm ci`; Wrangler dry run; authorized non-production deployment smoke; manual built-manifest and network-trace review.

**References:** Architecture §§1–3, 9–10, 14–16; ADR 0001; ADR 0002; ADR 0007; ADR 0008; rate-limiting spike.

## LC-014 — Finalize Documentation and CI

**Objective:** Make the repository reproducible for contributors and continuously verify the v1 invariants.

**Dependencies:** LC-001–LC-013.

**Expected files/modules:** `README.md`, deployment/runbook documentation, `.github/workflows/ci.yml`, and any architecture/ADR references made necessary by actual implementation; `AGENTS.md` only if stable contributor rules genuinely changed.

**Implementation work:** Document only commands and layout that now exist; include local extension/Worker development, tests, build, Wrangler secret setup, and release checks. Update architecture only for verified corrections, and create an ADR rather than silently changing a major decision. Add GitHub CI using pnpm's frozen lockfile and the aggregate checks; use mocks in pull-request CI and keep deployment credentials out of untrusted jobs. Run deterministic unit/integration checks on each change and the limited browser smoke test where the runner supports extension execution. Document periodic live Letterboxd markup/CSP verification as an operational check, not deterministic CI.

**Definition of done:** A clean checkout can follow the committed instructions; CI performs install, lint, type-check, tests, security assertions, and builds; required checks need no production secret; documentation agrees with the shipped manifest and Worker configuration.

**Tests required:** Validate CI locally through `pnpm ci`; verify documentation commands verbatim; inspect one produced extension artifact and one Worker dry run.

**Validation:** `pnpm install --frozen-lockfile`; `pnpm ci`; `pnpm test:e2e` where supported; review `git diff --check` and generated artifacts.

**References:** `AGENTS.md`; Architecture §§13–16; all accepted ADRs; all completed spike notes.

## Recommended Codex Execution Instruction

> Read `AGENTS.md`, `docs/architecture.md`, all ADRs, all completed spike notes, and this plan. Implement exactly one task at a time in task-ID order. Before each task, verify its dependencies and restate its architecture constraints. Make only that task's scoped changes, run its required validation, fix failures, and report files changed plus evidence for the definition of done. Do not begin the next task until the repository is valid. If evidence conflicts with architecture or a required decision is not authorized, document the blocker and stop instead of guessing or expanding v1 scope.

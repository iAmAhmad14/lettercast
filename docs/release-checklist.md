# Lettercast v1 Release Checklist

Hosted GitHub CI has passed on `main`. The implementation plan is complete; this checklist contains only production-release work that remains. Architecture and accepted ADRs remain authoritative.

## Human Approvals Before Deployment

- [x] **R-01 — Approve release inputs**
  - **Prerequisite:** A designated release owner. **Met.**
  - **Approved identity:** Version `1.0.0`; display name `Lettercast`; description `Enhances Letterboxd film pages with TMDB cast photos and character names.`; support email `support.lettercast@gmail.com`.
  - **Approved distribution:** A production ZIP attached to a public GitHub Release and installed manually through Chrome Developer Mode using **Load unpacked**. The owner made the repository public for v1.0.0. No Lettercast-imposed regional restriction applies.
  - **Approved Cloudflare inputs:** Account `Ahmad`; Worker `lettercast-api`; origin `https://lettercast-api.ahmad-713.workers.dev`.
  - **Verified R-04 values:** Stable Chrome extension ID `oibdnmbbockloodlflplcjdfpnnlppnl`; allowed extension origin `chrome-extension://oibdnmbbockloodlflplcjdfpnnlppnl`.
  - **Privacy:** Only the TMDB movie ID leaves the browser. Lettercast collects no personal data, analytics, cookies, browsing history, client IDs, fingerprints, or user accounts.
  - **Security:** Never record TMDB tokens, Cloudflare API tokens, passwords, Wrangler credentials, private signing keys, or other secrets in documentation or source control.
  - **Verification/pass:** **Met.** Approved values and the subsequently verified R-04 identity are recorded. No account or infrastructure action was performed.
  - **Access:** Human approvals supplied; Codex may document them.

- [x] **R-02 — Approve production rate limiting**
  - **Prerequisite:** Selected Cloudflare account and expected abuse tolerance. **Met.**
  - **Approved configuration:** `namespace_id` `"1001"`; limit `60`; period `60` seconds; key `get-cast:{tmdbMovieId}`.
  - **ADR 0008 compliance:** No IP address, cookie, client ID, fingerprint, account/user ID, or storage-based identity participates in the key.
  - **Accepted behavior:** Counters are location-scoped, asynchronously updated, permissive, and eventually consistent. This is expected coarse abuse protection, not exact accounting.
  - **Verification/pass:** **Met.** Values and identity exclusions match ADR 0008 and the completed spike.
  - **Access:** Human approval supplied; no Cloudflare change was performed.

## Extension Identity and Release Assets

- [x] **R-03 — Prepare the pre-identity extension candidate**
  - **Prerequisite:** R-01 and the approved production Worker HTTPS origin. **Met.**
  - **Exact action:** Apply approved manifest metadata and PNG icons, build with the exact production API origin, and create `lettercast-1.0.0-chrome-pre-identity.zip` with `manifest.json` at its root.
  - **Artifact status:** The ZIP and SHA-256 are pre-identity evidence. R-04 supersedes them after adding the public manifest key. The R-03 ZIP must never be published as the final v1.0.0 artifact.
  - **Evidence:** `lettercast-1.0.0-chrome-pre-identity.zip`; SHA-256 `aae56710200759895419a7ed74a14af2fe36394a84d7c50a5a51fc4325e10227`.
  - **Verification:** The complete test/security suite passed with the explicit pre-identity override. Direct ZIP inspection confirmed the root manifest, exact production origin, approved metadata/icons, deployable-file allowlist, and absence of a manifest key or prohibited material.
  - **Pass criteria:** **Met.** Approved metadata/icons and exact production host permission are present; no manifest key, source maps, secrets, test hosts, development output, or unrelated files are packaged.
  - **Access:** Codex can complete; artwork and metadata are human-approved.

- [x] **R-04 — Establish and verify stable unpacked identity**
  - **Prerequisite:** R-03. **Met.**
  - **Exact action:** Generate an RSA key pair locally without logging it; export and commit only the Base64 DER/SPKI public key as the WXT manifest `key`; derive the Chrome ID; rebuild `lettercast-1.0.0-chrome.zip`; record its distinct SHA-256 and `chrome-extension://<stable-id>` origin.
  - **Private-key scope:** The private key is not required for the approved GitHub Release/unpacked showcase workflow. Any future signed-package or different distribution workflow must make its own key-retention decision. Only the approved public manifest key may appear in the repository, output, ZIP, logs, documentation, or GitHub Release.
  - **Verified identity:** ID `oibdnmbbockloodlflplcjdfpnnlppnl`; exact origin `chrome-extension://oibdnmbbockloodlflplcjdfpnnlppnl`.
  - **Evidence:** `lettercast-1.0.0-chrome.zip`; R-04 SHA-256 `2ce0db5ae36b93dd57a142f85455d1ad29fd203df265ed3901315ad28380121f`.
  - **Verification:** Generated and extracted manifests passed validation. Programmatic DER/SPKI derivation produced the recorded ID. The same ZIP was extracted to two paths and loaded with two clean Chromium profiles; both service-worker origins reported the recorded ID. R-06, not R-04, later consumes the exact origin.
  - **Artifact status:** This is a stable-identity rebuilt candidate, not automatically the final release. R-11 later creates the clean, tested publication artifact and authoritative release checksum.
  - **Pass criteria:** **Met.** Public key valid and present; no private material exists; both paths produced one expected ID; ID, origin, candidate filename, and R-04 SHA-256 are recorded.
  - **Access:** Codex can complete automated/Chromium verification; final Google Chrome acceptance remains human-controlled.

## Cloudflare Production Setup

- [x] **R-05 — Authenticate and confirm the Cloudflare account**
  - **Prerequisite:** R-01. **Met.**
  - **Exact action:** An authorized operator runs `corepack pnpm --filter @lettercast/worker exec wrangler login` and `corepack pnpm --filter @lettercast/worker exec wrangler whoami`.
  - **Verification/pass:** **Met.** Wrangler authenticated by OAuth to the approved `Ahmad` account with Workers access. Read-only inventory found zero deployed Worker scripts; no credential entered Git or documentation.
  - **Access:** Human Cloudflare credentials required.

- [x] **R-06 — Add the production Worker environment**
  - **Prerequisite:** R-02, R-04, and R-05. **Met.**
  - **Exact action:** Configure the approved production Worker environment, exact R-04 origin, and native rate-limit binding without embedding the TMDB secret. Keep validation isolated from production counters.
  - **Local preparation:** Production is configured as `lettercast-api` with exact origin `chrome-extension://oibdnmbbockloodlflplcjdfpnnlppnl` and namespace `1001` at `60/60`. Validation is configured separately as `lettercast-api-rate-limit-validation` with approved namespace `1002` at `2/60`. Both retain key `get-cast:{tmdbMovieId}`.
  - **Verification:** Run a production dry-run and repository checks; inspect routes, bindings, variables, and artifact.
  - **Pass criteria:** **Met.** Production and validation dry-runs and repository checks pass with one exact origin, no configured secret, isolated namespaces, and the unchanged movie-ID key.
  - **Access:** Codex can edit/dry-run after values are approved; human account approval required.

- [x] **R-07 — Store the production TMDB secret**
  - **Prerequisite:** R-06 and an out-of-band production TMDB Bearer token. **Met.**
  - **Exact action:** Use `wrangler versions secret put TMDB_API_TOKEN --env production` through its secure prompt. Never expose the value or deploy the resulting version during R-07.
  - **Bootstrap history:** Cloudflare could not accept a non-active first version, so the owner approved one secretless initial deployment. During R-07, bootstrap version `f0506518-98d3-4c74-8c8e-4d5aad568f6a` was active with the exact Origin and namespace `1001` at `60/60`; it had no TMDB secret and returned typed `503 BACKEND_UNAVAILABLE`.
  - **Secret-bearing version:** Version `5bd16c86-d2e4-41d3-b7e6-1adcd58db4cb` contains the `TMDB_API_TOKEN` binding by name only, the exact approved Origin, and namespace `1001` at `60/60`. R-07 verification confirmed it was non-active while the bootstrap received 100%; R-09 below records its later authorized promotion.
  - **Verification/pass:** **Met.** Safe metadata confirms the secret binding name and approved bindings without revealing its value. Repository and artifact rescans find no credential material.
  - **Access:** Human secret and Cloudflare access required; Codex must not receive the token.

- [x] **R-08 — Verify the native binding on Cloudflare**
  - **Prerequisite:** R-04, R-05, R-06, and approved validation namespace `1002` at `2/60`. **Met.**
  - **Exact action:** Deploy only `lettercast-api-rate-limit-validation` using the R-04 origin and no TMDB token; exercise one uncached movie key until coarse denial is observed.
  - **Evidence:** Deployed only `lettercast-api-rate-limit-validation` at `https://lettercast-api-rate-limit-validation.ahmad-713.workers.dev`, version `a047199d-9278-4695-adcb-0a536aa48604`. Cloudflare reported `CAST_RATE_LIMITER` at `2/60`. With exact Origin and one uncached movie ID, 16 requests failed safely as typed `503 BACKEND_UNAVAILABLE`; the 17th returned typed `429 RATE_LIMITED`, consistent with permissive eventually consistent counters. Missing, wrong-extension, malformed, and wildcard Origins each returned `403 UNKNOWN` without an allow-origin header.
  - **Verification/pass:** **Met.** The native binding denied the movie-ID-derived key in isolated namespace `1002` without a TMDB token or caller identity. Read-only inventory confirmed production Worker `lettercast-api` still does not exist.
  - **Access:** Completed with human-authorized validation deployment access; no production access was exercised.

- [x] **R-09 — Deploy the production Worker**
  - **Prerequisite:** R-06 through R-08. **Met.**
  - **Exact action:** Review and deploy the exact approved secret-bearing Worker version at 100%, applying only reviewed triggers. Record deployment/version and final HTTPS origin.
  - **Evidence:** Deployment `9a93ff61-31c4-4899-8118-f7d7aca86ccf` routes 100% of `lettercast-api` traffic to version `5bd16c86-d2e4-41d3-b7e6-1adcd58db4cb` at `https://lettercast-api.ahmad-713.workers.dev`. Bootstrap version `f0506518-98d3-4c74-8c8e-4d5aad568f6a` remains only in deployment history and is no longer active.
  - **Verification/pass:** **Met.** Safe version metadata shows only the expected `TMDB_API_TOKEN` secret binding name, exact extension Origin, and `CAST_RATE_LIMITER` namespace `1001` at `60/60`. No secret value was retrieved.
  - **Access:** Human Cloudflare credentials and deployment approval required.

- [x] **R-10 — Smoke-test the deployed Worker**
  - **Prerequisite:** R-09.
  - **Exact action:** Test cast cache miss/hit, rejected Origin, wrong method/path/query, and not-found behavior using the exact R-04 origin.
  - **Original failure (2026-09-09):** Confirmed movie `1124620` returned `502` with `{"error":"BACKEND_UNAVAILABLE"}`, exact allow-origin, and no wildcard from version `5bd16c86-d2e4-41d3-b7e6-1adcd58db4cb`.
  - **Diagnosis/remediation:** Bounded, version-filtered diagnostics identified the exact `TMDB_FETCH_ERROR`: Cloudflare threw a non-timeout `TypeError` because Workers supports fetch redirect modes `follow` and `manual`, not the configured `error`. No upstream response was received. The client now uses `redirect: "manual"`; redirects therefore remain non-followed and map to bounded upstream failure without forwarding the Bearer token. Unit/integration assertions and a `302` regression case cover this behavior. Temporary diagnostics and tails were removed.
  - **Post-fix evidence:** Movie `1124620` returned `200`, exact allow-origin, no wildcard, and 35 schema-valid plausible cast members. For independently confirmed movie `933260`, a bounded diagnostic version recorded one `R10_CACHE_MISS` and one `R10_TMDB_FETCH` on the first `200`, then only `R10_CACHE_HIT` on the immediate second `200`; both responses contained 120 schema-valid cast members and exact CORS.
  - **Boundary evidence:** Missing, wrong-extension, malformed, and wildcard Origins each returned typed `403 UNKNOWN` without an allow-origin header. With the exact Origin, `POST` returned `405 UNKNOWN` and `Allow: GET`; a wrong path returned `404 UNKNOWN`; a query returned `400 UNKNOWN`; non-numeric, negative, zero, and unsafe-integer IDs returned `400 INVALID_ID`. TMDB's public movie page independently returned `404` for ID `999999999`, and Lettercast returned `404 INVALID_ID`. No tested response set a cookie.
  - **Privacy/upstream evidence:** Source and tests constrain extension messaging to `{ type: "get-cast", tmdbId }`, service-worker egress to one credential-omitting GET, the Worker upstream request to `GET https://api.themoviedb.org/3/movie/{id}/credits` with only `Accept` and secret-backed `Authorization`, and the limiter key to `get-cast:{tmdbMovieId}`. No page URL/title, DOM content, body, cookie, analytics, or client/storage identity is sent or generated. Exact-Origin CORS is abuse reduction, not authentication.
  - **Cleanup/current deployment:** The temporary cache-diagnostic tail was stopped and its source markers removed. Diagnostic version `b8033ed9-acd7-4d22-9ab4-a1806f34a2a4` is inactive. Clean version `de4aee27-891b-4022-88fe-572e2ec6b041`, deployment `b19b5c0b-261d-422a-80c8-4d063cb675f1`, receives 100% production traffic with `TMDB_API_TOKEN` visible by name only, the exact Origin, and namespace `1001` at `60/60`. No secret value was retrieved.
  - **Verification/pass:** At most one approved TMDB credits request occurs on a miss; cache hits skip limiter/TMDB; rejected requests do not reach TMDB; schemas and errors remain narrow without token exposure or retained viewer history.
  - **Current status:** **Met.** Production behavior, cache bypass, rejection/error contracts, privacy boundaries, diagnostic cleanup, bindings, and repository checks all passed on 2026-09-09.
  - **Access:** Human production access required; Codex can design and review sanitized tests.

## Production Extension Verification

- [x] **R-11 — Rebuild and review the final production artifact**
  - **Prerequisite:** R-09 and the release commit containing approved identity, icons, and production configuration.
  - **Exact action:** Build from a clean checkout with the exact deployed API origin and produce the final `lettercast-1.0.0-chrome.zip`. Record commit, version, stable ID, Worker deployment, and SHA-256 together.
  - **Artifact status:** The R-11 checksum supersedes R-03/R-04 evidence checksums and is the only checksum intended for publication.
  - **Evidence:** Clean detached worktree at commit `faa3fe5789d99ec645c020b11da014ae84941279` produced `lettercast-1.0.0-chrome.zip` (37,220 bytes), SHA-256 `2ce0db5ae36b93dd57a142f85455d1ad29fd203df265ed3901315ad28380121f`. This matches the R-04 candidate digest because extension inputs did not change, but R-11 is now the authoritative publication checksum.
  - **Verification/pass:** **Met.** Frozen install, aggregate CI, final production-origin build, manifest/security/release verification, deployable-file allowlist, and two-path clean-profile Chromium identity test passed. The root manifest contains version `1.0.0`, approved metadata, the public key-derived ID `oibdnmbbockloodlflplcjdfpnnlppnl`, and only the production Worker host permission. The ZIP contains no sources, maps, tests, secrets, private keys, or development output.
  - **Access:** Codex can build/verify; human signs off.

- [x] **R-12 — Test the final unpacked build in Chrome/Chromium**
  - **Prerequisite:** R-11.
  - **Exact action:** Extract the exact R-11 ZIP permanently and load the directory containing `manifest.json` through `chrome://extensions`. Verify the displayed ID equals R-04 plus registration, startup/reload, and service-worker behavior. A different ID is failure; never broaden CORS.
  - **Automated evidence:** The authoritative R-11 checksum was reverified before extraction to `apps/extension/.output/r12-unpacked-lettercast-1.0.0`. The ZIP has `manifest.json` at its root. Two isolated clean Chromium profiles loaded that exact directory, registered the service worker, and reported ID `oibdnmbbockloodlflplcjdfpnnlppnl`, version `1.0.0`, and name `Lettercast`. A page reload and a second cold-start profile passed. A deliberately aborted production-backend request remained a credential-omitting GET with no body or cookie; before and after reload, no Lettercast block appeared and the native cast remained unchanged. Temporary profiles and the one-off harness were removed.
  - **Verification/pass:** No extension errors; stable identity and cold-start behavior hold; Origin/backend failures leave Letterboxd unchanged.
  - **Manual evidence/status:** **Met.** The owner loaded the extracted directory in Google Chrome, enabled Lettercast, confirmed ID `oibdnmbbockloodlflplcjdfpnnlppnl`, and observed no extension errors. Chrome displayed the MV3 service worker as inactive after idle, which is expected; automated cold-start verification confirmed it starts when needed. The default Edge profile was not used or modified.
  - **Access:** Human controls final Chrome profile; Codex can assist and automate Chromium coverage.

## GitHub Showcase and Live-Site Acceptance

- [x] **R-13 — Prepare GitHub showcase release materials**
  - **Prerequisite:** R-04 and R-11.
  - **Exact action:** Prepare concise release notes and installation/update/removal instructions for the R-11 ZIP/checksum. Distinguish the built ZIP from GitHub source archives; explain Developer Mode, **Load unpacked**, manual updates, managed-browser limitations, no Store review/updates, and backend availability.
  - **Evidence:** `docs/release-notes-v1.0.0.md` contains publication-ready notes for the R-11 ZIP and checksum. `README.md` remains the user-facing installation authority and includes the exact R-11 digest, a PowerShell verification example, before/after screenshots, a plain-language usage guide, browser acceptance results, and an architecture diagram.
  - **Verification/pass:** **Met.** Documentation identifies the built ZIP rather than GitHub source archives; covers Developer Mode, **Load unpacked**, manual updates, removal, managed-browser limitations, no Store review/updates, backend availability, privacy, stable ID, and the authoritative checksum. No tag or release was created, and repository visibility was unchanged.
  - **Access:** Codex can prepare; human approves publication.

- [x] **R-14 — Smoke-test real Letterboxd pages with the stable-ID build**
  - **Prerequisite:** R-10 and the R-11 artifact documented by R-13.
  - **Exact action:** Load the extracted R-11 artifact in a clean Chrome profile and test current canonical Dune: Part Two, The Matrix, and Parasite pages where available, including reload and service-worker suspension.
  - **Verification/pass:** One extension-owned block, at most ten TMDB-ordered members, untouched native cast, one operation per page view, and only movie ID in the backend path.
  - **Blocked evidence (2026-09-09):** An isolated Chromium profile loaded the exact R-11 extraction with stable ID `oibdnmbbockloodlflplcjdfpnnlppnl`. Dune: Part Two returned current supported markup (`data-tmdb-type="movie"`, TMDB ID `693134`, one matching TMDB link, one cast panel, and 99 native cast links). The extension made exactly one credential-omitting `GET /v1/movie/693134/cast` with no body or cookie, but Chromium supplied no `Origin` header. Production therefore returned typed `403 UNKNOWN` with no allow-origin header and Lettercast correctly left the native page unchanged. A direct diagnostic request with the approved Origin returned `200`, isolating the failure to the real extension request's absent Origin rather than page markup or backend data.
  - **Architecture resolution:** ADR 0010 accepts the narrow cast route as an unauthenticated public endpoint. Missing Origin will be allowed; any incorrect supplied Origin will remain rejected; exact allow-origin responses remain limited to the approved supplied Origin; wildcard CORS remains prohibited. No client identity or embedded secret is added.
  - **ADR 0010 rollout:** Production version `fd0cd7c3-dd6f-4cf4-bf85-7d6012f4a35c`, deployment `1083f8a8-5d16-41ea-88e2-c65fd656cdf0`, now receives 100% traffic. Movie `1124620` returned `200` with 35 cast members when Origin was absent and emitted no CORS header. The approved supplied Origin returned `200` with the exact allow-origin value; wrong-extension, malformed, and wildcard Origins each returned typed `403 UNKNOWN` without an allow-origin header. Safe metadata retained `TMDB_API_TOKEN` by name only and `CAST_RATE_LIMITER` at `60/60`; no secret value was retrieved.
  - **Final evidence:** **Met.** The exact R-11 extraction loaded in a fresh isolated Chromium profile with stable ID `oibdnmbbockloodlflplcjdfpnnlppnl`. Dune: Part Two (`693134`), The Matrix (`603`), and Parasite (`496243`) each rendered exactly one extension-owned block with ten TMDB-ordered members directly after the native cast panel. Native cast counts remained unchanged at 99, 38, and 55 across reloads, and the Lettercast marker never appeared inside a native panel. Every initial load and reload made exactly one credential-omitting `GET /v1/movie/{id}/cast`, with no body, cookie, or Origin, and received `200`. All portrait URLs used the approved TMDB `w185` path. After 35 seconds idle, Parasite reloaded successfully with one request and one block, verifying service-worker wake behavior. The disposable browser profile and temporary harness were removed.
  - **Access:** Human browser control required; Codex can guide evidence collection.

- [x] **R-15 — Verify graceful failure on unsupported or changed pages**
  - **Prerequisite:** R-12 or R-14.
  - **Exact action:** Test non-film, TV/miniseries where available, missing/conflicting identity or cast markup, and blocked/unavailable Worker cases.
  - **Verification/pass:** No request/block on unsupported identity; backend failure adds no block; native page remains unchanged and usable; no observer, fallback matching, or TV endpoint appears.
  - **Evidence:** **Met.** The exact R-11 artifact in a fresh isolated Chromium profile made no backend request and rendered no block on the live non-film index or Task (2025), whose current page had a native cast panel, empty movie ID, and TMDB `/tv/228305/` link. Controlled Letterboxd-origin pages with missing identity, conflicting movie IDs, or missing cast markup also made no request and rendered no block; existing native content remained present where supplied. On live Dune: Part Two, one deliberately aborted Worker request and a reload returning typed `503 BACKEND_UNAVAILABLE` each produced no Lettercast block, retained all 99 native cast links, and left the page usable. Both attempted backend requests remained credential-omitting movie-ID-only GETs with no body, cookie, or Origin. Existing tests and boundary checks confirm no observer, fallback matching, or TV endpoint. The disposable profile and temporary harness were removed.
  - **Access:** Human browser control required; Codex can guide controlled cases.

- [x] **R-16 — Verify TMDB images in production**
  - **Prerequisite:** R-14.
  - **Exact action:** Inspect successful `w185` portraits, then block one CDN request and reload.
  - **Verification/pass:** Only approved HTTPS TMDB profile paths load, no CSP/layout failure occurs, and blocked images degrade to the neutral placeholder without added Letterboxd data.
  - **Evidence:** **Met.** The exact R-11 artifact loaded live Dune: Part Two (`693134`) in two fresh isolated Chromium profiles with stable ID `oibdnmbbockloodlflplcjdfpnnlppnl`. The normal run made ten credential-free image GETs solely to `https://image.tmdb.org/t/p/w185/`; all returned `200`, decoded at 185 pixels wide, and rendered in reserved `80 × 120` frames. A second run deliberately aborted only the first portrait request. The failed image element was removed and exactly one neutral, accessible monogram placeholder appeared for that card while the other nine portraits loaded normally. Both runs retained one ten-card extension block directly after the native cast panel, preserved all 99 native cast links, emitted no CSP violation, and sent no request body or cookie to the image CDN. The disposable profiles and temporary harness were removed.
  - **Access:** Human browser control required; Codex can guide inspection.

## Final Release

- [x] **R-17 — Approve and publish v1**
  - **Prerequisite:** R-01 through R-16 pass, the owner approves public repository visibility, and the release commit is final. **Met.**
  - **Exact action:** **Completed 2026-09-09.** The owner made the repository public, tagged commit `90dcafa` as `v1.0.0`, and published [Lettercast v1.0.0](https://github.com/iAmAhmad14/lettercast/releases/tag/v1.0.0) with only the R-11 ZIP, SHA-256 file, and approved notes. Stable ID `oibdnmbbockloodlflplcjdfpnnlppnl`, production deployment `1083f8a8-5d16-41ea-88e2-c65fd656cdf0`, and artifact hash `2ce0db5ae36b93dd57a142f85455d1ad29fd203df265ed3901315ad28380121f` remain authoritative. The repository owner is the rollback owner.
  - **Pre-publication acceptance:** **Met.** On 2026-09-09, the owner manually completed the documented Chrome acceptance checks against the exact R-11 artifact. Stable identity, supported-page rendering, reload/service-worker wake behavior, request privacy, graceful backend and image failure, unsupported-page behavior, and absence of persistent browser errors all passed.
  - **Verification/pass:** **Met.** The published ZIP was downloaded directly from the release, not from GitHub's source archives. Its SHA-256 matched both the published checksum and R-11 evidence. The owner confirmed the downloaded extension works; the earlier complete acceptance suite already proved graceful backend failure for the identical artifact.
  - **Access:** Completed by the owner with read-only release/checksum verification assisted by Codex.

## Remaining Blockers

None for v1.0.0 publication.

## Recommended Order

Complete R-01 through R-17 in order. R-03 creates disposable pre-identity evidence, R-04 establishes the stable extension origin, R-06 consumes it, and R-11 creates the only ZIP/checksum intended for publication.

**Status:** Lettercast v1.0.0 is published and R-17 is complete. Future work is maintenance or separately approved post-v1 scope.

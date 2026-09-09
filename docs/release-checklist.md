# Lettercast v1 Release Checklist

Hosted GitHub CI has passed on `main`. The implementation plan is complete; this checklist contains only production-release work that remains. Architecture and accepted ADRs remain authoritative.

## Human Approvals Before Deployment

- [x] **R-01 — Approve release inputs**
  - **Prerequisite:** A designated release owner. **Met.**
  - **Approved release identity:**
    - Version: `1.0.0`
    - Display name: `Lettercast`
    - Description: `Enhances Letterboxd film pages with TMDB cast photos and character names.`
    - Chrome Web Store publisher: `Lettercast`
    - Support email: `support.lettercast@gmail.com`
  - **Approved distribution:** Initial visibility is `Unlisted`; target v1 visibility is `Public`; regions are `Worldwide`.
  - **Approved Cloudflare inputs:**
    - Account name: `Ahmad`
    - Account ID: `713abfeb39c6d0582c58ad8fc1fa4edf`
    - Production Worker name: `lettercast-api`
    - Production Worker origin: `https://lettercast-api.ahmad-713.workers.dev`
  - **Intentionally pending inputs:** Chrome Web Store item ID: `Pending R-04`; allowed extension origin: `Pending R-04`; production rate-limit configuration: `Pending R-02`.
  - **Approved privacy summary:** Only the TMDB movie ID leaves the browser. Lettercast does not collect personal data, analytics, cookies, browsing history, client IDs, fingerprints, or user accounts.
  - **Security constraint:** Do not record TMDB tokens, Cloudflare API tokens, passwords, Wrangler credentials, or other secrets in documentation or source control.
  - **Verification:** All supplied R-01 values are recorded explicitly; values assigned to later tasks remain clearly pending; no credential or secret is recorded.
  - **Pass criteria:** **Met.** Release identity, distribution, Cloudflare account/Worker details, privacy disclosure, and secret-handling constraint are documented without inventing R-02 or R-04 values.
  - **Access:** Human approvals were supplied; no account access or infrastructure action was performed.

- [ ] **R-02 — Approve production rate limiting**
  - **Prerequisite:** Selected Cloudflare account and expected traffic/abuse tolerance.
  - **Exact action:** Approve a unique account-scoped `namespace_id`, a numeric limit, and either the supported 10- or 60-second period. Keep the key exactly `get-cast:{tmdbMovieId}` and document that enforcement is location-scoped and eventually consistent.
  - **Verification:** Compare the approved values with ADR 0008 and the Cloudflare rate-limiting spike.
  - **Pass criteria:** Values have explicit human approval and introduce no IP, cookie, account, fingerprint, client ID, or storage input.
  - **Access:** Human decision required; Codex can encode approved values.

## Store Identity and Release Assets

- [ ] **R-03 — Prepare the versioned extension candidate**
  - **Prerequisite:** R-01 and an approved production Worker HTTPS origin.
  - **Exact action:** Set the approved manifest version, add approved PNG extension icons including 128×128, and build with `WXT_LETTERCAST_API_ORIGIN` set to the exact production origin. Create a ZIP whose root contains `manifest.json`, not an enclosing output directory.
  - **Verification:** Run `corepack pnpm run ci`, then run `LETTERCAST_EXPECTED_BACKEND_ORIGIN=<origin> corepack pnpm security` in a shell where `WXT_LETTERCAST_API_ORIGIN=<origin>` was used for the build. Inspect the ZIP contents and record its SHA-256 hash.
  - **Pass criteria:** Checks pass; the manifest version is approved and not `0.0.0`; required icons are packaged; the ZIP contains no source maps, secrets, test hosts, or unrelated files.
  - **Access:** Codex can prepare/build; humans must approve version and artwork.

- [ ] **R-04 — Create the Chrome Web Store draft and obtain its ID**
  - **Prerequisite:** R-03 and a registered Chrome Web Store publisher with 2-Step Verification.
  - **Exact action:** Upload the candidate ZIP as a new draft item without publishing it, then record the dashboard item ID. This ID defines the production origin `chrome-extension://<item-id>`.
  - **Verification:** Confirm the dashboard accepts the package and the recorded ID matches Chrome’s item page.
  - **Pass criteria:** A draft exists, is not public, and its exact item ID is available for Worker configuration.
  - **Access:** Human Chrome Web Store credentials/access required.

## Cloudflare Production Setup

- [ ] **R-05 — Authenticate and confirm the Cloudflare account**
  - **Prerequisite:** R-01.
  - **Exact action:** An authorized operator runs `corepack pnpm --filter @lettercast/worker exec wrangler login` and then `corepack pnpm --filter @lettercast/worker exec wrangler whoami`.
  - **Verification:** Confirm the expected account is selected and can create Workers, routes/domains, secrets, Cache API entries, and native rate-limit bindings.
  - **Pass criteria:** Wrangler reports the intended account; no credential is written to Git or a transcript.
  - **Access:** Human Cloudflare credentials required.

- [ ] **R-06 — Add the production Worker environment**
  - **Prerequisite:** R-02, R-04, and R-05.
  - **Exact action:** Add `env.production` to `apps/worker/wrangler.jsonc` with the approved Worker name/route, `CAST_RATE_LIMITER` binding, unique namespace, approved limit/period, and `ALLOWED_EXTENSION_ORIGIN` equal to `chrome-extension://<item-id>`. Do not put `TMDB_API_TOKEN` in configuration.
  - **Verification:** Run `corepack pnpm --filter @lettercast/worker exec wrangler deploy --env production --dry-run --outdir dist` and inspect its binding/route summary; rerun repository CI and security checks after committing the configuration.
  - **Pass criteria:** The environment is explicit, uses one narrow origin, contains no secret, and the limiter key implementation remains unchanged.
  - **Access:** Codex can edit and dry-run; human approval is required for account-specific values.

- [ ] **R-07 — Store the production TMDB secret**
  - **Prerequisite:** R-06 and a production TMDB Bearer token supplied out of band.
  - **Exact action:** Upload the reviewed code/configuration without activating traffic using `corepack pnpm --filter @lettercast/worker exec wrangler versions upload --env production --strict`. Then run `corepack pnpm --filter @lettercast/worker exec wrangler versions secret put TMDB_API_TOKEN --env production` and enter the value only at the secure prompt. Record the resulting secret-bearing version ID; do not deploy it yet.
  - **Verification:** Use `corepack pnpm --filter @lettercast/worker exec wrangler versions secret list --env production` and `corepack pnpm --filter @lettercast/worker exec wrangler versions list --env production`; confirm only the secret name and intended version metadata, never the value. Rescan Git and built artifacts for credentials. Cloudflare documents that [`versions secret put` creates a version without immediately deploying it](https://developers.cloudflare.com/workers/configuration/secrets/).
  - **Pass criteria:** A reviewed, non-active production version references `TMDB_API_TOKEN`; the value is absent from files, logs, command history, ZIPs, and extension bundles.
  - **Access:** Human secret and Cloudflare access required; Codex must not receive the token.

- [ ] **R-08 — Verify the native binding on Cloudflare**
  - **Prerequisite:** R-04 and R-05.
  - **Exact action:** Deploy the existing validation environment with `corepack pnpm --filter @lettercast/worker exec wrangler deploy --env rate-limit-validation --var "ALLOWED_EXTENSION_ORIGIN:chrome-extension://<item-id>"`; do not add a TMDB token. Repeatedly request one uncached valid movie path with that Origin so missing-secret failures remain uncached and exercise the same resource key.
  - **Verification:** Deployment output lists `CAST_RATE_LIMITER`; requests initially fail closed as backend unavailable and eventually return the typed 429 response. Do not require an exact denial count because counters are permissive and location-scoped.
  - **Pass criteria:** The selected account accepts the binding and a denial is observed without changing the key or introducing caller identity.
  - **Access:** Human deployment access required; Codex can provide commands and inspect sanitized evidence.

- [ ] **R-09 — Deploy the production Worker**
  - **Prerequisite:** R-06 through R-08.
  - **Exact action:** Review the production dry-run artifact and the secret-bearing version from R-07, then deploy that exact version at 100% using `corepack pnpm --filter @lettercast/worker exec wrangler versions deploy <approved-version-id>@100% --env production`. If the approved configuration uses a route or custom domain, apply only its reviewed trigger with `corepack pnpm --filter @lettercast/worker exec wrangler triggers deploy --env production`. Record the deployment/version identifier and final HTTPS origin.
  - **Verification:** Confirm the deployed route is the approved origin and only the expected secret, variable, and rate-limit binding are attached.
  - **Pass criteria:** The Worker is reachable over HTTPS and no generic proxy route, extra TMDB endpoint, analytics binding, or unintended variable exists.
  - **Access:** Human Cloudflare credentials and deployment approval required.

- [ ] **R-10 — Smoke-test the deployed Worker**
  - **Prerequisite:** R-09.
  - **Exact action:** From a controlled client, request `GET /v1/movie/{tmdbMovieId}/cast` with the exact store-item Origin. Test one cache miss followed by a hit, a rejected Origin, wrong method/path/query, and a known not-found movie ID. Use bounded Cloudflare trace/subrequest evidence only long enough to distinguish cache, limiter, and TMDB behavior.
  - **Verification:** Confirm the miss makes at most one Bearer-authenticated request to TMDB `/3/movie/{id}/credits`; the hit skips limiter/TMDB; rejected requests never reach TMDB; responses use only the narrow schema and typed errors.
  - **Pass criteria:** Cache and failure behavior match architecture, no token is exposed, and diagnostics retain no detailed `(IP, tmdbId)` history beyond the test.
  - **Access:** Human production access required; Codex can design requests and review sanitized results.

## Production Extension Verification

- [ ] **R-11 — Rebuild and review the final production artifact**
  - **Prerequisite:** R-09 and the release commit containing approved version, icons, and production configuration.
  - **Exact action:** From a clean checkout, install with the frozen lockfile, set `WXT_LETTERCAST_API_ORIGIN` to the deployed origin, run the production build and security check, and produce the final ZIP. Record commit, version, ZIP hash, and Worker deployment identifier together.
  - **Verification:** Inspect the emitted manifest and bundles, and compare the Worker origin with R-09.
  - **Pass criteria:** MV3; exact match `https://letterboxd.com/film/*`; `document_idle`; exactly one production Worker host permission; no `permissions`, `cookies`, `tabs`, `storage`, broad hosts, test origin, secret, analytics, remote script, `eval`, or `new Function`.
  - **Access:** Codex can perform this step; human signs off the artifact.

- [ ] **R-12 — Test the unpacked production build in Chrome/Chromium**
  - **Prerequisite:** R-11.
  - **Exact action:** Load `apps/extension/.output/chrome-mv3` through `chrome://extensions` in Developer mode. Verify installation, service-worker registration, startup/reload behavior, and console output. Do not broaden the production Worker allowlist merely because an unpacked build receives a different extension ID.
  - **Verification:** Inspect extension errors, service-worker DevTools, content-script injection, duplicate prevention, and behavior after suspending/restarting the service worker.
  - **Pass criteria:** The package loads without extension errors, remains cold-start safe, and an expected Origin rejection leaves Letterboxd unchanged. Successful production-origin testing is completed with the store-ID build in R-14.
  - **Access:** Codex can assist with local testing; a human controls the browser profile.

## Chrome Web Store and Live-Site Acceptance

- [ ] **R-13 — Complete store listing and test-channel readiness**
  - **Prerequisite:** R-04 and R-11.
  - **Exact action:** Upload the final ZIP to the existing draft; complete its accurate single-purpose description, category/language, support contact, distribution/regions, privacy fields, permission justification, and data-use disclosures. Declare no remote code. Supply the required 128×128 icon, at least one current screenshot, and required promotional artwork. Submit first through an approved test/private/unlisted path where appropriate; all visibility modes still undergo review.
  - **Verification:** Compare every dashboard claim with ADR 0007 and the actual manifest/network behavior. Follow the official [publication flow](https://developer.chrome.com/docs/webstore/publish/), [privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy), [distribution settings](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution/), and [image requirements](https://developer.chrome.com/docs/webstore/images).
  - **Pass criteria:** Dashboard validation is complete; listing and privacy statements are accurate; required assets exist; support/contact information works; the test distribution is approved and installable with the recorded item ID.
  - **Access:** Human publisher, policy, and distribution approval required; Codex can draft copy and audit consistency.

- [ ] **R-14 — Smoke-test real Letterboxd movie pages with the store-ID build**
  - **Prerequisite:** R-10 and an installable R-13 test release.
  - **Exact action:** Install through the Chrome Web Store test channel and visit several current canonical public movie pages, including the previously sampled Dune: Part Two, The Matrix, and Parasite pages where available. Reload and revisit after service-worker suspension.
  - **Verification:** Inspect DOM and network activity: one extension-owned block, at most ten TMDB-ordered members, native cast subtree unchanged, at most one `get-cast` operation per page view, and only the movie ID in the backend path with no body/cookies/page URL/title/DOM data.
  - **Pass criteria:** Enhancement succeeds consistently, remains idempotent and cold-start safe, and Letterboxd functionality remains intact.
  - **Access:** Human browser/store access required; Codex can guide inspection and review evidence.

- [ ] **R-15 — Verify graceful failure on unsupported or changed pages**
  - **Prerequisite:** R-12 or R-14.
  - **Exact action:** Test a non-film Letterboxd page, a TV/miniseries-backed film page if available, a controlled initial-HTML override with missing/conflicting identity or missing cast markup, and a blocked/unavailable Worker request.
  - **Verification:** Inspect DOM, console, and network requests before and after reload.
  - **Pass criteria:** Unsupported/ambiguous pages send no cast request and add no block; backend failure adds no block; no native node is modified; all pages remain usable. No observer, title/year fallback, actor matching, or TV endpoint appears.
  - **Access:** Human browser control required; Codex can define overrides and inspect results.

- [ ] **R-16 — Verify TMDB images in production**
  - **Prerequisite:** R-14.
  - **Exact action:** Inspect successful portraits, then block one TMDB CDN image request and reload. Check for CSP violations and unexpected referrer/query data.
  - **Verification:** DevTools shows HTTPS requests only to `image.tmdb.org/t/p/w185/<validated-profile-path>`; rendered portraits stay within the 80×120 reserved area; the blocked image becomes the neutral placeholder.
  - **Pass criteria:** Valid images load without CSP errors or layout breakage, failures degrade locally, and no Letterboxd-derived data is intentionally added to CDN requests.
  - **Access:** Human browser control required; Codex can guide and review evidence.

## Final Release

- [ ] **R-17 — Approve and publish v1**
  - **Prerequisite:** R-01 through R-16 all pass and any Chrome Web Store review findings are resolved without weakening architecture.
  - **Exact action:** Confirm the dashboard ZIP hash/version matches R-11, select the approved distribution, and publish. Tag the exact release commit using the human-approved version and record the store item ID, Worker deployment identifier, artifact hash, release date, and rollback owner.
  - **Verification:** Install from the released listing in a clean Chrome profile and repeat one supported-page success plus one backend-failure check.
  - **Pass criteria:** The public/intended listing serves the approved artifact, production remains healthy, records identify exactly what was released, and rollback ownership is clear.
  - **Access:** Human final approval and publisher access required; Codex can verify records and prepare a tag but must not publish without authorization.

## Remaining Blockers

1. Human approval of the production version, branding/listing disclosures, Worker origin, distribution, and rate-limit values.
2. Chrome Web Store publisher access and a draft item ID for the exact Worker Origin allowlist.
3. Cloudflare authentication, production environment/binding configuration, and the TMDB secret.
4. Account-backed rate-limit validation, production deployment, and deployed cache/network smoke evidence.
5. Final icon/listing assets, production package review, store-ID browser tests, and live Letterboxd/CSP/image verification.

## Recommended Order

Complete R-01 through R-17 in numeric order. The ordering deliberately obtains the Chrome Web Store item ID before locking the production Worker Origin, verifies the native binding before production deployment, and reserves successful live testing for the store-ID build.

**Next step:** Complete R-01 — the release owner must approve the production identifiers, version, distribution, branding/privacy position, and Worker origin before Codex can safely prepare account-specific release changes.

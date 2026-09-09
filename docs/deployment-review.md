# Deployment and Security Review

## Status

**Release verification remains in progress as of 2026-09-09.** R-01 through R-16 pass; only owner-controlled R-17 publication remains. The initial R-14 attempt proved that the real MV3 service-worker request omitted `Origin`, which the former exact-Origin admission policy rejected. ADR 0010 resolved that mismatch without adding identity or credentials. Production version `fd0cd7c3-dd6f-4cf4-bf85-7d6012f4a35c`, deployment `1083f8a8-5d16-41ea-88e2-c65fd656cdf0`, now receives 100% traffic. A bounded production probe verified absent-Origin success, exact approved CORS, and rejection of incorrect supplied Origins. The repeated R-14 live smoke passed for Dune: Part Two, The Matrix, and Parasite using the exact R-11 artifact. R-15 then verified graceful decline on unsupported and failing pages. R-16 verified ten live Dune portraits from only the approved TMDB `w185` HTTPS path and proved that one deliberately blocked image becomes a neutral local placeholder without disturbing the 99 native cast links or causing a CSP violation. The owner subsequently completed the full manual Chrome acceptance checklist against the exact artifact with no persistent errors. All disposable browser profiles and temporary harnesses were removed. Safe metadata retained the `TMDB_API_TOKEN` binding by name only and `CAST_RATE_LIMITER` at `60/60`. The repository intentionally remains private until the owner approves publication.

## Verified Locally

- The production extension is Manifest V3 and matches only `https://letterboxd.com/film/*`.
- It requests no `cookies`, `tabs`, `storage`, broad-host, or speculative permission. The default build has no backend host permission and is intentionally non-deployable until a production Worker origin is selected.
- Source and production bundles contain no remote script creation, `eval`, `new Function`, known analytics integration, embedded JWT-like credential, TMDB API query key, or unapproved TMDB endpoint.
- The content script contains no network API, storage API, or observer. The service worker retains the fixed `/v1/movie/{tmdbId}/cast` egress path.
- Worker tests verify missing-secret failure, cache hit/miss behavior, limiter denial, and the exact `get-cast:{tmdbMovieId}` key.
- The Playwright request inspection verifies a GET with no body, cookies, page URL, title, or DOM data. The only Letterboxd-derived backend path value is the validated TMDB movie ID.

Run these checks after a production build:

```text
corepack pnpm security
corepack pnpm --filter @lettercast/worker build:rate-limit-validation
```

The complete credential-free repository check is:

```text
corepack pnpm exec playwright install chromium
corepack pnpm run ci
```

GitHub Actions runs the same aggregate validation against mocks and local fixtures. It receives no deployment credential and performs no deployment.

## Local Worker Configuration

Copy `apps/worker/.dev.vars.example` to the ignored `apps/worker/.dev.vars.rate-limit-validation`, provide a development-only TMDB token and the exact unpacked extension origin, and run:

```text
corepack pnpm --filter @lettercast/worker dev
```

This exercises the validation environment locally. Validation uses approved namespace `1002` at `2/60`, solely to verify the native binding without affecting production namespace `1001` at `60/60`. Both use the same movie-resource key model, `get-cast:{tmdbMovieId}`; neither uses caller identity.

## Required Release Closure

An authorized operator must complete all of the following:

1. Keep the browser-verified stable extension ID `oibdnmbbockloodlflplcjdfpnnlppnl` and exact origin `chrome-extension://oibdnmbbockloodlflplcjdfpnnlppnl`; never broaden CORS.
2. Keep validation namespace `1002` at its approved `2/60` threshold, distinct from production namespace `1001` at `60/60`.
3. Preserve the R-08 evidence: validation Worker version `a047199d-9278-4695-adcb-0a536aa48604` accepted `CAST_RATE_LIMITER` at `2/60`; repeated requests for one movie resource eventually returned typed `429 RATE_LIMITED`. Do not substitute IP or client identity.
4. Preserve the deployment record: deployment `b19b5c0b-261d-422a-80c8-4d063cb675f1` routes 100% to clean version `de4aee27-891b-4022-88fe-572e2ec6b041`, whose `TMDB_API_TOKEN` is visible by binding name only. Its exact Origin and namespace `1001` at `60/60` remain unchanged. Never place the secret value in a file, command transcript, extension setting, or bundle.
5. Build the extension with `WXT_LETTERCAST_API_ORIGIN` set to the approved deployed origin and run `LETTERCAST_EXPECTED_BACKEND_ORIGIN=<origin> corepack pnpm security`.
6. Preserve the R-10 evidence: Cloudflare rejected `redirect: "error"` before the TMDB fetch. The clean `redirect: "manual"` build returned valid cast data. Movie `933260` then produced one cache miss and one TMDB fetch followed by a cache hit with no second fetch. Temporary branch/cache diagnostics were narrowly scoped, stopped, removed, and replaced by the current clean version.
7. Inspect the deployed request: method `GET`, path `/v1/movie/{tmdbId}/cast`, no request body or cookies, and no Letterboxd URL, title, account state, or DOM content.
8. Preserve the R-16 image evidence: all ten sampled Dune portraits loaded with `200` responses solely from the approved HTTPS TMDB `w185` path, decoded at 185 pixels wide, and rendered at `80 × 120`. Deliberately blocking one portrait produced exactly one neutral accessible placeholder; the other nine portraits and all 99 native cast links remained intact, with no CSP violation or image request body/cookie.

After release and periodically thereafter, repeat the live Letterboxd markup and CSP probes recorded under `docs/spikes`. Treat drift as operational evidence to investigate; do not replace these probes with nondeterministic pull-request CI.

Cloudflare counters remain location-scoped, asynchronously updated, permissive, and unsuitable for exact accounting. That accepted limitation was observed during R-08. R-10's original `502 BACKEND_UNAVAILABLE` was a code defect rather than a limiter, TMDB token, upstream status, JSON, or schema failure. After remediation, movie `1124620` returned `200`, exact CORS, no wildcard, and 35 schema-valid cast members. Movie `933260` proved one upstream fetch followed by a cache hit. Origin rejection, method/path/query/input errors, independently confirmed not-found behavior, no-cookie responses, and the movie-ID-only privacy boundary all matched the implementation. No persistent diagnostic logging remains and no secret value was retrieved.

The release channel is a manually installed GitHub Release ZIP, as recorded in ADR 0011. The original Chrome Web Store path was withdrawn because its registration fee and delivery time were not proportionate to this portfolio/showcase release. R-03 pre-identity evidence is never publishable. R-04 verified ID `oibdnmbbockloodlflplcjdfpnnlppnl` and origin `chrome-extension://oibdnmbbockloodlflplcjdfpnnlppnl`; its rebuilt ZIP was only a candidate. R-11's clean `lettercast-1.0.0-chrome.zip` and SHA-256 `2ce0db5ae36b93dd57a142f85455d1ad29fd203df265ed3901315ad28380121f` are the sole publication artifact/checksum. Repository visibility changes, tags, and releases remain owner-controlled actions.

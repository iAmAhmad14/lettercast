# Deployment and Security Review

## Status

**Release blocked as of 2026-09-09.** Local security checks pass, but Wrangler reports that this environment is not authenticated to a Cloudflare account. No account deployment, production rate-limit approval, or live deployment smoke has therefore been claimed.

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

This exercises the validation environment locally. Its namespace and numeric threshold exist only to validate the binding path and must not be promoted as production approval.

## Required Release Closure

An authorized operator must complete all of the following:

1. Authenticate Wrangler to the selected account and allocate a unique production rate-limit namespace.
2. Explicitly approve a numeric limit and supported 10- or 60-second period. The committed `rate-limit-validation` values are documentation examples, not production approval.
3. Add the approved production Wrangler environment and confirm the native `CAST_RATE_LIMITER` binding by non-production deployment. Do not substitute IP or client identity.
4. Store `TMDB_API_TOKEN` with `wrangler secret put`; never place its value in a file, command transcript, extension setting, or bundle.
5. Select the deployed HTTPS Worker origin, build the extension with `WXT_LETTERCAST_API_ORIGIN` set to that exact origin, and run `LETTERCAST_EXPECTED_BACKEND_ORIGIN=<origin> corepack pnpm security`.
6. Configure the Worker to allow the final `chrome-extension://<extension-id>` origin, then smoke-test cache miss, cache hit, and limiter denial without logging detailed viewer history.
7. Inspect the deployed request: method `GET`, path `/v1/movie/{tmdbId}/cast`, no request body or cookies, and no Letterboxd URL, title, account state, or DOM content.

After release and periodically thereafter, repeat the live Letterboxd markup and CSP probes recorded under `docs/spikes`. Treat drift as operational evidence to investigate; do not replace these probes with nondeterministic pull-request CI.

Cloudflare counters remain location-scoped, asynchronously updated, permissive, and unsuitable for exact accounting. That limitation is accepted; the missing account evidence and approvals are not.

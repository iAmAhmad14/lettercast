# Lettercast

Lettercast is a Chrome-first Manifest V3 extension that adds an extension-owned cast block to supported Letterboxd movie pages. It uses the page's existing TMDB movie ID and retrieves normalized credits through a narrow Cloudflare Worker API.

## Status

The v1 implementation and local automated checks are complete. Production release remains blocked on the Cloudflare account setup, rate-limit configuration approval, and deployed smoke checks listed in the [deployment and security review](docs/deployment-review.md).

## Repository Layout

- `apps/extension` — WXT content script and MV3 service worker.
- `apps/worker` — Cloudflare Worker, TMDB integration, cache, and rate limiter.
- `packages/contracts` — shared runtime contracts and boundary validators.
- `tests/e2e` — mocked-network Chromium tests for the packaged extension.
- `docs` — architecture, ADRs, spike evidence, plan, and release review.

## Install and Validate

Node 24.18.0 and pnpm 12.3.4 are pinned. Use Corepack:

```text
corepack pnpm install --frozen-lockfile
corepack pnpm exec playwright install chromium
corepack pnpm run ci
```

The aggregate check runs linting, type-checking, unit and integration tests, production builds, security assertions, and the mocked Chromium smoke suite. It requires no TMDB token or Cloudflare credentials. Individual commands are:

```text
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm security
corepack pnpm test:e2e
```

Run `build` before `security`, because the security check inspects generated artifacts. Production outputs are `apps/extension/.output/chrome-mv3` and `apps/worker/dist`.

## Local Development

For the Worker, copy `apps/worker/.dev.vars.example` to the ignored `apps/worker/.dev.vars.rate-limit-validation`, replace both placeholders, then run:

```text
corepack pnpm --filter @lettercast/worker dev
```

This local environment uses the documented validation-only rate-limit values; they are not approved production settings. The Worker still requires an exact `chrome-extension://<id>` Origin.

For the extension, provide an HTTPS Worker origin through `WXT_LETTERCAST_API_ORIGIN`, then run:

```text
corepack pnpm --filter @lettercast/extension dev
```

Without that variable, the generated manifest intentionally has no backend host permission. The deterministic Playwright suite supplies its own test-only HTTPS origin and mocks every external request.

The extension accepts only HTTPS backend origins. Use an HTTPS deployment or tunnel for manual extension-to-Worker integration; the default local Wrangler HTTP server is for Worker-focused development. Use `test:e2e` for credential-free local end-to-end coverage.

## Release Configuration

The TMDB token must be stored as a Wrangler secret, never in Git or an extension bundle:

```text
corepack pnpm --filter @lettercast/worker exec wrangler secret put TMDB_API_TOKEN --env production
```

Run that command only after the production Wrangler environment exists. Follow [docs/deployment-review.md](docs/deployment-review.md) for the remaining rate-limit, origin, artifact, and live-deployment checks.

## Documentation Authority

Read [AGENTS.md](AGENTS.md) first for contributor constraints, then [docs/architecture.md](docs/architecture.md) for the v1 source of truth. ADRs under `docs/decisions` protect accepted decisions; spike notes under `docs/spikes` preserve evidence rather than permanent guarantees.

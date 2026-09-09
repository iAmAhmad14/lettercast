# Lettercast

Lettercast is a Chrome-first Manifest V3 extension that adds an extension-owned cast block to supported Letterboxd movie pages. It uses the page's existing TMDB movie ID and retrieves normalized credits through a narrow Cloudflare Worker API.

## Status

The v1 implementation and local automated checks are complete. Production release work is tracked in the [release checklist](docs/release-checklist.md). Lettercast v1 will be distributed as a GitHub Release ZIP for manual unpacked installation; the repository remains private while release verification is in progress.

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

## Showcase Installation

Once v1 is published:

1. Download the built `lettercast-1.0.0-chrome.zip` asset from GitHub Releases. Do not download GitHub's automatic **Source code** archive.
2. Optionally verify the published SHA-256 checksum.
3. Extract the ZIP to a permanent folder.
4. Open `chrome://extensions`.
5. Enable **Developer Mode**.
6. Select **Load unpacked**.
7. Select the extracted directory containing `manifest.json`.
8. Visit a supported Letterboxd film page.

This portfolio/showcase distribution requires Developer Mode and manual updates; it has no Chrome Web Store review or automatic update channel. To update, replace the extracted files with a newer verified release and reload the extension. To remove Lettercast, use **Remove** on `chrome://extensions` and delete the extracted folder. Managed browsers may prohibit unpacked extensions, and cast enhancement requires the Lettercast backend to remain available.

Production builds use stable extension ID `oibdnmbbockloodlflplcjdfpnnlppnl`. The backend's exact allowed origin is `chrome-extension://oibdnmbbockloodlflplcjdfpnnlppnl`; wildcard CORS is not permitted.

## Release Configuration

The TMDB token must be stored as a Wrangler secret, never in Git or an extension bundle:

```text
corepack pnpm --filter @lettercast/worker exec wrangler secret put TMDB_API_TOKEN --env production
```

Run that command only after the production Wrangler environment exists and through the reviewed version workflow in the release checklist. Follow [docs/release-checklist.md](docs/release-checklist.md) for identity, artifact, origin, and live-deployment checks.

## Documentation Authority

Read [AGENTS.md](AGENTS.md) first for contributor constraints, then [docs/architecture.md](docs/architecture.md) for the v1 source of truth. ADRs under `docs/decisions` protect accepted decisions; spike notes under `docs/spikes` preserve evidence rather than permanent guarantees.

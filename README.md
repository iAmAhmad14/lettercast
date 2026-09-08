# Lettercast

Lettercast is a browser extension project that enhances Letterboxd film pages with actor profile images and character names sourced from TMDB.

## Project Status

The pnpm workspace now contains an inert WXT Manifest V3 extension, an inert module-format Cloudflare Worker, shared-contract scaffolding, and baseline test environments. Product functionality has not yet been implemented.

## Development

Node 24.18.0 and pnpm 12.3.4 are pinned. Run pnpm through Corepack:

```text
corepack pnpm install --frozen-lockfile
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm run ci
```

The workspace packages are `apps/extension`, `apps/worker`, and `packages/contracts`. Build output is generated under each application's ignored output directory.

## V1 Scope

V1 targets canonical Letterboxd movie pages only. It will render a separate, extension-owned cast block without editing Letterboxd's existing cast markup.

Movie identity must come from a validated TMDB reference already present on the page. The extension will not use fuzzy title/year searches, actor-name matching, or TV fallbacks. If identity or cast data cannot be verified, it will leave the page unchanged.

## Architecture Overview

The system has three runtime boundaries:

- A content script reads and renders the Letterboxd page without making network requests.
- An MV3 service worker validates messages and acts as the extension's sole network egress.
- A Cloudflare Worker protects the TMDB credential, calls TMDB, validates and normalizes responses, caches results, and applies abuse controls.

The backend exposes one narrow cast operation and is not a general-purpose TMDB proxy.

## Privacy and Security

Only the TMDB movie ID may leave the browser. V1 does not require Letterboxd cookies, account information, client-side storage, or analytics. The TMDB credential remains in Cloudflare as a Wrangler secret and must never enter the extension bundle or repository.

## Documentation

- [Architecture](docs/architecture.md) is the current source of truth for scope and runtime boundaries.
- [Decision records](docs/decisions/) protect accepted architectural decisions.
- [Spike notes](docs/spikes/) contain verified implementation evidence.
- [Implementation plan](docs/implementation-plan.md) defines the ordered v1 tasks.
- [Repository Guidelines](AGENTS.md) contains stable rules for contributors and coding agents.

Contributors should read the repository guidelines and architecture before implementation changes. New uncertainties must be verified rather than guessed, and major architectural changes require an ADR.

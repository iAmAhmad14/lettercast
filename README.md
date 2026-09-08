# Lettercast

Lettercast is a planned browser extension that enhances Letterboxd film pages with actor profile images and character names sourced from TMDB.

## Project Status

The project is currently in the architecture phase. No extension or backend implementation has been scaffolded yet. pnpm is the confirmed package manager, but setup, development, build, and test commands will be documented only after the corresponding configuration exists.

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

- [Architecture](docs/architecture.md) is the current source of truth for scope, boundaries, decisions, and unresolved implementation spikes.
- [Repository Guidelines](AGENTS.md) contains stable rules for contributors and coding agents.

Contributors should read both documents before making implementation changes. Open implementation spikes must be verified rather than guessed, and major architectural changes should be recorded through an ADR once the decision-record system exists.

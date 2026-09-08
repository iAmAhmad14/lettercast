# Repository Guidelines

## Authority and Scope

`architectural-proposal.md` is the current source of truth for system scope, boundaries, security, and v1 decisions. Read it before making implementation changes. This file contains durable contributor rules and must not duplicate or redefine the architecture.

The confirmed package manager is pnpm. The project has not been scaffolded, so do not invent setup, build, test, repository-layout, style, naming, or commit conventions. Document commands only after committed configuration makes them real.

## Boundaries and Validation

Keep the three runtime responsibilities distinct:

- The content script reads and renders Letterboxd DOM. It performs no network requests.
- The MV3 service worker is the extension's sole network egress and must not rely on in-memory state for correctness.
- The Cloudflare Worker owns the TMDB credential, upstream integration, normalization, caching, and abuse controls. It is not a generic proxy.

Validate runtime messages at the service-worker boundary. Validate Cloudflare backend responses at the service-worker boundary. Validate raw TMDB responses inside the Cloudflare Worker. Internal TypeScript values do not require runtime validation by default.

## Hard Architecture Invariants

- Use Model B only: render a separate extension-owned cast block and leave Letterboxd's cast nodes untouched.
- Never use fuzzy title/year matching or actor identity matching.
- Expose only the narrow `get-cast` message operation.
- Do not add TMDB endpoints without an explicit architecture decision.
- Do not add client-side storage in v1.
- Keep permissions narrow. Do not request `cookies`, `tabs`, broad host access, or speculative permissions.
- Do not add analytics, remote scripts, `eval`, or `new Function`.
- Only the TMDB movie ID may leave the browser.
- Failures must leave the Letterboxd page usable and unchanged.
- Never add a document-wide `MutationObserver`.

Never commit credentials. Keep the TMDB secret in Cloudflare through Wrangler secrets, outside the extension bundle and repository.

## Open Questions and Decisions

Unresolved implementation spikes in `architectural-proposal.md` must be verified rather than guessed or silently assumed. Record evidence before converting a spike result into architecture.

Once an ADR system exists, major architectural changes require an ADR and a corresponding update to the current architecture documentation. Do not change an invariant incidentally while working on another component.

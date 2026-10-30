# Repository Guidelines

## Authority and Scope

`docs/architecture.md` is the current source of truth for system scope, boundaries, security, and v1 decisions. Read it before making implementation changes. This file contains durable contributor rules and must not duplicate or redefine the architecture.

The repository is a pnpm workspace. Node and pnpm versions are pinned in `.node-version` and `package.json`; use Corepack rather than another package manager. The extension lives in `apps/extension`, the Cloudflare Worker in `apps/worker`, shared contracts in `packages/contracts`, and browser smoke tests in `tests/e2e`.

The committed root commands are:

- `corepack pnpm install --frozen-lockfile` — install the exact lockfile.
- `corepack pnpm lint` — run repository lint rules.
- `corepack pnpm typecheck` — type-check every workspace package.
- `corepack pnpm test` — run current unit and runtime tests.
- `corepack pnpm build` — build the Worker and extension and verify Manifest V3.
- `corepack pnpm security` — inspect built artifacts and sources for permission, endpoint, credential, and code-loading violations.
- `corepack pnpm test:e2e` — build the test-mode extension and run mocked-network Chromium smoke tests.
- `corepack pnpm run ci` — run the aggregate validation sequence.

Do not invent additional style, naming, or commit conventions; follow committed configuration and document new commands only after they exist.

## Boundaries and Validation

Keep the three runtime responsibilities distinct:

- The content script reads and renders Letterboxd DOM. It performs no network requests.
- The MV3 service worker is the extension's sole network egress and must not rely on in-memory state for correctness.
- The Cloudflare Worker owns the TMDB credential, upstream integration, normalization, caching, and abuse controls. It is not a generic proxy.

Validate runtime messages at the service-worker boundary. Validate Cloudflare backend responses at the service-worker boundary. Validate raw TMDB responses inside the Cloudflare Worker. Internal TypeScript values do not require runtime validation by default.

## Hard Architecture Invariants

- Use Model B only: render a separate extension-owned cast block as the last child of Letterboxd's cast tab panel (ADR 0012), and leave Letterboxd's cast nodes untouched.
- Never use fuzzy title/year matching or fuzzy actor matching. The only permitted actor association is ADR 0013's exact, unique, same-page resolution of native Letterboxd actor links. It may only add a link and must never change displayed TMDB data.
- Expose only the narrow `get-cast` message operation.
- Do not add TMDB endpoints without an explicit architecture decision.
- Do not add client-side storage in v1.
- Keep permissions narrow. Do not request `cookies`, `tabs`, broad host access, or speculative permissions.
- Do not add analytics, remote scripts, `eval`, or `new Function`.
- Only the TMDB movie ID may leave the browser.
- Failures must leave the Letterboxd page usable and unchanged.
- Never add a document-wide `MutationObserver`.

Never commit credentials. Keep the TMDB secret in Cloudflare through Wrangler secrets, outside the extension bundle and repository.

Release builds use the committed public manifest key to preserve one stable Chrome extension ID. The public key is non-secret. The cast endpoint is an unauthenticated narrow public API: accept an absent Origin, reject any supplied Origin other than the approved extension Origin, and never emit wildcard CORS. Do not add an embedded client secret or identity signal. Never commit, document, log, or package corresponding private signing material, local environment files, Cloudflare/Wrangler credentials, or TMDB tokens. GitHub Release assets must be production extension ZIPs, not source archives; generated manifests and build directories remain untracked.

## Versioned Work Workflow

Release work runs from two local-only planning files: `docs/vX.Y.Z.md` (the detailed plan) and `docs/vX.Y.Z-todo.md` (the ordered checklist). They are excluded through `.git/info/exclude` and must never be staged or committed. The plan is subordinate to `docs/architecture.md` and the ADRs. If they conflict, stop and report.

- Work only on the release feature branch named in the plan. Never commit directly to `main`.
- Complete todo items in order. Each implementation item is one focused commit that leaves the repository green.
- Before each commit, run the item's targeted checks, then `corepack pnpm run ci`. Commit only when all checks pass. Never skip, disable, or weaken a test or verification script to make it pass, unless an accepted ADR requires that verification change.
- Match the existing commit-message style in `git log`. Do not invent a new convention.
- After each commit, mark the todo item done in the local todo file and record its short commit hash.
- Stop and report instead of improvising when a check cannot be made to pass, live behaviour contradicts recorded evidence, or a step would need a new architecture decision, credential, or permission.
- Never push, merge, rebase shared history, create or move tags, publish GitHub Releases, edit GitHub settings, or deploy the Cloudflare Worker without explicit owner approval in the current session.
- Never bypass bot challenges, CAPTCHAs, or access controls on live sites. Use local fixtures for automated verification.

## Spikes and Decisions

Implementation uncertainties must be verified rather than guessed or silently assumed. Record evidence before converting a spike result into architecture.

Major architectural changes require an ADR and a corresponding update to the current architecture documentation. Do not change an invariant incidentally while working on another component.

# ADR 0012: Render Inside the Native Cast Tab Panel and Support Film Tab Routes

## Status

Accepted (2026-10-29). Amends the placement detail of ADR 0004 and the supported-URL scope of ADR 0005. All other parts of those ADRs remain accepted.

## Context

v1.0.0 inserted the extension-owned block immediately after `#tab-panel-cast`. Letterboxd film pages place Cast, Crew, Details, Genres, and Releases panels in one tabbed area and hide inactive panels with `hidden="until-found"`. Because the block was a sibling, it remained visible under every tab.

The [2026-10-29 spike](../spikes/2026-10-29-letterboxd-cast-tabs-and-actor-links.md) also verified that tab selection changes the URL to `/film/{slug}/{tab}/`. Those routes load directly with the same TMDB identity signals and cast panel. v1.0.0 declined them because it accepted only `/film/{slug}/`.

## Decision

1. Insert the single extension-owned block as the **last child** of the unique `#tab-panel-cast` element. Never modify, move, reorder, or remove Letterboxd's own children of that panel.
2. Rely on Letterboxd's native panel visibility. Do not add tab-click listeners, history hooks, polling, or any `MutationObserver` to track tab state.
3. Treat these as supported film-detail routes: `/film/{slug}/` and `/film/{slug}/{cast|crew|details|genres|releases}/`. All other identity, movie-only, and decline rules from ADR 0005 apply unchanged. Other subpaths such as reviews, lists, and user-scoped film pages remain unsupported.
4. The content script still runs once at `document_idle`. Client-side tab switches do not trigger another request, because the block already rendered at load stays inside the panel.

## Rationale

Placing the block inside the panel keeps Model B's guarantee: an extension-owned block with untouched native cast nodes. The browser and Letterboxd then govern its visibility. This is the smallest change that matches user expectations, and it adds no lifecycle complexity, observer, or permission.

## Consequences

- The block is visible exactly when the native cast panel is visible. That covers the film root, `/cast/`, and the Cast tab after any client-side switch.
- On a direct load of a non-cast tab route, the block renders hidden and appears when the user selects Cast. That page view still makes one cast request.
- Browser find-in-page may reveal the hidden cast panel, including the block, through `until-found` semantics. This matches native behaviour.
- Tests must assert placement inside the panel, unchanged native children, and hidden/visible state driven by the panel's `hidden` attribute.
- If Letterboxd changes its tab hiding mechanism, the block follows whatever hides the native panel. If the panel is absent or duplicated, Lettercast declines, as before.

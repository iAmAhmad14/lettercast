# Spike: Letterboxd Cast Tabs and Native Actor Links

**Result:** PASS. Both requested v1.1.0 behaviours are feasible without new permissions, endpoints, storage, or observers  
**Investigated:** 2026-10-29

## Questions

1. Why does the Lettercast block remain visible when a user selects the Crew, Details, Genres, or Releases tab, and how does Letterboxd hide inactive tab panels?
2. Do Letterboxd tab routes such as `/film/{slug}/cast/` and `/film/{slug}/crew/` exist, and do they serve the same identity and cast markup?
3. Can a TMDB cast card link to the actor's Letterboxd page without fuzzy matching, a new TMDB endpoint, or data leaving the browser?

## Why It Matters

v1.0.0 inserts the block as the next sibling of `#tab-panel-cast`, so it ignores Letterboxd's tab state. Its URL guard accepts only `/film/{slug}/`. ADR 0004 prohibited actor identity matching, so actor links require recorded evidence and a new decision.

## Verification Method

- Fetched current unauthenticated HTML for `https://letterboxd.com/film/inception/` and inspected the tab structure.
- Drove installed Google Chrome headlessly through Playwright on Inception and Dune: Part Two. Recorded panel `hidden` attributes, URLs after tab clicks, direct loads of tab routes, and visibility (`Element.checkVisibility()` and Playwright `isVisible()`) of probe elements placed inside and after `#tab-panel-cast`.
- Requested `https://letterboxd.com/tmdb/27205/` and `https://letterboxd.com/tmdb/person/6193/` in the browser.
- For eight films, compared the first ten production `GET /v1/movie/{id}/cast` members in TMDB order with the native anchors inside `#tab-panel-cast`. The comparison used exact names after Unicode NFC, whitespace collapse, and lower-casing, and required a unique match on both sides.
- Probe scripts were temporary, lived outside the repository, and were not committed.

## Concrete Evidence

### Tab markup and behaviour

```html
<div class="cast-crew-details-tabs">
  <div class="content-tab-filters"><div class="tablist" role="tablist">
    <a id="tab-cast" href="/film/inception/cast/" role="tab"
       aria-controls="tab-panel-cast" aria-selected="true">…</a>
    <a id="tab-crew" href="/film/inception/crew/" role="tab"
       aria-controls="tab-panel-crew" aria-selected="false">…</a>
    <!-- details, genres, releases -->
  </div></div>
  <div id="tab-panel-cast" role="tabpanel">…</div>
  <div id="tab-panel-crew" class="column-block" role="tabpanel" hidden="until-found">…</div>
  <!-- details, genres, releases panels are also hidden="until-found" -->
</div>
```

| State | URL | `#tab-panel-cast[hidden]` | Probe inside panel | Probe after panel |
|---|---|---|---|---|
| Initial load | `/film/inception/` | absent | visible | visible |
| Crew clicked | `/film/inception/crew/` | `until-found` | **hidden** | visible (v1.0.0 defect) |
| Details clicked | `/film/inception/details/` | `until-found` | **hidden** | visible (v1.0.0 defect) |

- Tab clicks change the URL client-side (history API) without a reload. Letterboxd toggles `hidden="until-found"` on panels and `aria-selected` on tabs. Computed `display` stays `block`; `until-found` hides content through content visibility, so `checkVisibility()` is the reliable visibility signal.
- Direct browser loads of `/film/dune-part-two/cast/`, `/crew/`, and `/details/` each returned `200` with `data-tmdb-type="movie"` and `data-tmdb-id="693134"`. Only the panel matching the route was unhidden. The cast panel is present in the DOM on every route.
- The content-script match `https://letterboxd.com/film/*` already covers these routes. v1.0.0's stricter URL regex is what declines them.

### Actor links

- `letterboxd.com/tmdb/27205/` redirects to `/film/inception/`. `letterboxd.com/tmdb/person/6193/` returns `404 Not Found`. No ID-based person redirect exists.
- Native actor slugs cannot be derived from names: `/actor/contributor:17664/` (Elliot Page), `/actor/peter-postlethwaite/` (displayed as "Pete Postlethwaite"), and `/actor/choi-woo-shik-1/`. Slug or name-to-URL construction is therefore unsafe.
- Every native actor link is already present inside `#tab-panel-cast .cast-list`, including those inside the collapsed `#cast-overflow` span: `<a title="{character}" href="/actor/{slug}/" class="text-slug tooltip">{name}</a>`.
- Exact unique same-page name resolution linked **80 of 80** TMDB top-ten members, with no ambiguity: Inception, Dune: Part Two, The Matrix, Parasite, GoodFellas, Everything Everywhere All at Once, Amélie, and Spirited Away.

### Operational observation

Initial non-browser requests to tab routes and `/tmdb/` paths received `403`. After several automated tab clicks, Letterboxd presented a Cloudflare Turnstile challenge dialog. The probe stopped and did not attempt to bypass it. Automated verification must use local fixtures, and live checks remain light, manual, or owner-driven.

## Result

1. Mounting the extension block as the last child of `#tab-panel-cast` makes it inherit Letterboxd's own tab visibility. This needs no observer, event listener, or tab-state logic.
2. Accepting `/film/{slug}/{cast|crew|details|genres|releases}/` lets the block render on direct loads and refreshes of tab routes. On non-cast routes it stays hidden with its panel until the user selects Cast.
3. Linking is feasible only through local resolution against Letterboxd's own same-page actor anchors. It needs no network request or new data egress, and it adds no TMDB endpoint.

## Confidence and Limitations

Confidence is high for current public desktop film pages. Logged-in, localized, experimental, and mobile variants were not sampled. Exact-name resolution can fail when TMDB and Letterboxd display names diverge. The design must then omit the link rather than guess. Letterboxd markup remains a private implementation detail, not a public contract.

## Architecture Effect

Recorded by [ADR 0012](../decisions/0012-render-inside-the-native-cast-tab-panel.md) and [ADR 0013](../decisions/0013-link-cast-cards-to-native-letterboxd-actor-pages.md), and reflected in [`docs/architecture.md`](../architecture.md).

## Remaining Uncertainty

Future Letterboxd changes to tab hiding, routes, or actor-anchor markup. Fixtures, graceful decline (block still renders without links), and periodic manual checks are the mitigation.

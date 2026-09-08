# Spike: Initial Versus Asynchronous Letterboxd Markup

**Result:** PASS for sampled pages; no observer currently required  
**Investigated:** 2026-09-08

## Question

Are the movie identity and cast elements needed by Lettercast present in the initial HTML, or added asynchronously after page load?

## Why It Matters

Server-rendered markup allows `document_idle` processing without a `MutationObserver`. An asynchronous cast would require the architecture's bounded, container-scoped fallback.

## Verification Method

Compared unauthenticated initial HTTP response bodies with the DOM produced by Chrome 152.0.7977.82. Initial cast links were counted between `#tab-panel-cast` and `#tab-panel-crew`. The rendered Dune page was queried after navigation settled.

## Concrete Evidence

Initial response results:

| Film | Cast panel in initial HTML | Initial cast links |
|---|---:|---:|
| Dune: Part Two | yes | 99 |
| The Matrix | yes | 38 |
| Parasite | yes | 55 |

Representative initial HTML:

```html
<div id="tab-panel-cast">
  <h3 class="hidden">Cast</h3>
  <div class="cast-list text-sluglist">
    <a title="Paul Atreides" href="/actor/timothee-chalamet/"
       class="text-slug tooltip">Timothée Chalamet</a>
```

The rendered Dune DOM contained the same cast container and 99 cast links. Its movie type, movie ID, and outbound TMDB link were also present.

## Result

The relevant markup is server-rendered on the sampled pages. No asynchronous fetch or expansion was required to obtain the identity signals or full cast list.

## Confidence and Limitations

Confidence is high for current public desktop film pages and especially Dune, where initial and rendered counts matched. This does not prove every account state, experiment, or future page variant behaves identically.

## Architecture Effect

No architecture change. Implementation can begin with `document_idle` and no observer, matching the preferred architecture path. Graceful decline remains required if markup is missing.

## Remaining Uncertainty

If future evidence shows delayed markup, only a bounded observer scoped to the relevant parent may be considered. A document-wide or permanent observer remains prohibited.

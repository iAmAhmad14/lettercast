# ADR 0005: Use Page TMDB Identity and Movie-Only Scope

## Status

Accepted

## Context

Title and year searches can select the wrong work. TV credits also use different TMDB endpoints and character semantics from movie credits. V1 prioritizes omission over plausible but incorrect metadata.

## Decision

Support canonical Letterboxd film-detail pages for movies only. Use an existing TMDB reference on the page as the sole film identity mechanism: the outbound TMDB link is the primary signal and `data-tmdb-id` is corroborating evidence. Require a positive integer movie ID and decline when signals are absent, disagree, cannot establish media type, or indicate TV.

Never fall back to fuzzy title/year matching.

## Rationale

Using Letterboxd's existing TMDB reference avoids wrong-film attribution. Restricting v1 to movies preserves one endpoint and one coherent cast model.

## Consequences

Unsupported, ambiguous, or TV-backed pages produce no backend request and no enhancement. Lists, reviews, diary entries, person pages, search results, and embedded cards remain out of scope. At acceptance, current selectors and markup assumptions were pending verification. TV support requires a future architecture decision.

## Verification Note (2026-09-08)

The completed markup spike verified corroborating movie type/ID attributes on `<body>` and an outbound TMDB movie link on three current public film pages. The observed tracking value is uppercase `TMDB`. The decision is unchanged; these selectors remain private Letterboxd implementation details and must fail closed if they drift.

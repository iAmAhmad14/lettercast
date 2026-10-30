# ADR 0004: Render an Extension-Owned Cast Block

## Status

Accepted. Amended by [ADR 0012](0012-render-inside-the-native-cast-tab-panel.md), which mounts the block inside the native cast tab panel, and by [ADR 0013](0013-link-cast-cards-to-native-letterboxd-actor-pages.md), which permits exact, unique, same-page actor-link resolution used only to add hyperlinks. Model B, untouched native cast nodes, the ban on fuzzy matching, and safe rendering remain in force.

## Context

Enhancing Letterboxd's existing cast nodes would require matching Letterboxd people to TMDB cast entries. Names, ordering, credits, transliteration, duplicate roles, and synchronization timing can differ, making silent false attribution possible.

## Decision

Use Model B: leave Letterboxd's cast markup untouched and insert a visually distinct, extension-owned cast block built entirely from TMDB results. Do not perform actor identity matching. Rendering must be idempotent and use safe text or attribute assignment rather than external-data `innerHTML`.

Never install a document-wide or permanent `MutationObserver`. At acceptance, whether any observer was needed remained an implementation spike; if evidence requires one, it must be scoped, bounded, and disconnected after use.

## Verification Note (2026-09-08)

The completed initial-markup spike found the required identity and full cast markup in the initial HTML of the sampled pages. The initial implementation therefore requires no observer. The prohibition on document-wide or permanent observation is unchanged.

## Rationale

This design removes wrong-actor attribution as a problem class. It also guarantees that extension failure cannot corrupt or replace Letterboxd's native cast presentation.

## Consequences

Users may see both Letterboxd and TMDB cast presentations, and the lists may differ. Missing character data is omitted, and missing or failed images use a neutral placeholder. Any failure must leave the underlying Letterboxd page usable and unchanged.

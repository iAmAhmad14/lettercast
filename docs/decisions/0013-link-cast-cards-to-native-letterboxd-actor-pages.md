# ADR 0013: Link Cast Cards to Native Letterboxd Actor Pages

## Status

Accepted (2026-10-29). Narrowly amends ADR 0004's prohibition on actor identity matching for the single purpose defined below. All other parts of ADR 0004 remain accepted.

## Context

Users want to open an actor's Letterboxd page by clicking that actor's portrait or name in the Lettercast block, just as they can click the native cast name. TMDB data contains a TMDB person ID and name, not a Letterboxd URL.

The [2026-10-29 spike](../spikes/2026-10-29-letterboxd-cast-tabs-and-actor-links.md) found:

- No ID-based Letterboxd person redirect exists (`/tmdb/person/{id}/` returns `404`).
- Letterboxd slugs cannot be derived from names (`contributor:17664`, `peter-postlethwaite` for "Pete Postlethwaite", `-1` suffixes).
- The correct actor URLs are already present on the same page as native anchors inside `#tab-panel-cast`.
- Exact unique name resolution linked 80 of 80 sampled top-ten TMDB members across eight films.

ADR 0004 originally banned matching because silent false attribution could corrupt the cast presentation.

## Decision

Permit one tightly bounded association: **exact, unique, same-page resolution of a TMDB cast member's name to a native Letterboxd actor anchor, used only to add a hyperlink.**

1. **Source of URLs:** Use only `href` values from anchors inside `#tab-panel-cast .cast-list`, including the collapsed overflow list. Never construct, guess, or transform an actor URL from a name, slug, TMDB ID, or position.
2. **URL validation:** Resolve each `href` against `https://letterboxd.com/`. Accept it only if it is HTTPS, has host exactly `letterboxd.com`, no port, credentials, query, or fragment, and a path matching `/actor/{slug}/`. The slug is either lowercase alphanumeric-and-hyphen or `contributor:{positive integer}`. Emit the canonical absolute URL. Ignore any anchor that fails validation.
3. **Name comparison:** Compare the TMDB `name` with the native anchor text after only these steps: Unicode NFC normalization, whitespace collapse, trim, and locale-independent lower-casing. Do not strip diacritics or punctuation, transliterate, use edit distance or similarity scores, match on partial names, or use character names, order, position, or slugs.
4. **Uniqueness:** Link only when the normalized name maps to exactly one distinct validated URL on the page, and to exactly one distinct TMDB person among the rendered members. Otherwise, render that card without a link.
5. **Effect:** A match only wraps the card in a link. It never changes the TMDB name, character, portrait, order, or count displayed, and it never touches Letterboxd nodes.
6. **Link behaviour:** Use a standard anchor with `target="_blank"` and `rel="noopener noreferrer"`. Do not use a `tabs` permission, script-driven navigation, or click tracking.
7. **Privacy and egress:** Resolution is local DOM work in the content script. No request is made and nothing new leaves the browser. Navigation happens only when the user clicks.
8. **Failure:** Any failure in resolution, such as missing markup or an exception, results in an unlinked card. It never blocks rendering of the block.

## Rationale

The user value is high, and the false-link risk is bounded. Comparison is restricted to one film's own cast list, which is typically tens of people, and ambiguity always declines. The worst case is a missing link, never altered TMDB data. This preserves ADR 0004's core guarantees: native nodes stay untouched, displayed data comes entirely from TMDB, and failure is harmless.

## Consequences

- Fuzzy matching remains prohibited everywhere. Film identity still uses only the page's TMDB signals.
- Some cards may be unlinked when TMDB and Letterboxd display names differ. This is accepted and must not be fixed by loosening the rules above.
- The resolver lives in a dedicated content-script module with its own tests and boundary checks. These checks cover no network APIs, no `innerHTML`, no fuzzy or similarity logic, and no hosts other than `letterboxd.com` for links.
- Any broader association, such as fuzzy names, cross-page lookups, TMDB person endpoints, or using matches to change displayed data, requires a new ADR.

# ADR 0003: Use a Narrow Cast Contract

## Status

Accepted

## Context

V1 needs one request per supported film page to obtain cast names, character names, profile paths, identifiers, and ordering. A generic fetch bridge or TMDB proxy would expand permissions, validation work, and abuse risk.

## Decision

Expose one runtime message operation:

`{ type: "get-cast", tmdbId: number }`

The service worker calls `GET /v1/movie/{tmdbId}/cast` on the Cloudflare Worker. On a cache miss, the Worker calls only TMDB `GET /movie/{id}/credits`, validates the fields used, and returns the normalized cast contract with a small typed error vocabulary.

## Rationale

The credits endpoint supplies all required v1 data in one call. A purpose-specific contract keeps each trust boundary understandable and prevents the backend or service worker from becoming an arbitrary network capability.

## Consequences

The Cloudflare Worker is not a generic proxy, and the runtime message handler must never accept an arbitrary URL. Additional TMDB endpoints or operations require an explicit architecture decision and, once available, an ADR. Data not needed for cast rendering is neither modeled nor returned.

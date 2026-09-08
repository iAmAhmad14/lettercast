# Spike: Cloudflare Workers Native Rate Limiting

**Result:** PASS for architecture planning: GA, API, and resource-key capability confirmed; account deployment and numeric thresholds remain open  
**Investigated:** 2026-09-08

## Question

Is Cloudflare's native Workers Rate Limiting binding currently available, what API does it expose, and what limits affect Lettercast?

## Why It Matters

The public Worker needs coarse abuse protection without KV counters or a separate service. Configuration must match the current Cloudflare platform and account.

## Verification Method

Reviewed current primary sources:

- [Cloudflare GA announcement](https://developers.cloudflare.com/changelog/post/2025-09-19-ratelimit-workers-ga/)
- [Workers Rate Limiting binding documentation](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [Workers platform limits](https://developers.cloudflare.com/workers/platform/limits/)

No Cloudflare account deployment was attempted because the repository has no account configuration or credentials.

## Concrete Evidence

- Cloudflare marked the binding Generally Available on 2025-09-19 and calls it stable for production workloads.
- Current documentation requires Wrangler `4.36.0` or later.
- Wrangler configuration uses a `ratelimits` binding with `name`, a string-form positive-integer `namespace_id`, and `simple.limit` plus `simple.period`.
- `simple` is the only documented configuration type; `period` must be `10` or `60` seconds.
- Runtime use is `await env.MY_RATE_LIMITER.limit({ key })`, returning `{ success }`.
- The key may be any string. Cloudflare documents resource- and path-specific limits as supported uses.
- Counters are per key and Cloudflare location, asynchronously updated, permissive, and eventually consistent; they are not accurate accounting.
- Bindings are not currently visible in the dashboard.
- Cloudflare now explicitly advises against IP-address keys because NAT, mobile networks, and privacy proxies can group unrelated users.
- General Workers Free limits include 100,000 requests/day, 10 ms CPU/request, and 50 subrequests/request. These are platform limits, not documented binding quotas.

## Result

The native binding is GA and technically suitable for coarse mitigation. Its arbitrary-string key supports the accepted resource-scoped key `get-cast:{tmdbMovieId}`. No binding-specific paid-plan gate is stated in the current documentation, but this does not verify access on the eventual Lettercast account.

## Confidence and Limitations

Confidence is high for the documented API, arbitrary-string key, and location-scoped behavior. Account entitlement and deployment behavior remain untested. Exact request thresholds remain intentionally undecided.

## Architecture Effect

The native-binding choice remains viable. ADR 0008 resolves the former IP-key conflict by accepting the resource-scoped key `get-cast:{tmdbMovieId}`, derived only from already-approved data. The strategy adds no user identity, permissions, client storage, analytics, or tracking. Its counters remain coarse, location-scoped, and eventually consistent rather than exact or global.

## Remaining Uncertainty

Verify the binding by deployment on the selected account and choose numeric limits using an allowed 10- or 60-second period. These are implementation/deployment configuration decisions and do not materially block implementation planning.

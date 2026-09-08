# Spike: Letterboxd CSP and Direct TMDB Images

**Result:** PASS on current sampled pages  
**Investigated:** 2026-09-08

## Question

Does Letterboxd's page policy allow an extension-inserted profile image to load directly from `image.tmdb.org`?

## Why It Matters

If Letterboxd blocks the TMDB CDN through `img-src`, the architecture's direct-image approach would fail and image proxying would need separate architectural review.

## Verification Method

Captured GET response headers and searched initial HTML for CSP meta elements on the three film URLs used by the markup spike. Then inserted this image into the live Dune document through Chrome DevTools Protocol:

`https://image.tmdb.org/t/p/w185/dFxpwRpmzpVfP1zjluH68DeQhyj.jpg`

The profile path was observed on TMDB's current public [Dune: Part Two cast page](https://www.themoviedb.org/movie/693134-dune-part-two/cast).

The probe listened for `load`, `error`, and `securitypolicyviolation` events and inspected intrinsic dimensions.

## Concrete Evidence

- All three pages returned `200 OK` with no `Content-Security-Policy` or `Content-Security-Policy-Report-Only` response header.
- None contained a CSP `<meta http-equiv>` element.
- The injected image emitted `load`, not `error`.
- `complete` was `true`; intrinsic size was `185 × 277`; rendered test size was `92 × 138` CSS pixels.
- The collected CSP violation list was empty.

The pages did return `x-content-type-options: nosniff` and `referrer-policy: strict-origin-when-cross-origin`, neither of which blocks the tested image.

## Result

Current Letterboxd film pages permit direct TMDB CDN images. The browser-runtime test confirms actual loading, not merely the absence of a header.

## Confidence and Limitations

Confidence is high for the sampled public pages on 2026-09-08. Headers are operational configuration and may change without notice. The probe tested one valid JPEG profile path and one Chromium version.

## Architecture Effect

No architecture change. Direct TMDB CDN loading remains viable; image proxying is not currently justified.

## Remaining Uncertainty

Future CSP changes, browser differences, or TMDB CDN policy changes require graceful image-error fallback and periodic re-verification.

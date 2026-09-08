# Spike: TMDB Profile Image Size

**Result:** PASS for `w185` as the v1 default candidate  
**Investigated:** 2026-09-08

## Question

Which TMDB profile image size is appropriate for Lettercast's compact cast presentation?

## Why It Matters

Images should remain sharp on high-density displays without downloading unnecessarily large profile assets. The selected path must also use a size TMDB officially advertises.

## Verification Method

Reviewed TMDB's primary documentation:

- [Image URL basics](https://developer.themoviedb.org/docs/image-basics)
- [API configuration details](https://developer.themoviedb.org/reference/configuration-details)

Tested a current public profile path at `w45`, `w92`, `w185`, `h632`, and `original` on `image.tmdb.org`. Loaded `w185` inside a live Letterboxd Dune page at 92 CSS pixels wide in Chrome.

The profile path came from TMDB's current public [Dune: Part Two cast page](https://www.themoviedb.org/movie/693134-dune-part-two/cast).

## Concrete Evidence

TMDB says image URLs combine `base_url`, `file_size`, and `file_path`. Its current configuration example reports:

```json
"secure_base_url": "https://image.tmdb.org/t/p/",
"profile_sizes": ["w45", "w185", "h632", "original"]
```

The tested profile returned JPEG `200 OK` responses with these transfer sizes:

| Size path | Bytes |
|---|---:|
| `w45` | 1,955 |
| `w92` | 3,922 |
| `w185` | 10,164 |
| `h632` | 36,677 |
| `original` | 83,350 |

Although `w92` currently resolves, it is not listed as an official profile size. In the browser probe, `w185` decoded to `185 × 277` and rendered cleanly at `92 × 138`, supplying approximately two source pixels per CSS pixel. The visible cast content area measured 390 CSS pixels at the probe's 800-pixel viewport.

## Result

Use `w185` as the default implementation candidate for portraits displayed up to roughly 92 CSS pixels wide. `w45` is too small for that high-density target; `h632` and `original` are unnecessarily large.

## Confidence and Limitations

Confidence is high in TMDB's advertised sizes and the tested CDN behavior. The extension-owned cast block has not been designed, so the final CSS width and responsive behavior are not yet known.

## Architecture Effect

No architecture change. This resolves the initial size candidate in favor of `w185`, subject to confirmation against the eventual UI dimensions.

## Remaining Uncertainty

Re-evaluate if the final design displays profiles wider than about 92 CSS pixels or needs responsive `srcset` behavior.

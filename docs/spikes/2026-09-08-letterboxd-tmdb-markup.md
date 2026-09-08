# Spike: Current Letterboxd TMDB Markup

**Result:** PASS, with one selector correction  
**Investigated:** 2026-09-08

## Question

Do current Letterboxd film pages expose a reliable TMDB movie type and ID in their live markup?

## Why It Matters

Lettercast must identify a film without title/year search. If the page signals are absent or disagree, the architecture requires declining to enhance.

## Verification Method

Fetched unauthenticated initial HTML with a desktop browser user agent for:

- <https://letterboxd.com/film/dune-part-two/>
- <https://letterboxd.com/film/the-matrix/>
- <https://letterboxd.com/film/parasite-2019/>

The Dune page was also inspected after loading in Chrome 152.0.7977.82 through the Chrome DevTools Protocol.

## Concrete Evidence

All three initial responses contained exactly one TMDB ID and one outbound TMDB link:

| Film | Body type | Body ID | Link action | Link target |
|---|---:|---:|---|---|
| Dune: Part Two | `movie` | `693134` | `TMDB` | `https://www.themoviedb.org/movie/693134/` |
| The Matrix | `movie` | `603` | `TMDB` | `https://www.themoviedb.org/movie/603/` |
| Parasite | `movie` | `496243` | `TMDB` | `https://www.themoviedb.org/movie/496243/` |

Representative initial HTML:

```html
<body class="film dune-eye backdropped"
      data-type="film" data-tmdb-type="movie" data-tmdb-id="693134">
<a href="https://www.themoviedb.org/movie/693134/"
   data-track-action="TMDB">TMDB</a>
```

The rendered Dune DOM exposed the same values.

## Result

Current public film pages provide corroborating type/ID data on `<body>` and in an outbound TMDB movie URL. The proposal's `data-track-action="TMDb"` spelling is not current: the observed value is uppercase `TMDB`.

## Confidence and Limitations

Confidence is high for the three sampled public movie pages. Letterboxd markup is private implementation detail, not a stable API. Logged-in, localized, experimental, and user-scoped variants were not sampled.

## Architecture Effect

No architecture decision changes. Existing-reference identification remains viable. Implementation fixtures/selectors must reflect uppercase `TMDB` (or compare safely without assuming the old casing).

## Remaining Uncertainty

Markup stability across account states and future Letterboxd releases requires fixture maintenance and periodic live checks.

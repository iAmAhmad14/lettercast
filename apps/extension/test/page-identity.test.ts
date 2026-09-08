import { describe, expect, it } from "vitest";

import { detectLetterboxdMoviePage } from "../src/content/page-identity";
import duneHtml from "./fixtures/dune-part-two.html?raw";
import matrixHtml from "./fixtures/the-matrix.html?raw";
import parasiteHtml from "./fixtures/parasite-2019.html?raw";

function parseFixture(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

function detect(html: string, url = "https://letterboxd.com/film/the-matrix/") {
  return detectLetterboxdMoviePage(parseFixture(html), url);
}

function baseFixture(
  bodyAttributes = 'data-tmdb-type="movie" data-tmdb-id="603"',
  link = '<a href="https://www.themoviedb.org/movie/603/" data-track-action="TMDB">TMDB</a>',
  cast = '<div id="tab-panel-cast"><div class="cast-list text-sluglist"></div></div>',
): string {
  return `<!doctype html><html><body ${bodyAttributes}>${link}${cast}</body></html>`;
}

describe("Letterboxd movie-page identity", () => {
  it.each([
    [duneHtml, "https://letterboxd.com/film/dune-part-two/", 693134],
    [matrixHtml, "https://letterboxd.com/film/the-matrix/", 603],
    [parasiteHtml, "https://letterboxd.com/film/parasite-2019/", 496243],
  ])("extracts the corroborated movie ID from a verified fixture", (html, url, id) => {
    const result = detect(html, url);

    expect(result?.tmdbId).toBe(id);
    expect(result?.castContainer.id).toBe("tab-panel-cast");
  });

  it("requires the verified uppercase TMDB tracking value", () => {
    const html = baseFixture(
      undefined,
      '<a href="https://www.themoviedb.org/movie/603/" data-track-action="TMDb">TMDB</a>',
    );

    expect(detect(html)).toBeNull();
  });

  it.each(["0", "-1", "01", "1.5", "9007199254740992", "not-an-id"])(
    "rejects malformed body ID %s",
    (id) => {
      expect(
        detect(baseFixture(`data-tmdb-type="movie" data-tmdb-id="${id}"`)),
      ).toBeNull();
    },
  );

  it.each([
    "https://www.themoviedb.org/movie/0/",
    "https://www.themoviedb.org/movie/0603/",
    "https://www.themoviedb.org/movie/603",
    "https://www.themoviedb.org/movie/603/cast/",
    "https://www.themoviedb.org/movie/603/?other=1",
    "https://www.themoviedb.org/tv/603/",
    "http://www.themoviedb.org/movie/603/",
    "https://example.com/movie/603/",
  ])("rejects malformed or non-movie TMDB link %s", (href) => {
    expect(
      detect(
        baseFixture(
          undefined,
          `<a href="${href}" data-track-action="TMDB">TMDB</a>`,
        ),
      ),
    ).toBeNull();
  });

  it("rejects conflicting body and link IDs", () => {
    expect(
      detect(
        baseFixture('data-tmdb-type="movie" data-tmdb-id="603"').replace(
          "/movie/603/",
          "/movie/693134/",
        ),
      ),
    ).toBeNull();
  });

  it.each([
    baseFixture('data-tmdb-type="movie"'),
    baseFixture('data-tmdb-id="603"'),
    baseFixture(undefined, ""),
    baseFixture(undefined, undefined, ""),
  ])("rejects missing required signal", (html) => {
    expect(detect(html)).toBeNull();
  });

  it.each([
    baseFixture('data-tmdb-type="tv" data-tmdb-id="603"'),
    baseFixture('data-tmdb-type="miniseries" data-tmdb-id="603"'),
  ])("rejects non-movie media types", (html) => {
    expect(detect(html)).toBeNull();
  });

  it.each([
    "http://letterboxd.com/film/the-matrix/",
    "https://www.letterboxd.com/film/the-matrix/",
    "https://letterboxd.com/",
    "https://letterboxd.com/films/",
    "https://letterboxd.com/actor/sample/",
    "https://letterboxd.com/user/sample/film/the-matrix/",
    "https://letterboxd.com/film/the-matrix/reviews/",
  ])("rejects unrelated or noncanonical page %s", (url) => {
    expect(detect(matrixHtml, url)).toBeNull();
  });

  it("accepts duplicate primary links only when every ID agrees", () => {
    const duplicate =
      '<a href="https://www.themoviedb.org/movie/603/" data-track-action="TMDB">TMDB duplicate</a>';

    expect(detect(baseFixture().replace("</body>", `${duplicate}</body>`))?.tmdbId).toBe(603);
  });

  it("rejects conflicting or malformed duplicate primary links", () => {
    const conflicting =
      '<a href="https://www.themoviedb.org/movie/693134/" data-track-action="TMDB">TMDB conflict</a>';
    const malformed =
      '<a href="https://example.com/movie/603/" data-track-action="TMDB">TMDB malformed</a>';

    expect(
      detect(baseFixture().replace("</body>", `${conflicting}</body>`)),
    ).toBeNull();
    expect(
      detect(baseFixture().replace("</body>", `${malformed}</body>`)),
    ).toBeNull();
  });

  it("rejects duplicate cast containers", () => {
    const duplicateCast = '<div id="tab-panel-cast"></div>';

    expect(
      detect(baseFixture().replace("</body>", `${duplicateCast}</body>`)),
    ).toBeNull();
  });

  it("does not use page title, year, cast names, or unrelated IDs", () => {
    const decoys = `
      <title>The Matrix (1999)</title>
      <h1>The Matrix</h1>
      <a href="/actor/603/">Actor 603</a>
      <div data-film-id="603">1999</div>
    `;

    expect(detect(baseFixture(undefined, "", decoys))).toBeNull();
  });
});

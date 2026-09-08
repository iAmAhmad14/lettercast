export type DetectedMoviePage = {
  tmdbId: number;
  castContainer: Element;
};

function parsePositiveCanonicalInteger(value: string | null): number | null {
  if (value === null || !/^[1-9]\d*$/u.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function isCanonicalLetterboxdFilmUrl(value: string | URL): boolean {
  try {
    const url = typeof value === "string" ? new URL(value) : value;
    return (
      url.protocol === "https:" &&
      url.hostname === "letterboxd.com" &&
      url.port === "" &&
      /^\/film\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\/$/u.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function parseTmdbMovieLink(anchor: HTMLAnchorElement): number | null {
  try {
    const url = new URL(anchor.href);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "www.themoviedb.org" ||
      url.port !== "" ||
      url.search !== "" ||
      url.hash !== ""
    ) {
      return null;
    }

    const match = /^\/movie\/([1-9]\d*)\/$/u.exec(url.pathname);
    return match === null
      ? null
      : parsePositiveCanonicalInteger(match[1] ?? null);
  } catch {
    return null;
  }
}

function readPrimaryTmdbMovieId(document: Document): number | null {
  const links = [
    ...document.querySelectorAll<HTMLAnchorElement>(
      'a[data-track-action="TMDB"]',
    ),
  ];
  if (links.length === 0) {
    return null;
  }

  const ids = links.map(parseTmdbMovieLink);
  if (ids.some((id) => id === null)) {
    return null;
  }

  const distinctIds = new Set(ids);
  return distinctIds.size === 1 ? (ids[0] ?? null) : null;
}

export function detectLetterboxdMoviePage(
  document: Document,
  pageUrl: string | URL,
): DetectedMoviePage | null {
  if (!isCanonicalLetterboxdFilmUrl(pageUrl)) {
    return null;
  }

  const body = document.body;
  if (body?.dataset.tmdbType !== "movie") {
    return null;
  }

  const bodyId = parsePositiveCanonicalInteger(body.dataset.tmdbId ?? null);
  const linkId = readPrimaryTmdbMovieId(document);
  if (bodyId === null || linkId === null || bodyId !== linkId) {
    return null;
  }

  const castContainers = document.querySelectorAll("#tab-panel-cast");
  if (castContainers.length !== 1) {
    return null;
  }

  const castContainer = castContainers[0];
  return castContainer === undefined ? null : { tmdbId: bodyId, castContainer };
}

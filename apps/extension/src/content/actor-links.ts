import type { CastMember } from "@lettercast/contracts";

const LETTERBOXD_BASE_URL = "https://letterboxd.com/";
const ACTOR_PATH_PATTERN =
  /^\/actor\/(?:[a-z0-9]+(?:-[a-z0-9]+)*|contributor:[1-9]\d*)\/$/u;

export function normalizeActorName(name: string): string {
  return name.normalize("NFC").replace(/\s+/gu, " ").trim().toLowerCase();
}

export function parseLetterboxdActorUrl(href: string): string | null {
  if (href.trim() === "") {
    return null;
  }

  try {
    const url = new URL(href, LETTERBOXD_BASE_URL);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "letterboxd.com" ||
      url.port !== "" ||
      url.username !== "" ||
      url.password !== "" ||
      url.search !== "" ||
      url.hash !== "" ||
      !ACTOR_PATH_PATTERN.test(url.pathname)
    ) {
      return null;
    }

    return `https://letterboxd.com${url.pathname}`;
  } catch {
    return null;
  }
}

export function readNativeActorLinks(
  castContainer: Element,
): ReadonlyMap<string, string> {
  const candidates = new Map<string, string | null>();
  const anchors =
    castContainer.querySelectorAll<HTMLAnchorElement>(".cast-list a[href]");

  for (const anchor of anchors) {
    const rawHref = anchor.getAttribute("href");
    if (rawHref === null) {
      continue;
    }

    const parsedUrl = parseLetterboxdActorUrl(rawHref);
    if (parsedUrl === null) {
      continue;
    }

    const normalizedName = normalizeActorName(anchor.textContent ?? "");
    if (normalizedName === "") {
      continue;
    }

    if (!candidates.has(normalizedName)) {
      candidates.set(normalizedName, parsedUrl);
      continue;
    }

    const existing = candidates.get(normalizedName);
    if (existing !== null && existing !== parsedUrl) {
      candidates.set(normalizedName, null);
    }
  }

  const uniqueLinks = new Map<string, string>();
  for (const [name, url] of candidates) {
    if (url !== null) {
      uniqueLinks.set(name, url);
    }
  }

  return uniqueLinks;
}

export function resolveActorLinks(
  cast: readonly CastMember[],
  nativeLinks: ReadonlyMap<string, string>,
): ReadonlyMap<number, string> {
  const tmdbIdsByName = new Map<string, number | null>();

  for (const member of cast) {
    const normalizedName = normalizeActorName(member.name);
    if (normalizedName === "") {
      continue;
    }

    if (!tmdbIdsByName.has(normalizedName)) {
      tmdbIdsByName.set(normalizedName, member.id);
      continue;
    }

    const existingId = tmdbIdsByName.get(normalizedName);
    if (existingId !== null && existingId !== member.id) {
      tmdbIdsByName.set(normalizedName, null);
    }
  }

  const resolved = new Map<number, string>();
  for (const member of cast) {
    const normalizedName = normalizeActorName(member.name);
    if (normalizedName === "" || tmdbIdsByName.get(normalizedName) === null) {
      continue;
    }

    const url = nativeLinks.get(normalizedName);
    if (url !== undefined) {
      resolved.set(member.id, url);
    }
  }

  return resolved;
}

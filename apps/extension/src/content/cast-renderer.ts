import type { CastMember } from "@lettercast/contracts";
import { parseProfilePath } from "@lettercast/contracts";

import { resolveActorLinks } from "./actor-links";
import tmdbLogoUrl from "./assets/tmdb-short-blue.svg?url";
import "./cast-renderer.css";

export const LETTERCAST_CAST_MARKER = "data-lettercast-cast";
export const MAX_RENDERED_CAST_MEMBERS = 10;

const PROFILE_IMAGE_BASE = "https://image.tmdb.org/t/p/w185/";
const PROFILE_WIDTH = 80;
const PROFILE_HEIGHT = 120;
const TMDB_NOTICE =
  "This product uses the TMDB API but is not endorsed or certified by TMDB.";

type RenderCastOptions = {
  document: Document;
  castContainer: Element;
  cast: readonly CastMember[];
  nativeActorLinks?: ReadonlyMap<string, string>;
};

export function buildTmdbProfileUrl(profilePath: unknown): string | null {
  const parsedPath = parseProfilePath(profilePath);
  return typeof parsedPath === "string"
    ? `${PROFILE_IMAGE_BASE}${parsedPath.slice(1)}`
    : null;
}

function createPlaceholder(document: Document, name: string): HTMLDivElement {
  const placeholder = document.createElement("div");
  placeholder.className = "lettercast-cast__placeholder";
  placeholder.setAttribute("role", "img");
  placeholder.setAttribute(
    "aria-label",
    `No profile image available for ${name}`,
  );

  const monogram = document.createElement("span");
  monogram.setAttribute("aria-hidden", "true");
  monogram.textContent = name.trim().charAt(0).toLocaleUpperCase() || "?";
  placeholder.append(monogram);
  return placeholder;
}

function createPortrait(
  document: Document,
  member: CastMember,
): HTMLDivElement {
  const frame = document.createElement("div");
  frame.className = "lettercast-cast__portrait";

  const placeholder = createPlaceholder(document, member.name);
  const profileUrl = buildTmdbProfileUrl(member.profilePath);

  if (profileUrl === null) {
    frame.append(placeholder);
    return frame;
  }

  placeholder.hidden = true;

  const image = document.createElement("img");
  image.className = "lettercast-cast__image";
  image.src = profileUrl;
  image.alt = member.name;
  image.loading = "lazy";
  image.decoding = "async";
  image.width = PROFILE_WIDTH;
  image.height = PROFILE_HEIGHT;
  image.addEventListener(
    "error",
    () => {
      image.remove();
      placeholder.hidden = false;
    },
    { once: true },
  );

  frame.append(image, placeholder);
  return frame;
}

function createCastCard(
  document: Document,
  member: CastMember,
  actorUrl?: string,
): HTMLElement {
  const card = document.createElement("article");
  card.className = "lettercast-cast__card";

  const container =
    actorUrl === undefined ? card : document.createElement("a");
  if (container instanceof HTMLAnchorElement && actorUrl !== undefined) {
    container.className = "lettercast-cast__link";
    container.href = actorUrl;
    container.target = "_blank";
    container.rel = "noopener noreferrer";
    container.setAttribute(
      "aria-label",
      `${member.name} on Letterboxd (opens in a new tab)`,
    );
    card.append(container);
  }

  container.append(createPortrait(document, member));

  const name = document.createElement("p");
  name.className = "lettercast-cast__name";
  name.textContent = member.name;
  container.append(name);

  if (member.character !== null && member.character !== "") {
    const character = document.createElement("p");
    character.className = "lettercast-cast__character";
    character.textContent = member.character;
    container.append(character);
  }

  return card;
}

function createCredits(document: Document): HTMLElement {
  const credits = document.createElement("footer");
  credits.className = "lettercast-cast__credits";
  credits.setAttribute("aria-label", "Credits");

  const logo = document.createElement("img");
  logo.className = "lettercast-cast__tmdb-logo";
  logo.src = tmdbLogoUrl;
  logo.alt = "TMDB";
  logo.width = 46;
  logo.height = 33;

  const notice = document.createElement("p");
  notice.textContent = TMDB_NOTICE;
  credits.append(logo, notice);
  return credits;
}

function selectCast(cast: readonly CastMember[]): CastMember[] {
  return cast
    .map((member, sourceIndex) => ({ member, sourceIndex }))
    .sort(
      (left, right) =>
        left.member.order - right.member.order ||
        left.sourceIndex - right.sourceIndex,
    )
    .slice(0, MAX_RENDERED_CAST_MEMBERS)
    .map(({ member }) => member);
}

export function renderCastBlock({
  document,
  castContainer,
  cast,
  nativeActorLinks,
}: RenderCastOptions): HTMLElement | null {
  if (
    cast.length === 0 ||
    castContainer.parentElement === null ||
    document.querySelector(`[${LETTERCAST_CAST_MARKER}]`) !== null
  ) {
    return null;
  }

  const selectedCast = selectCast(cast);
  if (selectedCast.length === 0) {
    return null;
  }

  const block = document.createElement("section");
  block.className = "lettercast-cast";
  block.setAttribute(LETTERCAST_CAST_MARKER, "");
  block.setAttribute("aria-labelledby", "lettercast-cast-title");

  const title = document.createElement("h2");
  title.id = "lettercast-cast-title";
  title.className = "lettercast-cast__title";
  title.textContent = "Cast portraits";

  let actorLinks: ReadonlyMap<number, string> = new Map();
  if (nativeActorLinks !== undefined) {
    try {
      actorLinks = resolveActorLinks(selectedCast, nativeActorLinks);
    } catch {
      actorLinks = new Map();
    }
  }

  const grid = document.createElement("div");
  grid.className = "lettercast-cast__grid";
  for (const member of selectedCast) {
    grid.append(createCastCard(document, member, actorLinks.get(member.id)));
  }

  block.append(title, grid, createCredits(document));
  castContainer.append(block);
  return block;
}

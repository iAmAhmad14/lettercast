import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { CastMember } from "@lettercast/contracts";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildTmdbProfileUrl,
  LETTERCAST_CAST_MARKER,
  MAX_RENDERED_CAST_MEMBERS,
  renderCastBlock,
} from "../src/content/cast-renderer";

const completeCast: CastMember[] = [
  {
    id: 2,
    name: "Second Actor",
    character: "Second Role",
    profilePath: "/second.jpg",
    order: 2,
  },
  {
    id: 1,
    name: "First Actor",
    character: "First Role",
    profilePath: "/first.jpg",
    order: 1,
  },
];

function arrange(): Element {
  document.body.innerHTML = '<div id="host"><div id="tab-panel-cast"><a>Native cast</a></div></div>';
  const castContainer = document.querySelector("#tab-panel-cast");
  if (castContainer === null) {
    throw new Error("Fixture is missing its cast container");
  }
  return castContainer;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("renderCastBlock", () => {
  it("renders a complete cast deterministically in TMDB order", () => {
    const castContainer = arrange();
    const block = renderCastBlock({ document, castContainer, cast: completeCast });

    expect(block).not.toBeNull();
    expect(
      [...document.querySelectorAll(".lettercast-cast__name")].map(
        (node) => node.textContent,
      ),
    ).toEqual(["First Actor", "Second Actor"]);
    expect(
      [...document.querySelectorAll(".lettercast-cast__character")].map(
        (node) => node.textContent,
      ),
    ).toEqual(["First Role", "Second Role"]);
    expect(block?.previousElementSibling).toBe(castContainer);
  });

  it("omits absent character text and uses a placeholder for no profile", () => {
    const castContainer = arrange();
    renderCastBlock({
      document,
      castContainer,
      cast: [
        {
          id: 1,
          name: "Partial Actor",
          character: null,
          profilePath: null,
          order: 0,
        },
      ],
    });

    expect(document.querySelector(".lettercast-cast__character")).toBeNull();
    expect(document.querySelector(".lettercast-cast__image")).toBeNull();
    expect(
      document.querySelector(".lettercast-cast__placeholder"),
    ).not.toBeNull();
  });

  it("renders nothing for an empty cast", () => {
    const castContainer = arrange();

    expect(
      renderCastBlock({ document, castContainer, cast: [] }),
    ).toBeNull();
    expect(document.querySelector(`[${LETTERCAST_CAST_MARKER}]`)).toBeNull();
  });

  it("treats hostile actor and character strings as text", () => {
    const castContainer = arrange();
    const hostile = '<img src=x onerror="globalThis.pwned=true">';
    renderCastBlock({
      document,
      castContainer,
      cast: [
        {
          id: 1,
          name: hostile,
          character: "<script>alert(1)</script>",
          profilePath: null,
          order: 0,
        },
      ],
    });

    expect(document.querySelector(".lettercast-cast__name")?.textContent).toBe(
      hostile,
    );
    expect(document.querySelector(".lettercast-cast__character")?.textContent).toBe(
      "<script>alert(1)</script>",
    );
    expect(document.querySelector("script")).toBeNull();
    expect(document.querySelector("img[src='x']")).toBeNull();
  });

  it("constructs only fixed-base URLs from valid relative profile paths", () => {
    expect(buildTmdbProfileUrl("/profile-name.jpg")).toBe(
      "https://image.tmdb.org/t/p/w185/profile-name.jpg",
    );
    expect(buildTmdbProfileUrl("https://attacker.example/image.jpg")).toBeNull();
    expect(buildTmdbProfileUrl("//attacker.example/image.jpg")).toBeNull();
    expect(buildTmdbProfileUrl("/bad/path.jpg")).toBeNull();
    expect(buildTmdbProfileUrl(null)).toBeNull();
  });

  it("uses a placeholder when a profile path is invalid", () => {
    const castContainer = arrange();
    renderCastBlock({
      document,
      castContainer,
      cast: [
        {
          id: 1,
          name: "Invalid Profile",
          character: null,
          profilePath: "https://attacker.example/image.jpg",
          order: 0,
        },
      ],
    });

    expect(document.querySelector(".lettercast-cast__image")).toBeNull();
    expect(
      document.querySelector(".lettercast-cast__placeholder"),
    ).not.toBeNull();
  });

  it("replaces a failed profile image with its local placeholder", () => {
    const castContainer = arrange();
    renderCastBlock({ document, castContainer, cast: [completeCast[0]!] });

    const image = document.querySelector<HTMLImageElement>(
      ".lettercast-cast__image",
    );
    const placeholder = document.querySelector<HTMLElement>(
      ".lettercast-cast__placeholder",
    );
    expect(image).not.toBeNull();
    expect(placeholder?.hidden).toBe(true);

    image?.dispatchEvent(new Event("error"));

    expect(document.querySelector(".lettercast-cast__image")).toBeNull();
    expect(placeholder?.hidden).toBe(false);
  });

  it("is idempotent and caps a stable ordering", () => {
    const castContainer = arrange();
    const cast = Array.from(
      { length: MAX_RENDERED_CAST_MEMBERS + 3 },
      (_, index): CastMember => ({
        id: index + 1,
        name: `Actor ${index}`,
        character: null,
        profilePath: null,
        order: index % 2,
      }),
    );

    const first = renderCastBlock({ document, castContainer, cast });
    const second = renderCastBlock({ document, castContainer, cast });

    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(document.querySelectorAll(`[${LETTERCAST_CAST_MARKER}]`)).toHaveLength(
      1,
    );
    expect(document.querySelectorAll(".lettercast-cast__card")).toHaveLength(
      MAX_RENDERED_CAST_MEMBERS,
    );
    expect(
      [...document.querySelectorAll(".lettercast-cast__name")].map(
        (node) => node.textContent,
      ),
    ).toEqual([
      "Actor 0",
      "Actor 2",
      "Actor 4",
      "Actor 6",
      "Actor 8",
      "Actor 10",
      "Actor 12",
      "Actor 1",
      "Actor 3",
      "Actor 5",
    ]);
  });

  it("does not alter the native cast subtree", () => {
    const castContainer = arrange();
    const originalMarkup = castContainer.outerHTML;

    renderCastBlock({ document, castContainer, cast: completeCast });

    expect(castContainer.outerHTML).toBe(originalMarkup);
    expect(castContainer.querySelector(`[${LETTERCAST_CAST_MARKER}]`)).toBeNull();
  });

  it("includes TMDB credits, lazy images, and reserved geometry", () => {
    const castContainer = arrange();
    renderCastBlock({ document, castContainer, cast: completeCast });

    const image = document.querySelector<HTMLImageElement>(
      ".lettercast-cast__image",
    );
    const credits = document.querySelector(".lettercast-cast__credits");
    const logo = document.querySelector<HTMLImageElement>(
      ".lettercast-cast__tmdb-logo",
    );

    expect(image?.loading).toBe("lazy");
    expect(image?.decoding).toBe("async");
    expect(image?.getAttribute("width")).toBe("80");
    expect(image?.getAttribute("height")).toBe("120");
    expect(credits?.getAttribute("aria-label")).toBe("Credits");
    expect(credits?.textContent).toContain(
      "This product uses the TMDB API but is not endorsed or certified by TMDB.",
    );
    expect(logo?.alt).toBe("TMDB");
    expect(logo?.src).toBeTruthy();
  });

  it("keeps responsive portraits within the verified 92 CSS pixel limit", async () => {
    const stylesheet = await readFile(
      resolve(process.cwd(), "src/content/cast-renderer.css"),
      "utf8",
    );

    expect(stylesheet).toContain("grid-template-columns: repeat(auto-fill");
    expect(stylesheet).toMatch(/\.lettercast-cast__portrait[\s\S]*width: 80px;/u);
    expect(stylesheet).toMatch(/max-width: 100%;/u);
    expect(stylesheet).toMatch(/aspect-ratio: 2 \/ 3;/u);
    expect(stylesheet).toContain("@media (max-width: 360px)");
  });
});

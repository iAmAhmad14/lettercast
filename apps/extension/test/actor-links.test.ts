import type { CastMember } from "@lettercast/contracts";
import { describe, expect, it } from "vitest";

import {
  normalizeActorName,
  parseLetterboxdActorUrl,
  readNativeActorLinks,
  resolveActorLinks,
} from "../src/content/actor-links";
import duneHtml from "./fixtures/dune-part-two.html?raw";
import matrixHtml from "./fixtures/the-matrix.html?raw";
import parasiteHtml from "./fixtures/parasite-2019.html?raw";

function parseCastContainer(html: string): Element {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const container = doc.querySelector("#tab-panel-cast");
  if (container === null) {
    throw new Error("Missing #tab-panel-cast in fixture");
  }
  return container;
}

describe("actor-links resolution", () => {
  describe("normalizeActorName", () => {
    it("normalizes NFC, collapses whitespace, trims, and lowercases", () => {
      const composed = "  L\u00e9a   Seydoux \n\t ";
      const decomposed = "Le\u0301a Seydoux";

      expect(normalizeActorName(composed)).toBe("l\u00e9a seydoux");
      expect(normalizeActorName(decomposed)).toBe("l\u00e9a seydoux");
      expect(normalizeActorName(composed)).toBe(normalizeActorName(decomposed));
    });

    it("does not strip diacritics or punctuation", () => {
      expect(normalizeActorName("Timothée Chalamet")).not.toBe(
        normalizeActorName("Timothee Chalamet"),
      );
      expect(normalizeActorName("Carrie-Anne Moss")).not.toBe(
        normalizeActorName("Carrie Anne Moss"),
      );
    });
  });

  describe("parseLetterboxdActorUrl", () => {
    it.each([
      [
        "/actor/leonardo-dicaprio/",
        "https://letterboxd.com/actor/leonardo-dicaprio/",
      ],
      [
        "https://letterboxd.com/actor/carrie-anne-moss/",
        "https://letterboxd.com/actor/carrie-anne-moss/",
      ],
      [
        "/actor/choi-woo-shik-1/",
        "https://letterboxd.com/actor/choi-woo-shik-1/",
      ],
      [
        "/actor/contributor:17664/",
        "https://letterboxd.com/actor/contributor:17664/",
      ],
    ])("accepts canonical actor href %s", (href, expected) => {
      expect(parseLetterboxdActorUrl(href)).toBe(expected);
    });

    it.each([
      "",
      "   ",
      "/director/christopher-nolan/",
      "/actor/",
      "/actor/leonardo-dicaprio",
      "/actor/Leonardo-DiCaprio/",
      "/actor/-leonardo/",
      "/actor/leonardo-/",
      "/actor/leonardo--dicaprio/",
      "/actor/contributor:0/",
      "/actor/contributor:01/",
      "/actor/contributor:-1/",
      "/actor/leonardo-dicaprio/?page=2",
      "/actor/leonardo-dicaprio/#films",
      "http://letterboxd.com/actor/leonardo-dicaprio/",
      "https://www.letterboxd.com/actor/leonardo-dicaprio/",
      "https://letterboxd.com:8443/actor/leonardo-dicaprio/",
      "https://user:pass@letterboxd.com/actor/leonardo-dicaprio/",
      "https://evil.example/actor/leonardo-dicaprio/",
      "//letterboxd.com.evil.example/actor/leonardo-dicaprio/",
      "javascript:alert(1)",
    ])("rejects invalid or non-actor href %s", (href) => {
      expect(parseLetterboxdActorUrl(href)).toBeNull();
    });
  });

  describe("readNativeActorLinks", () => {
    it("reads visible, overflow, contributor, and numbered actor links from fixtures", () => {
      const duneLinks = readNativeActorLinks(parseCastContainer(duneHtml));
      const matrixLinks = readNativeActorLinks(parseCastContainer(matrixHtml));
      const parasiteLinks = readNativeActorLinks(parseCastContainer(parasiteHtml));

      expect(duneLinks.get("timothée chalamet")).toBe(
        "https://letterboxd.com/actor/timothee-chalamet/",
      );
      expect(duneLinks.get("léa seydoux")).toBe(
        "https://letterboxd.com/actor/lea-seydoux/",
      );
      expect(duneLinks.get("elliot page")).toBe(
        "https://letterboxd.com/actor/contributor:17664/",
      );
      expect(matrixLinks.get("carrie-anne moss")).toBe(
        "https://letterboxd.com/actor/carrie-anne-moss/",
      );
      expect(parasiteLinks.get("choi woo-shik")).toBe(
        "https://letterboxd.com/actor/choi-woo-shik-1/",
      );
    });

    it("drops ambiguous native names that point to distinct actor URLs while keeping identical duplicates", () => {
      const container = parseCastContainer(`
        <div id="tab-panel-cast">
          <div class="cast-list">
            <a href="/actor/same-actor/">Same Actor</a>
            <a href="/actor/same-actor/">Same Actor</a>
            <a href="/actor/john-smith-1/">John Smith</a>
            <a href="/actor/john-smith-2/">John Smith</a>
            <a href="/director/not-an-actor/">Director</a>
            <a href="https://evil.example/actor/bad/">Hostile</a>
          </div>
        </div>
      `);

      const links = readNativeActorLinks(container);

      expect(links.get("same actor")).toBe(
        "https://letterboxd.com/actor/same-actor/",
      );
      expect(links.has("john smith")).toBe(false);
      expect(links.has("director")).toBe(false);
      expect(links.has("hostile")).toBe(false);
    });
  });

  describe("resolveActorLinks", () => {
    it("resolves exact unique matches including decomposed Unicode and overflow anchors", () => {
      const nativeLinks = readNativeActorLinks(parseCastContainer(duneHtml));
      const cast: CastMember[] = [
        {
          id: 1190668,
          name: "Timothe\u0301e Chalamet",
          character: "Paul Atreides",
          profilePath: null,
          order: 0,
        },
        {
          id: 1245,
          name: "Léa Seydoux",
          character: "Lady Margot Fenring",
          profilePath: null,
          order: 1,
        },
        {
          id: 27578,
          name: "Elliot Page",
          character: "Contributor Role",
          profilePath: null,
          order: 2,
        },
        {
          id: 999,
          name: "Unlisted Actor",
          character: "Extra",
          profilePath: null,
          order: 3,
        },
      ];

      const resolved = resolveActorLinks(cast, nativeLinks);

      expect(resolved.get(1190668)).toBe(
        "https://letterboxd.com/actor/timothee-chalamet/",
      );
      expect(resolved.get(1245)).toBe(
        "https://letterboxd.com/actor/lea-seydoux/",
      );
      expect(resolved.get(27578)).toBe(
        "https://letterboxd.com/actor/contributor:17664/",
      );
      expect(resolved.has(999)).toBe(false);
    });

    it("drops duplicate TMDB names with different person IDs but keeps duplicate entries with the same ID", () => {
      const nativeLinks = new Map([
        ["alex taylor", "https://letterboxd.com/actor/alex-taylor/"],
        ["keanu reeves", "https://letterboxd.com/actor/keanu-reeves/"],
      ]);
      const cast: CastMember[] = [
        {
          id: 10,
          name: "Alex Taylor",
          character: "Role A",
          profilePath: null,
          order: 0,
        },
        {
          id: 11,
          name: "Alex Taylor",
          character: "Role B",
          profilePath: null,
          order: 1,
        },
        {
          id: 6384,
          name: "Keanu Reeves",
          character: "Neo",
          profilePath: null,
          order: 2,
        },
        {
          id: 6384,
          name: "Keanu Reeves",
          character: "Thomas A. Anderson",
          profilePath: null,
          order: 3,
        },
      ];

      const resolved = resolveActorLinks(cast, nativeLinks);

      expect(resolved.has(10)).toBe(false);
      expect(resolved.has(11)).toBe(false);
      expect(resolved.get(6384)).toBe(
        "https://letterboxd.com/actor/keanu-reeves/",
      );
    });

    it("does not match partial names or diacritic-stripped names", () => {
      const nativeLinks = readNativeActorLinks(parseCastContainer(duneHtml));
      const cast: CastMember[] = [
        {
          id: 1,
          name: "Timothee Chalamet",
          character: "Paul",
          profilePath: null,
          order: 0,
        },
        {
          id: 2,
          name: "Timothée",
          character: "Paul",
          profilePath: null,
          order: 1,
        },
      ];

      const resolved = resolveActorLinks(cast, nativeLinks);

      expect(resolved.size).toBe(0);
    });
  });
});

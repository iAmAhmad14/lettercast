import type {
  CastMember,
  GetCastRequest,
  GetCastResponse,
} from "@lettercast/contracts";
import { GET_CAST_ERRORS } from "@lettercast/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LETTERCAST_CAST_MARKER } from "../src/content/cast-renderer";
import { createContentLifecycle } from "../src/content/lifecycle";
import matrixHtml from "./fixtures/the-matrix.html?raw";

const pageUrl = "https://letterboxd.com/film/the-matrix/";
const cast: CastMember[] = [
  {
    id: 287,
    name: "Carrie-Anne Moss",
    character: "Trinity",
    profilePath: "/profile.jpg",
    order: 0,
  },
];

function loadPage(html = matrixHtml): void {
  document.open();
  document.write(html);
  document.close();
}

function successfulResponse(): GetCastResponse {
  return { ok: true, cast };
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("content-script lifecycle", () => {
  it("sends only the movie ID contract and renders one Model B block", async () => {
    loadPage();
    const nativeCast = document.querySelector("#tab-panel-cast");
    const originalNativeMarkup = nativeCast?.outerHTML;
    const sendGetCast = vi.fn(
      async (request: GetCastRequest): Promise<GetCastResponse> => {
        void request;
        return successfulResponse();
      },
    );
    const enhancePage = createContentLifecycle({ sendGetCast });

    await enhancePage({ document, pageUrl });

    expect(sendGetCast).toHaveBeenCalledOnce();
    expect(sendGetCast).toHaveBeenCalledWith({ type: "get-cast", tmdbId: 603 });
    expect(Object.keys(sendGetCast.mock.calls[0]![0]).sort()).toEqual([
      "tmdbId",
      "type",
    ]);
    expect(document.querySelectorAll(`[${LETTERCAST_CAST_MARKER}]`)).toHaveLength(
      1,
    );
    expect(document.querySelector(".lettercast-cast__name")?.textContent).toBe(
      "Carrie-Anne Moss",
    );
    expect(nativeCast?.outerHTML).toBe(originalNativeMarkup);
  });

  it.each([
    ["unsupported URL", matrixHtml, "https://letterboxd.com/films/"],
    [
      "missing cast",
      matrixHtml.replace(/<div id="tab-panel-cast">[\s\S]*?<\/div>\s*<\/div>/u, ""),
      pageUrl,
    ],
    [
      "ambiguous identity",
      matrixHtml.replace('data-tmdb-id="603"', 'data-tmdb-id="604"'),
      pageUrl,
    ],
  ])("leaves an %s page unchanged without messaging", async (_name, html, url) => {
    loadPage(html);
    const originalMarkup = document.documentElement.outerHTML;
    const sendGetCast = vi.fn(async () => successfulResponse());
    const enhancePage = createContentLifecycle({ sendGetCast });

    await enhancePage({ document, pageUrl: url });

    expect(sendGetCast).not.toHaveBeenCalled();
    expect(document.documentElement.outerHTML).toBe(originalMarkup);
  });

  it.each(GET_CAST_ERRORS)(
    "leaves the page unchanged for the %s service-worker error",
    async (error) => {
      loadPage();
      const originalMarkup = document.documentElement.outerHTML;
      const enhancePage = createContentLifecycle({
        sendGetCast: async () => ({ ok: false, error }),
      });

      await enhancePage({ document, pageUrl });

      expect(document.documentElement.outerHTML).toBe(originalMarkup);
    },
  );

  it("leaves the page unchanged when runtime messaging rejects", async () => {
    loadPage();
    const originalMarkup = document.documentElement.outerHTML;
    const enhancePage = createContentLifecycle({
      sendGetCast: async () => {
        throw new Error("Extension context invalidated");
      },
    });

    await expect(enhancePage({ document, pageUrl })).resolves.toBeUndefined();
    expect(document.documentElement.outerHTML).toBe(originalMarkup);
  });

  it("renders nothing for a successful empty cast", async () => {
    loadPage();
    const originalMarkup = document.documentElement.outerHTML;
    const enhancePage = createContentLifecycle({
      sendGetCast: async () => ({ ok: true, cast: [] }),
    });

    await enhancePage({ document, pageUrl });

    expect(document.documentElement.outerHTML).toBe(originalMarkup);
  });

  it("allows only one message across concurrent and repeated invocation", async () => {
    loadPage();
    let resolveResponse: ((response: GetCastResponse) => void) | undefined;
    const response = new Promise<GetCastResponse>((resolve) => {
      resolveResponse = resolve;
    });
    const sendGetCast = vi.fn(() => response);
    const enhancePage = createContentLifecycle({ sendGetCast });

    const firstRun = enhancePage({ document, pageUrl });
    await enhancePage({ document, pageUrl });
    resolveResponse?.(successfulResponse());
    await firstRun;
    await enhancePage({ document, pageUrl });

    expect(sendGetCast).toHaveBeenCalledOnce();
    expect(document.querySelectorAll(`[${LETTERCAST_CAST_MARKER}]`)).toHaveLength(
      1,
    );
  });

  it("removes extension-owned output and contains a renderer exception", async () => {
    loadPage();
    const nativeCast = document.querySelector("#tab-panel-cast");
    const originalNativeMarkup = nativeCast?.outerHTML;
    const enhancePage = createContentLifecycle({
      sendGetCast: async () => successfulResponse(),
      renderCast: ({ document }) => {
        const partialBlock = document.createElement("section");
        partialBlock.setAttribute(LETTERCAST_CAST_MARKER, "");
        document.body.append(partialBlock);
        throw new Error("Renderer failed");
      },
    });

    await expect(enhancePage({ document, pageUrl })).resolves.toBeUndefined();

    expect(document.querySelector(`[${LETTERCAST_CAST_MARKER}]`)).toBeNull();
    expect(nativeCast?.outerHTML).toBe(originalNativeMarkup);
  });

  it("uses no content-side request, storage, or observation APIs", async () => {
    loadPage();
    const fetchSpy = vi.fn(() => {
      throw new Error("fetch must not be called");
    });
    const xhrSpy = vi.fn(() => {
      throw new Error("XMLHttpRequest must not be constructed");
    });
    const observerSpy = vi.fn(() => {
      throw new Error("MutationObserver must not be constructed");
    });
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("XMLHttpRequest", xhrSpy);
    vi.stubGlobal("MutationObserver", observerSpy);
    const enhancePage = createContentLifecycle({
      sendGetCast: async () => successfulResponse(),
    });

    await enhancePage({ document, pageUrl });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
    expect(observerSpy).not.toHaveBeenCalled();
    expect(document.querySelector(`[${LETTERCAST_CAST_MARKER}]`)).not.toBeNull();
  });

  it("turns a profile image error into a placeholder without touching native cast", async () => {
    loadPage();
    const nativeCast = document.querySelector("#tab-panel-cast");
    const originalNativeMarkup = nativeCast?.outerHTML;
    const enhancePage = createContentLifecycle({
      sendGetCast: async () => successfulResponse(),
    });
    await enhancePage({ document, pageUrl });

    const image = document.querySelector<HTMLImageElement>(
      ".lettercast-cast__image",
    );
    const placeholder = document.querySelector<HTMLElement>(
      ".lettercast-cast__placeholder",
    );
    image?.dispatchEvent(new Event("error"));

    expect(image?.isConnected).toBe(false);
    expect(placeholder?.hidden).toBe(false);
    expect(nativeCast?.outerHTML).toBe(originalNativeMarkup);
  });
});

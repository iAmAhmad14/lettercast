import type { GetCastRequest, GetCastResponse } from "@lettercast/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LETTERCAST_CAST_MARKER } from "../src/content/cast-renderer";
import { createContentLifecycle } from "../src/content/lifecycle";
import {
  createBackendClient,
  type FetchBackend,
} from "../src/service-worker/backend-client";
import { createGetCastMessageHandler } from "../src/service-worker/message-handler";
import matrixHtml from "./fixtures/the-matrix.html?raw";

const PAGE_URL = "https://letterboxd.com/film/the-matrix/";
const BACKEND_ORIGIN = "https://api.lettercast.example";

function loadPage(html = matrixHtml): void {
  document.open();
  document.write(html);
  document.close();
}

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function runtimeTransport(
  fetchBackend: FetchBackend,
  timeoutMs?: number,
): (request: GetCastRequest) => Promise<GetCastResponse> {
  const client = createBackendClient({
    backendOrigin: BACKEND_ORIGIN,
    fetch: fetchBackend,
    timeoutMs,
  });
  const handleMessage = createGetCastMessageHandler(client);

  return async (request) => {
    const response = handleMessage(request);
    if (response === undefined) {
      throw new Error("Runtime message was rejected");
    }
    return response;
  };
}

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("content-to-service-worker integration", () => {
  it("passes only the verified movie ID through one message and backend request", async () => {
    loadPage();
    const nativeCast = document.querySelector("#tab-panel-cast");
    const originalNativeMarkup = nativeCast?.outerHTML;
    const fetchBackend = vi.fn<FetchBackend>(async () =>
      jsonResponse({
        cast: [
          {
            id: 287,
            name: "Carrie-Anne Moss",
            character: "Trinity",
            profilePath: "/profile.jpg",
            order: 0,
          },
        ],
      }),
    );
    const sendMessage = vi.fn(runtimeTransport(fetchBackend));
    const enhancePage = createContentLifecycle({ sendGetCast: sendMessage });

    await enhancePage({ document, pageUrl: PAGE_URL });
    await enhancePage({ document, pageUrl: PAGE_URL });

    expect(sendMessage).toHaveBeenCalledOnce();
    expect(sendMessage).toHaveBeenCalledWith({ type: "get-cast", tmdbId: 603 });
    expect(Object.keys(sendMessage.mock.calls[0]![0]).sort()).toEqual([
      "tmdbId",
      "type",
    ]);
    expect(fetchBackend).toHaveBeenCalledOnce();
    expect(fetchBackend.mock.calls[0]![0]).toBe(
      `${BACKEND_ORIGIN}/v1/movie/603/cast`,
    );
    expect(new URL(fetchBackend.mock.calls[0]![0]).pathname).toBe(
      "/v1/movie/603/cast",
    );
    expect(new URL(fetchBackend.mock.calls[0]![0]).search).toBe("");
    expect(document.querySelector(".lettercast-cast__name")?.textContent).toBe(
      "Carrie-Anne Moss",
    );
    expect(nativeCast?.outerHTML).toBe(originalNativeMarkup);
    expect(document.querySelectorAll(`[${LETTERCAST_CAST_MARKER}]`)).toHaveLength(
      1,
    );
  });

  it("fails closed when the Worker success payload is malformed", async () => {
    loadPage();
    const originalMarkup = document.documentElement.outerHTML;
    const enhancePage = createContentLifecycle({
      sendGetCast: runtimeTransport(async () =>
        jsonResponse({ cast: [{ id: "untrusted" }] }),
      ),
    });

    await enhancePage({ document, pageUrl: PAGE_URL });

    expect(document.documentElement.outerHTML).toBe(originalMarkup);
  });

  it("fails closed when the backend request times out", async () => {
    vi.useFakeTimers();
    loadPage();
    const originalMarkup = document.documentElement.outerHTML;
    const fetchBackend = vi.fn<FetchBackend>((_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      }),
    );
    const enhancePage = createContentLifecycle({
      sendGetCast: runtimeTransport(fetchBackend, 25),
    });

    const result = enhancePage({ document, pageUrl: PAGE_URL });
    await vi.advanceTimersByTimeAsync(25);
    await result;

    expect(fetchBackend).toHaveBeenCalledOnce();
    expect(document.documentElement.outerHTML).toBe(originalMarkup);
  });

  it("does not message or mutate an unsupported TV page", async () => {
    loadPage(
      matrixHtml
        .replace('data-tmdb-type="movie"', 'data-tmdb-type="tv"')
        .replace("/movie/603/", "/tv/603/"),
    );
    const originalMarkup = document.documentElement.outerHTML;
    const fetchBackend = vi.fn<FetchBackend>();
    const sendMessage = vi.fn(runtimeTransport(fetchBackend));
    const enhancePage = createContentLifecycle({ sendGetCast: sendMessage });

    await enhancePage({ document, pageUrl: PAGE_URL });

    expect(sendMessage).not.toHaveBeenCalled();
    expect(fetchBackend).not.toHaveBeenCalled();
    expect(document.documentElement.outerHTML).toBe(originalMarkup);
  });

  it("has identical results after service-worker re-instantiation", async () => {
    const payload = {
      cast: [
        {
          id: 287,
          name: "Carrie-Anne Moss",
          character: "Trinity",
          profilePath: null,
          order: 0,
        },
      ],
    };
    const fetchBackend = vi.fn<FetchBackend>(async () => jsonResponse(payload));

    loadPage();
    const firstLifecycle = createContentLifecycle({
      sendGetCast: runtimeTransport(fetchBackend),
    });
    await firstLifecycle({ document, pageUrl: PAGE_URL });
    const firstName = document.querySelector(".lettercast-cast__name")?.textContent;

    loadPage();
    const coldLifecycle = createContentLifecycle({
      sendGetCast: runtimeTransport(fetchBackend),
    });
    await coldLifecycle({ document, pageUrl: PAGE_URL });

    expect(firstName).toBe("Carrie-Anne Moss");
    expect(document.querySelector(".lettercast-cast__name")?.textContent).toBe(
      firstName,
    );
    expect(fetchBackend).toHaveBeenCalledTimes(2);
  });
});

import { describe, expect, it, vi } from "vitest";

import { createTmdbCastProvider } from "../src/tmdb-client";
import { mapTmdbError, TmdbError } from "../src/tmdb-errors";

const TOKEN = "test-token-not-a-real-secret";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function successfulFetch(payload: unknown): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>(async () => jsonResponse(payload));
}

describe("TMDB credits client", () => {
  it("calls only the fixed movie credits endpoint with Bearer authorization", async () => {
    const fetchMock = successfulFetch({
      id: 603,
      cast: [
        {
          id: 2,
          name: "Second",
          character: "Role 2",
          profile_path: "/second.jpg",
          order: 2,
          popularity: 999,
          known_for_department: "Acting",
        },
        {
          id: 1,
          name: "First",
          character: "Role 1",
          profile_path: "/first.jpg",
          order: 1,
          adult: false,
        },
      ],
      crew: [{ id: 100, name: "Not returned" }],
    });
    const getCast = createTmdbCastProvider({ fetch: fetchMock });

    await expect(getCast(603, TOKEN)).resolves.toEqual({
      cast: [
        {
          id: 1,
          name: "First",
          character: "Role 1",
          profilePath: "/first.jpg",
          order: 1,
        },
        {
          id: 2,
          name: "Second",
          character: "Role 2",
          profilePath: "/second.jpg",
          order: 2,
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, init] = call!;
    expect(url).toBe("https://api.themoviedb.org/3/movie/603/credits");
    expect(init?.method).toBe("GET");
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(new Headers(init?.headers).get("Accept")).toBe("application/json");
    expect(init?.redirect).toBe("error");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("accepts an empty cast", async () => {
    const getCast = createTmdbCastProvider({
      fetch: successfulFetch({ id: 603, cast: [] }),
    });

    await expect(getCast(603, TOKEN)).resolves.toEqual({ cast: [] });
  });

  it("normalizes null, empty, and missing optional values", async () => {
    const getCast = createTmdbCastProvider({
      fetch: successfulFetch({
        cast: [
          { id: 1, name: "One", character: null, profile_path: null, order: 0 },
          { id: 2, name: "Two", character: "", profile_path: "", order: 1 },
          { id: 3, name: "Three", order: 2 },
          {
            id: 4,
            name: "Four",
            character: "   ",
            profile_path: "   ",
            order: 3,
          },
        ],
      }),
    });

    const response = await getCast(603, TOKEN);
    expect(response.cast).toHaveLength(4);
    for (const member of response.cast) {
      expect(member.character).toBeNull();
      expect(member.profilePath).toBeNull();
    }
  });

  it("sorts by TMDB order and preserves source order for ties", async () => {
    const getCast = createTmdbCastProvider({
      fetch: successfulFetch({
        cast: [
          { id: 3, name: "Third", order: 2 },
          { id: 1, name: "First tie", order: 1 },
          { id: 2, name: "Second tie", order: 1 },
        ],
      }),
    });

    const response = await getCast(603, TOKEN);
    expect(response.cast.map(({ id }) => id)).toEqual([1, 2, 3]);
  });

  it("rejects malformed JSON without trusting partial data", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response("not-json", { status: 200 }),
    );
    const getCast = createTmdbCastProvider({ fetch: fetchMock });

    await expect(getCast(603, TOKEN)).rejects.toMatchObject({
      kind: "INVALID_RESPONSE",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([
    {},
    { cast: null },
    { cast: [{ id: 1, name: "Actor", order: "0" }] },
    { cast: [{ id: 0, name: "Actor", order: 0 }] },
    { cast: [{ id: 1, name: "", order: 0 }] },
    { cast: [{ id: 1, name: "Actor", character: 7, order: 0 }] },
    { cast: [{ id: 1, name: "Actor", profile_path: "https://example.com/a.jpg", order: 0 }] },
    { cast: [{ id: 1, name: "Actor", order: -1 }] },
    {
      cast: [
        { id: 1, name: "Valid", order: 0 },
        { id: "2", name: "Invalid", order: 1 },
      ],
    },
  ])("rejects malformed schema %#", async (payload) => {
    const fetchMock = successfulFetch(payload);
    const getCast = createTmdbCastProvider({ fetch: fetchMock });

    await expect(getCast(603, TOKEN)).rejects.toMatchObject({
      kind: "INVALID_RESPONSE",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([
    [401, "AUTHENTICATION", "BACKEND_UNAVAILABLE", 503],
    [404, "NOT_FOUND", "INVALID_ID", 404],
    [429, "RATE_LIMITED", "RATE_LIMITED", 429],
    [500, "UPSTREAM_UNAVAILABLE", "BACKEND_UNAVAILABLE", 502],
    [503, "UPSTREAM_UNAVAILABLE", "BACKEND_UNAVAILABLE", 502],
  ] as const)(
    "maps TMDB status %i to a bounded failure",
    async (status, kind, publicError, publicStatus) => {
      const fetchMock = vi.fn<typeof fetch>(async () =>
        jsonResponse({ status_message: "must not leak" }, status),
      );
      const getCast = createTmdbCastProvider({ fetch: fetchMock });

      let caught: unknown;
      try {
        await getCast(603, TOKEN);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(TmdbError);
      expect(caught).toMatchObject({ kind });
      expect(mapTmdbError(caught)).toEqual({
        error: publicError,
        status: publicStatus,
      });
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );

  it("aborts at the bounded timeout and does not retry", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new Error("aborted")),
            { once: true },
          );
        }),
    );
    const getCast = createTmdbCastProvider({ fetch: fetchMock, timeoutMs: 1 });

    let caught: unknown;
    try {
      await getCast(603, TOKEN);
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({ kind: "TIMEOUT" });
    expect(mapTmdbError(caught)).toEqual({ error: "TIMEOUT", status: 504 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("fails without a request when the Worker secret is unavailable", async () => {
    const fetchMock = successfulFetch({ cast: [] });
    const getCast = createTmdbCastProvider({ fetch: fetchMock });

    await expect(getCast(603, undefined)).rejects.toMatchObject({
      kind: "CONFIGURATION",
    });
    await expect(getCast(603, "   ")).rejects.toMatchObject({
      kind: "CONFIGURATION",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

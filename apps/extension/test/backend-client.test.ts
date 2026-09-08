import type { CastResponse, GetCastError } from "@lettercast/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createBackendClient,
  type FetchBackend,
} from "../src/service-worker/backend-client";

const BACKEND_ORIGIN = "https://api.lettercast.example";
const cast: CastResponse = {
  cast: [
    {
      id: 1,
      name: "Actor",
      character: "Character",
      profilePath: "/profile.jpg",
      order: 0,
    },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("service-worker backend client", () => {
  it("requests only the fixed cast URL with the movie ID", async () => {
    const fetchBackend = vi.fn<FetchBackend>(async () => jsonResponse(cast));
    const client = createBackendClient({
      backendOrigin: BACKEND_ORIGIN,
      fetch: fetchBackend,
    });

    await expect(client.getCast(693134)).resolves.toEqual({
      ok: true,
      cast: cast.cast,
    });
    expect(fetchBackend).toHaveBeenCalledOnce();
    expect(fetchBackend).toHaveBeenCalledWith(
      "https://api.lettercast.example/v1/movie/693134/cast",
      expect.objectContaining({
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "omit",
        redirect: "error",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it.each([
    [400, "INVALID_ID"],
    [403, "UNKNOWN"],
    [404, "INVALID_ID"],
    [429, "RATE_LIMITED"],
    [502, "BACKEND_UNAVAILABLE"],
    [503, "BACKEND_UNAVAILABLE"],
    [504, "TIMEOUT"],
  ] as const)("maps backend status %s to %s", async (status, error) => {
    const client = createBackendClient({
      backendOrigin: BACKEND_ORIGIN,
      fetch: async () => jsonResponse({ error }, status),
    });

    await expect(client.getCast(603)).resolves.toEqual({ ok: false, error });
  });

  it.each([
    ["malformed success", jsonResponse({ cast: [{ id: "bad" }] })],
    ["non-JSON", new Response("not json", { status: 200 })],
    [
      "wrong content type",
      new Response(JSON.stringify(cast), {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      }),
    ],
    [
      "status/body mismatch",
      jsonResponse({ error: "BACKEND_UNAVAILABLE" }, 429),
    ],
    ["unknown status", jsonResponse({ error: "UNKNOWN" }, 418)],
  ])("rejects an invalid backend response: %s", async (_case, response) => {
    const client = createBackendClient({
      backendOrigin: BACKEND_ORIGIN,
      fetch: async () => response,
    });

    await expect(client.getCast(603)).resolves.toEqual({
      ok: false,
      error: "UNKNOWN",
    });
  });

  it.each([undefined, "http://api.lettercast.example", "https://api.lettercast.example/proxy"])(
    "fails closed without fetching for invalid origin %s",
    async (backendOrigin) => {
      const fetchBackend = vi.fn<FetchBackend>();
      const client = createBackendClient({ backendOrigin, fetch: fetchBackend });

      await expect(client.getCast(603)).resolves.toEqual({
        ok: false,
        error: "BACKEND_UNAVAILABLE",
      });
      expect(fetchBackend).not.toHaveBeenCalled();
    },
  );

  it("maps a transport failure to backend unavailability", async () => {
    const client = createBackendClient({
      backendOrigin: BACKEND_ORIGIN,
      fetch: () => Promise.reject(new TypeError("network detail")),
    });

    await expect(client.getCast(603)).resolves.toEqual({
      ok: false,
      error: "BACKEND_UNAVAILABLE",
    });
  });

  it("aborts a bounded request and maps it to timeout", async () => {
    vi.useFakeTimers();
    const fetchBackend = vi.fn<FetchBackend>((_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      }),
    );
    const client = createBackendClient({
      backendOrigin: BACKEND_ORIGIN,
      fetch: fetchBackend,
      timeoutMs: 25,
    });

    const result = client.getCast(603);
    await vi.advanceTimersByTimeAsync(25);

    await expect(result).resolves.toEqual({ ok: false, error: "TIMEOUT" });
  });

  it("keeps the timeout active while reading the response body", async () => {
    vi.useFakeTimers();
    const fetchBackend = vi.fn<FetchBackend>(async (_url, init) => {
      const body = new ReadableStream({
        start(controller) {
          init.signal?.addEventListener("abort", () => {
            controller.error(new DOMException("aborted", "AbortError"));
          });
        },
      });
      return new Response(body, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const client = createBackendClient({
      backendOrigin: BACKEND_ORIGIN,
      fetch: fetchBackend,
      timeoutMs: 25,
    });

    const result = client.getCast(603);
    await vi.advanceTimersByTimeAsync(25);

    await expect(result).resolves.toEqual({ ok: false, error: "TIMEOUT" });
  });

  it("rejects unrecognized error vocabulary even on a known status", async () => {
    const client = createBackendClient({
      backendOrigin: BACKEND_ORIGIN,
      fetch: async () =>
        jsonResponse({ error: "SECRET_INTERNAL_ERROR" }, 503),
    });

    const expected: { ok: false; error: GetCastError } = {
      ok: false,
      error: "UNKNOWN",
    };
    await expect(client.getCast(603)).resolves.toEqual(expected);
  });
});

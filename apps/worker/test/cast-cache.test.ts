import type { CastResponse } from "@lettercast/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  createCastCacheKey,
  type EdgeCache,
  NOT_FOUND_CACHE_TTL_SECONDS,
  POSITIVE_CACHE_TTL_SECONDS,
  readCastCache,
} from "../src/cast-cache";
import {
  createWorker,
  type WorkerDependencies,
  type WorkerEnvironment,
} from "../src/index";
import { TmdbError, type TmdbErrorKind } from "../src/tmdb-errors";

const ALLOWED_ORIGIN = `chrome-extension://${"a".repeat(32)}`;
const environment: WorkerEnvironment = {
  ALLOWED_EXTENSION_ORIGIN: ALLOWED_ORIGIN,
  TMDB_API_TOKEN: "test-token-not-a-real-secret",
};
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

function request(tmdbId = 603): Request {
  return new Request(
    `https://api.lettercast.test/v1/movie/${tmdbId}/cast`,
    { headers: { Origin: ALLOWED_ORIGIN } },
  );
}

function cacheKey(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

function memoryCache(): EdgeCache & {
  match: ReturnType<typeof vi.fn<Cache["match"]>>;
  put: ReturnType<typeof vi.fn<Cache["put"]>>;
} {
  const entries = new Map<string, Response>();
  const match = vi.fn<Cache["match"]>(async (key) =>
    entries.get(cacheKey(key))?.clone(),
  );
  const put = vi.fn<Cache["put"]>(async (key, response) => {
    entries.set(cacheKey(key), response.clone());
  });
  return { match, put };
}

function successfulProvider(): ReturnType<
  typeof vi.fn<WorkerDependencies["getCast"]>
> {
  return vi.fn<WorkerDependencies["getCast"]>(async () => cast);
}

describe("cast cache", () => {
  it("creates a canonical header-free GET key from the fixed route and ID", () => {
    const inbound = new Request(
      "https://api.lettercast.test/untrusted/path?url=https://example.com#part",
      { headers: { Origin: ALLOWED_ORIGIN, "X-Untrusted": "value" } },
    );

    const key = createCastCacheKey(inbound, 693134);

    expect(key.url).toBe(
      "https://api.lettercast.test/v1/movie/693134/cast",
    );
    expect(key.method).toBe("GET");
    expect([...key.headers]).toEqual([]);
  });

  it("caches a normalized success and bypasses downstream on the hit", async () => {
    const cache = memoryCache();
    const getCast = successfulProvider();
    const worker = createWorker({ cache, getCast });

    const first = await worker.fetch(request(), environment);
    const second = await worker.fetch(request(), environment);

    await expect(first.json()).resolves.toEqual(cast);
    await expect(second.json()).resolves.toEqual(cast);
    expect(getCast).toHaveBeenCalledOnce();
    expect(cache.match).toHaveBeenCalledTimes(2);
    expect(cache.put).toHaveBeenCalledOnce();

    const storedResponse = cache.put.mock.calls[0]?.[1];
    expect(storedResponse?.status).toBe(200);
    expect(storedResponse?.headers.get("Cache-Control")).toBe(
      `public, max-age=${POSITIVE_CACHE_TTL_SECONDS}`,
    );
  });

  it("caches not-found briefly and bypasses downstream on the negative hit", async () => {
    const cache = memoryCache();
    const getCast = vi.fn<WorkerDependencies["getCast"]>(() =>
      Promise.reject(new TmdbError("NOT_FOUND")),
    );
    const worker = createWorker({ cache, getCast });

    const first = await worker.fetch(request(), environment);
    const second = await worker.fetch(request(), environment);

    expect(first.status).toBe(404);
    expect(second.status).toBe(404);
    await expect(first.json()).resolves.toEqual({ error: "INVALID_ID" });
    await expect(second.json()).resolves.toEqual({ error: "INVALID_ID" });
    expect(getCast).toHaveBeenCalledOnce();
    expect(cache.put).toHaveBeenCalledOnce();

    const storedResponse = cache.put.mock.calls[0]?.[1];
    expect(storedResponse?.status).toBe(404);
    expect(storedResponse?.headers.get("Cache-Control")).toBe(
      `public, max-age=${NOT_FOUND_CACHE_TTL_SECONDS}`,
    );
  });

  it.each([
    "AUTHENTICATION",
    "CONFIGURATION",
    "INVALID_RESPONSE",
    "RATE_LIMITED",
    "TIMEOUT",
    "UPSTREAM_UNAVAILABLE",
  ] as const)("does not cache %s failures", async (kind: TmdbErrorKind) => {
    const cache = memoryCache();
    const getCast = vi.fn<WorkerDependencies["getCast"]>(() =>
      Promise.reject(new TmdbError(kind)),
    );
    const worker = createWorker({ cache, getCast });

    await worker.fetch(request(), environment);

    expect(getCast).toHaveBeenCalledOnce();
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("treats cache read failure as a miss", async () => {
    const cache: EdgeCache = {
      match: vi.fn<Cache["match"]>(() =>
        Promise.reject(new Error("cache unavailable")),
      ),
      put: vi.fn<Cache["put"]>(async () => undefined),
    };
    const getCast = successfulProvider();
    const worker = createWorker({ cache, getCast });

    const response = await worker.fetch(request(), environment);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(cast);
    expect(getCast).toHaveBeenCalledOnce();
  });

  it("returns correct data when a cache write fails", async () => {
    const cache: EdgeCache = {
      match: vi.fn<Cache["match"]>(async () => undefined),
      put: vi.fn<Cache["put"]>(() =>
        Promise.reject(new Error("cache unavailable")),
      ),
    };
    const getCast = successfulProvider();
    const worker = createWorker({ cache, getCast });

    const first = await worker.fetch(request(), environment);
    const second = await worker.fetch(request(), environment);

    await expect(first.json()).resolves.toEqual(cast);
    await expect(second.json()).resolves.toEqual(cast);
    expect(getCast).toHaveBeenCalledTimes(2);
  });

  it("treats malformed cached payloads as misses", async () => {
    const cache: EdgeCache = {
      match: vi.fn<Cache["match"]>(async () =>
        Response.json({ cast: [{ id: "not-valid" }] }),
      ),
      put: vi.fn<Cache["put"]>(async () => undefined),
    };
    const getCast = successfulProvider();
    const worker = createWorker({ cache, getCast });

    const response = await worker.fetch(request(), environment);

    await expect(response.json()).resolves.toEqual(cast);
    expect(getCast).toHaveBeenCalledOnce();
    expect(cache.put).toHaveBeenCalledOnce();
  });

  it("remains correct when concurrent misses duplicate downstream work", async () => {
    const cache: EdgeCache = {
      match: vi.fn<Cache["match"]>(async () => undefined),
      put: vi.fn<Cache["put"]>(async () => undefined),
    };
    const getCast = successfulProvider();
    const worker = createWorker({ cache, getCast });

    const [first, second] = await Promise.all([
      worker.fetch(request(), environment),
      worker.fetch(request(), environment),
    ]);

    await expect(first.json()).resolves.toEqual(cast);
    await expect(second.json()).resolves.toEqual(cast);
    expect(getCast).toHaveBeenCalledTimes(2);
    expect(cache.put).toHaveBeenCalledTimes(2);
  });

  it("uses the native default Cache API for normalized values", async () => {
    const key = new Request(
      "https://api.lettercast.test/v1/movie/999999991/cast",
    );
    await caches.default.delete(key);

    await caches.default.put(
      key,
      Response.json(cast, {
        headers: { "Cache-Control": "public, max-age=60" },
      }),
    );

    await expect(readCastCache(caches.default, key)).resolves.toEqual({
      kind: "hit",
      value: cast,
    });
    await caches.default.delete(key);
  });
});

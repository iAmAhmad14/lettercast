import type { CastResponse } from "@lettercast/contracts";
import { describe, expect, it, vi } from "vitest";

import type { EdgeCache } from "../src/cast-cache";
import { createWorker, type WorkerEnvironment } from "../src/index";
import {
  createNativeCastRateLimiter,
  type RateLimitBinding,
} from "../src/rate-limiter";
import { createTmdbCastProvider } from "../src/tmdb-client";

const ALLOWED_ORIGIN = `chrome-extension://${"a".repeat(32)}`;
const TMDB_ID = 603;
const TEST_TOKEN = "integration-fixture-token";

function request(): Request {
  return new Request(
    `https://api.lettercast.test/v1/movie/${TMDB_ID}/cast`,
    { headers: { Origin: ALLOWED_ORIGIN } },
  );
}

function cacheKey(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  return input instanceof URL ? input.toString() : input.url;
}

function memoryCache(calls: string[]): EdgeCache {
  const entries = new Map<string, Response>();
  return {
    match: vi.fn(async (key) => {
      calls.push("cache:match");
      return entries.get(cacheKey(key))?.clone();
    }),
    put: vi.fn(async (key, response) => {
      calls.push("cache:put");
      entries.set(cacheKey(key), response.clone());
    }),
  };
}

function limiter(
  calls: string[],
  success = true,
): RateLimitBinding & { limit: ReturnType<typeof vi.fn<RateLimitBinding["limit"]>> } {
  return {
    limit: vi.fn<RateLimitBinding["limit"]>(async ({ key }) => {
      calls.push(`limit:${key}`);
      return { success };
    }),
  };
}

function environment(binding: RateLimitBinding): WorkerEnvironment {
  return {
    ALLOWED_EXTENSION_ORIGIN: ALLOWED_ORIGIN,
    CAST_RATE_LIMITER: binding,
    TMDB_API_TOKEN: TEST_TOKEN,
  };
}

function tmdbResponse(calls: string[]): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>(async (input, init) => {
    calls.push("tmdb");
    expect(input).toBe(`https://api.themoviedb.org/3/movie/${TMDB_ID}/credits`);
    expect(init).toEqual(
      expect.objectContaining({
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${TEST_TOKEN}`,
        },
        redirect: "error",
      }),
    );
    return Response.json({
      cast: [
        {
          id: 287,
          name: "Carrie-Anne Moss",
          character: "Trinity",
          profile_path: "/profile.jpg",
          order: 0,
          unapproved_field: "discarded",
        },
      ],
      crew: [{ private: "discarded" }],
    });
  });
}

function createPipeline(
  calls: string[],
  binding: RateLimitBinding,
  fetchTmdb: typeof fetch,
) {
  const getCast = createTmdbCastProvider({ fetch: fetchTmdb });
  return createWorker({
    cache: memoryCache(calls),
    rateLimiter: createNativeCastRateLimiter(),
    getCast(tmdbId, env) {
      return getCast(tmdbId, env.TMDB_API_TOKEN);
    },
  });
}

describe("Worker cast pipeline integration", () => {
  it("normalizes a TMDB response and caches it before later limiter/upstream work", async () => {
    const calls: string[] = [];
    const rateLimitBinding = limiter(calls);
    const fetchTmdb = tmdbResponse(calls);
    const worker = createPipeline(calls, rateLimitBinding, fetchTmdb);

    const first = await worker.fetch(request(), environment(rateLimitBinding));
    const second = await worker.fetch(request(), environment(rateLimitBinding));

    const expected: CastResponse = {
      cast: [
        {
          id: 287,
          name: "Carrie-Anne Moss",
          character: "Trinity",
          profilePath: "/profile.jpg",
          order: 0,
        },
      ],
    };
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    await expect(first.json()).resolves.toEqual(expected);
    await expect(second.json()).resolves.toEqual(expected);
    expect(calls).toEqual([
      "cache:match",
      `limit:get-cast:${TMDB_ID}`,
      "tmdb",
      "cache:put",
      "cache:match",
    ]);
    expect(rateLimitBinding.limit).toHaveBeenCalledOnce();
    expect(fetchTmdb).toHaveBeenCalledOnce();
  });

  it("negative-caches TMDB not-found responses before the limiter and TMDB", async () => {
    const calls: string[] = [];
    const rateLimitBinding = limiter(calls);
    const fetchTmdb = vi.fn<typeof fetch>(async () => {
      calls.push("tmdb");
      return Response.json({}, { status: 404 });
    });
    const worker = createPipeline(calls, rateLimitBinding, fetchTmdb);

    const first = await worker.fetch(request(), environment(rateLimitBinding));
    const second = await worker.fetch(request(), environment(rateLimitBinding));

    expect(first.status).toBe(404);
    expect(second.status).toBe(404);
    await expect(first.json()).resolves.toEqual({ error: "INVALID_ID" });
    await expect(second.json()).resolves.toEqual({ error: "INVALID_ID" });
    expect(calls).toEqual([
      "cache:match",
      `limit:get-cast:${TMDB_ID}`,
      "tmdb",
      "cache:put",
      "cache:match",
    ]);
    expect(fetchTmdb).toHaveBeenCalledOnce();
  });

  it("stops a cache miss at limiter denial without contacting TMDB", async () => {
    const calls: string[] = [];
    const rateLimitBinding = limiter(calls, false);
    const fetchTmdb = tmdbResponse(calls);
    const worker = createPipeline(calls, rateLimitBinding, fetchTmdb);

    const response = await worker.fetch(request(), environment(rateLimitBinding));

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({ error: "RATE_LIMITED" });
    expect(calls).toEqual([
      "cache:match",
      `limit:get-cast:${TMDB_ID}`,
    ]);
    expect(fetchTmdb).not.toHaveBeenCalled();
  });

  it("rejects a malformed TMDB payload without caching partial data", async () => {
    const calls: string[] = [];
    const rateLimitBinding = limiter(calls);
    const fetchTmdb = vi.fn<typeof fetch>(async () => {
      calls.push("tmdb");
      return Response.json({
        cast: [{ id: "287", name: "Untrusted", order: 0 }],
      });
    });
    const worker = createPipeline(calls, rateLimitBinding, fetchTmdb);

    const response = await worker.fetch(request(), environment(rateLimitBinding));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "BACKEND_UNAVAILABLE",
    });
    expect(calls).toEqual([
      "cache:match",
      `limit:get-cast:${TMDB_ID}`,
      "tmdb",
    ]);
  });
});

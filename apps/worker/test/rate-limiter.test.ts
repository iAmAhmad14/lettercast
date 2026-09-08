import type { CastResponse } from "@lettercast/contracts";
import { describe, expect, it, vi } from "vitest";

import type { EdgeCache } from "../src/cast-cache";
import {
  createWorker,
  type WorkerDependencies,
  type WorkerEnvironment,
} from "../src/index";
import {
  createCastRateLimitKey,
  createNativeCastRateLimiter,
  type RateLimitBinding,
} from "../src/rate-limiter";

const ALLOWED_ORIGIN = `chrome-extension://${"a".repeat(32)}`;
const cast: CastResponse = { cast: [] };

function request(tmdbId = 603): Request {
  return new Request(
    `https://api.lettercast.test/v1/movie/${tmdbId}/cast`,
    { headers: { Origin: ALLOWED_ORIGIN } },
  );
}

function environment(binding?: RateLimitBinding): WorkerEnvironment {
  return {
    ALLOWED_EXTENSION_ORIGIN: ALLOWED_ORIGIN,
    CAST_RATE_LIMITER: binding,
  };
}

function cacheMiss(): EdgeCache {
  return {
    match: vi.fn(async () => undefined),
    put: vi.fn(async () => undefined),
  };
}

function provider(): ReturnType<
  typeof vi.fn<WorkerDependencies["getCast"]>
> {
  return vi.fn<WorkerDependencies["getCast"]>(async () => cast);
}

describe("resource-scoped native rate limiting", () => {
  it("builds only the approved key from the validated movie ID", () => {
    expect(createCastRateLimitKey(693134)).toBe("get-cast:693134");
  });

  it("uses separate keys for separate movie resources", async () => {
    const limit = vi.fn<RateLimitBinding["limit"]>(async () => ({
      success: true,
    }));
    const limiter = createNativeCastRateLimiter();
    const env = environment({ limit });

    await limiter.check(603, env);
    await limiter.check(693134, env);

    expect(limit.mock.calls).toEqual([
      [{ key: "get-cast:603" }],
      [{ key: "get-cast:693134" }],
    ]);
  });

  it("checks cache before the limiter and TMDB provider", async () => {
    const calls: string[] = [];
    const cache: EdgeCache = {
      match: vi.fn(async () => {
        calls.push("cache");
        return Response.json(cast);
      }),
      put: vi.fn(async () => undefined),
    };
    const limit = vi.fn<RateLimitBinding["limit"]>(async () => {
      calls.push("limit");
      return { success: true };
    });
    const getCast = vi.fn<WorkerDependencies["getCast"]>(async () => {
      calls.push("tmdb");
      return cast;
    });
    const worker = createWorker({
      cache,
      rateLimiter: createNativeCastRateLimiter(),
      getCast,
    });

    const response = await worker.fetch(request(), environment({ limit }));

    expect(response.status).toBe(200);
    expect(calls).toEqual(["cache"]);
    expect(limit).not.toHaveBeenCalled();
    expect(getCast).not.toHaveBeenCalled();
  });

  it("limits a cache miss before calling the TMDB provider", async () => {
    const calls: string[] = [];
    const cache: EdgeCache = {
      match: vi.fn(async () => {
        calls.push("cache");
        return undefined;
      }),
      put: vi.fn(async () => undefined),
    };
    const limit = vi.fn<RateLimitBinding["limit"]>(async () => {
      calls.push("limit");
      return { success: true };
    });
    const getCast = vi.fn<WorkerDependencies["getCast"]>(async () => {
      calls.push("tmdb");
      return cast;
    });
    const worker = createWorker({
      cache,
      rateLimiter: createNativeCastRateLimiter(),
      getCast,
    });

    const response = await worker.fetch(request(), environment({ limit }));

    expect(response.status).toBe(200);
    expect(calls).toEqual(["cache", "limit", "tmdb"]);
    expect(limit).toHaveBeenCalledWith({ key: "get-cast:603" });
  });

  it("returns a typed rate-limit response without calling TMDB when denied", async () => {
    const limit = vi.fn<RateLimitBinding["limit"]>(async () => ({
      success: false,
    }));
    const getCast = provider();
    const worker = createWorker({
      cache: cacheMiss(),
      rateLimiter: createNativeCastRateLimiter(),
      getCast,
    });

    const response = await worker.fetch(request(), environment({ limit }));

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({ error: "RATE_LIMITED" });
    expect(getCast).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", undefined],
    [
      "throwing",
      {
        limit: vi.fn<RateLimitBinding["limit"]>(() =>
          Promise.reject(new Error("binding unavailable")),
        ),
      },
    ],
  ] as const)(
    "fails closed when the native binding is %s",
    async (_case, binding) => {
      const getCast = provider();
      const worker = createWorker({
        cache: cacheMiss(),
        rateLimiter: createNativeCastRateLimiter(),
        getCast,
      });

      const response = await worker.fetch(request(), environment(binding));

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        error: "BACKEND_UNAVAILABLE",
      });
      expect(getCast).not.toHaveBeenCalled();
    },
  );
});

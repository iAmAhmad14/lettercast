import type { CastResponse } from "@lettercast/contracts";

import {
  createCastCacheKey,
  type EdgeCache,
  readCastCache,
  writeCastCache,
  writeNotFoundCache,
} from "./cast-cache";
import { evaluateOrigin } from "./origin-policy";
import {
  type CastRateLimiter,
  createNativeCastRateLimiter,
  type RateLimitEnvironment,
} from "./rate-limiter";
import { castResponse, errorResponse } from "./responses";
import { routeRequest } from "./route";
import { createTmdbCastProvider } from "./tmdb-client";
import { mapTmdbError, TmdbError } from "./tmdb-errors";

export type WorkerEnvironment = RateLimitEnvironment & {
  ALLOWED_EXTENSION_ORIGIN?: string;
  TMDB_API_TOKEN?: string;
};

export type WorkerDependencies = {
  cache: EdgeCache;
  rateLimiter: CastRateLimiter;
  getCast(
    tmdbId: number,
    environment: WorkerEnvironment,
  ): Promise<CastResponse>;
};

export type LettercastWorker = {
  fetch(request: Request, environment: WorkerEnvironment): Promise<Response>;
};

export function createWorker(
  dependencies: WorkerDependencies,
): LettercastWorker {
  return {
    async fetch(request, environment) {
      const origin = evaluateOrigin(
        request.headers.get("Origin"),
        environment.ALLOWED_EXTENSION_ORIGIN,
      );
      if (!origin.allowed) {
        return errorResponse("UNKNOWN", 403);
      }

      const route = routeRequest(request);
      if (!route.accepted) {
        const extraHeaders =
          route.allow === undefined ? undefined : { Allow: route.allow };
        return errorResponse(
          route.error,
          route.status,
          origin.origin,
          extraHeaders,
        );
      }

      const cacheKey = createCastCacheKey(request, route.tmdbId);
      const cached = await readCastCache(dependencies.cache, cacheKey);
      if (cached.kind === "hit") {
        return castResponse(cached.value, origin.origin);
      }
      if (cached.kind === "not-found") {
        return errorResponse("INVALID_ID", 404, origin.origin);
      }

      const rateLimitDecision = await dependencies.rateLimiter.check(
        route.tmdbId,
        environment,
      );
      if (rateLimitDecision === "denied") {
        return errorResponse("RATE_LIMITED", 429, origin.origin);
      }
      if (rateLimitDecision === "unavailable") {
        return errorResponse("BACKEND_UNAVAILABLE", 503, origin.origin);
      }

      try {
        const result = await dependencies.getCast(route.tmdbId, environment);
        await writeCastCache(dependencies.cache, cacheKey, result);
        return castResponse(result, origin.origin);
      } catch (error) {
        if (error instanceof TmdbError && error.kind === "NOT_FOUND") {
          await writeNotFoundCache(dependencies.cache, cacheKey);
        }
        const publicError = mapTmdbError(error);
        return errorResponse(
          publicError.error,
          publicError.status,
          origin.origin,
        );
      }
    },
  };
}

const getTmdbCast = createTmdbCastProvider();
const worker = createWorker({
  cache: caches.default,
  rateLimiter: createNativeCastRateLimiter(),
  getCast(tmdbId, environment) {
    return getTmdbCast(tmdbId, environment.TMDB_API_TOKEN);
  },
});

export default worker satisfies ExportedHandler<WorkerEnvironment>;

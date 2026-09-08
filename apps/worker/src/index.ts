import type { CastResponse } from "@lettercast/contracts";

import { evaluateOrigin } from "./origin-policy";
import { castResponse, errorResponse } from "./responses";
import { routeRequest } from "./route";
import { createTmdbCastProvider } from "./tmdb-client";
import { mapTmdbError } from "./tmdb-errors";

export type WorkerEnvironment = {
  ALLOWED_EXTENSION_ORIGIN?: string;
  TMDB_API_TOKEN?: string;
};

export type WorkerDependencies = {
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

      try {
        const result = await dependencies.getCast(route.tmdbId, environment);
        return castResponse(result, origin.origin);
      } catch (error) {
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
  getCast(tmdbId, environment) {
    return getTmdbCast(tmdbId, environment.TMDB_API_TOKEN);
  },
});

export default worker satisfies ExportedHandler<WorkerEnvironment>;

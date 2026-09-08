import type { CastResponse } from "@lettercast/contracts";

import { evaluateOrigin } from "./origin-policy";
import { castResponse, errorResponse } from "./responses";
import { routeRequest } from "./route";

export type WorkerEnvironment = {
  ALLOWED_EXTENSION_ORIGIN?: string;
};

export type WorkerDependencies = {
  getCast(tmdbId: number): Promise<CastResponse>;
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
        const result = await dependencies.getCast(route.tmdbId);
        return castResponse(result, origin.origin);
      } catch {
        return errorResponse("BACKEND_UNAVAILABLE", 503, origin.origin);
      }
    },
  };
}

const worker = createWorker({
  async getCast() {
    throw new Error("Cast provider is not implemented");
  },
});

export default worker satisfies ExportedHandler<WorkerEnvironment>;

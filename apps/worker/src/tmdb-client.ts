import type { CastResponse } from "@lettercast/contracts";

import { TmdbError } from "./tmdb-errors";
import { parseTmdbCredits } from "./tmdb-schema";

const TMDB_API_ORIGIN = "https://api.themoviedb.org";
const DEFAULT_TIMEOUT_MS = 5_000;

export type TmdbClientOptions = {
  fetch?: typeof fetch;
  timeoutMs?: number;
};

function errorForStatus(status: number): TmdbError {
  if (status === 401) {
    return new TmdbError("AUTHENTICATION");
  }
  if (status === 404) {
    return new TmdbError("NOT_FOUND");
  }
  if (status === 429) {
    return new TmdbError("RATE_LIMITED");
  }
  return new TmdbError("UPSTREAM_UNAVAILABLE");
}

export function createTmdbCastProvider(
  options: TmdbClientOptions = {},
): (tmdbId: number, token: string | undefined) => Promise<CastResponse> {
  const fetchImpl = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return async (tmdbId, token) => {
    if (token === undefined || token.trim() === "") {
      throw new TmdbError("CONFIGURATION");
    }

    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    let response: Response;
    try {
      response = await fetchImpl(
        `${TMDB_API_ORIGIN}/3/movie/${tmdbId}/credits`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
          redirect: "error",
          signal: controller.signal,
        },
      );
    } catch {
      throw new TmdbError(timedOut ? "TIMEOUT" : "UPSTREAM_UNAVAILABLE");
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw errorForStatus(response.status);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new TmdbError("INVALID_RESPONSE");
    }

    const parsed = parseTmdbCredits(payload);
    if (parsed === null) {
      throw new TmdbError("INVALID_RESPONSE");
    }

    return parsed;
  };
}

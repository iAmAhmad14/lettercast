import type { GetCastError } from "@lettercast/contracts";

export type RouteDecision =
  | { accepted: true; tmdbId: number }
  | {
      accepted: false;
      error: GetCastError;
      status: number;
      allow?: string;
    };

const MOVIE_CAST_PATH = /^\/v1\/movie\/([^/]+)\/cast$/;
const POSITIVE_INTEGER_PATH = /^[1-9]\d*$/;

export function routeRequest(request: Request): RouteDecision {
  if (request.method !== "GET") {
    return { accepted: false, error: "UNKNOWN", status: 405, allow: "GET" };
  }

  const url = new URL(request.url);
  if (url.search !== "") {
    return { accepted: false, error: "UNKNOWN", status: 400 };
  }

  const match = MOVIE_CAST_PATH.exec(url.pathname);
  if (match === null) {
    return { accepted: false, error: "UNKNOWN", status: 404 };
  }

  const rawId = match[1];
  if (rawId === undefined || !POSITIVE_INTEGER_PATH.test(rawId)) {
    return { accepted: false, error: "INVALID_ID", status: 400 };
  }

  const tmdbId = Number(rawId);
  if (!Number.isSafeInteger(tmdbId)) {
    return { accepted: false, error: "INVALID_ID", status: 400 };
  }

  return { accepted: true, tmdbId };
}

import {
  parseBackendErrorResponse,
  parseCastResponse,
  type CastResponse,
} from "@lettercast/contracts";

export const POSITIVE_CACHE_TTL_SECONDS = 24 * 60 * 60;
export const NOT_FOUND_CACHE_TTL_SECONDS = 60 * 60;

export type EdgeCache = Pick<Cache, "match" | "put">;

export type CacheLookup =
  | { kind: "hit"; value: CastResponse }
  | { kind: "not-found" }
  | { kind: "miss" };

export function createCastCacheKey(
  request: Request,
  tmdbId: number,
): Request {
  const url = new URL(request.url);
  url.pathname = `/v1/movie/${tmdbId}/cast`;
  url.search = "";
  url.hash = "";
  return new Request(url.toString(), { method: "GET" });
}

export async function readCastCache(
  cache: EdgeCache,
  key: Request,
): Promise<CacheLookup> {
  let response: Response | undefined;
  try {
    response = await cache.match(key);
  } catch {
    return { kind: "miss" };
  }

  if (response === undefined) {
    return { kind: "miss" };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { kind: "miss" };
  }

  if (response.status === 200) {
    const parsed = parseCastResponse(payload);
    return parsed === null
      ? { kind: "miss" }
      : { kind: "hit", value: parsed };
  }

  if (response.status === 404) {
    const parsed = parseBackendErrorResponse(payload);
    if (parsed?.error === "INVALID_ID") {
      return { kind: "not-found" };
    }
  }

  return { kind: "miss" };
}

async function write(
  cache: EdgeCache,
  key: Request,
  response: Response,
): Promise<void> {
  try {
    await cache.put(key, response);
  } catch {
    // Cache availability is an optimization and never a correctness dependency.
  }
}

export function writeCastCache(
  cache: EdgeCache,
  key: Request,
  value: CastResponse,
): Promise<void> {
  return write(
    cache,
    key,
    Response.json(value, {
      headers: {
        "Cache-Control": `public, max-age=${POSITIVE_CACHE_TTL_SECONDS}`,
        "Content-Type": "application/json; charset=utf-8",
      },
    }),
  );
}

export function writeNotFoundCache(
  cache: EdgeCache,
  key: Request,
): Promise<void> {
  return write(
    cache,
    key,
    Response.json(
      { error: "INVALID_ID" },
      {
        status: 404,
        headers: {
          "Cache-Control": `public, max-age=${NOT_FOUND_CACHE_TTL_SECONDS}`,
          "Content-Type": "application/json; charset=utf-8",
        },
      },
    ),
  );
}

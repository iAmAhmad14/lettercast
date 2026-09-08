import type { CastMember } from "./cast";
import { parseCastResponse } from "./cast";
import type { GetCastError } from "./errors";
import { isGetCastError } from "./errors";
import { isExactRecord, isPositiveSafeInteger } from "./validation";

export type GetCastRequest = { type: "get-cast"; tmdbId: number };

export type GetCastResponse =
  | { ok: true; cast: CastMember[] }
  | { ok: false; error: GetCastError };

export function parseGetCastRequest(value: unknown): GetCastRequest | null {
  if (
    !isExactRecord(value, ["type", "tmdbId"]) ||
    value.type !== "get-cast" ||
    !isPositiveSafeInteger(value.tmdbId)
  ) {
    return null;
  }

  return { type: "get-cast", tmdbId: value.tmdbId };
}

export function parseGetCastResponse(value: unknown): GetCastResponse | null {
  if (isExactRecord(value, ["ok", "cast"]) && value.ok === true) {
    const parsed = parseCastResponse({ cast: value.cast });
    return parsed === null ? null : { ok: true, cast: parsed.cast };
  }

  if (
    isExactRecord(value, ["ok", "error"]) &&
    value.ok === false &&
    isGetCastError(value.error)
  ) {
    return { ok: false, error: value.error };
  }

  return null;
}

import {
  isExactRecord,
  isNonNegativeSafeInteger,
  isPositiveSafeInteger,
} from "./validation";

export type CastMember = {
  id: number;
  name: string;
  character: string | null;
  profilePath: string | null;
  order: number;
};

export type CastResponse = { cast: CastMember[] };

const PROFILE_PATH_PATTERN = /^\/[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/;

export function parseProfilePath(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string" || !PROFILE_PATH_PATTERN.test(value)) {
    return undefined;
  }

  return value;
}

function parseCastMember(value: unknown): CastMember | null {
  if (
    !isExactRecord(value, [
      "id",
      "name",
      "character",
      "profilePath",
      "order",
    ]) ||
    !isPositiveSafeInteger(value.id) ||
    typeof value.name !== "string" ||
    !(typeof value.character === "string" || value.character === null) ||
    !isNonNegativeSafeInteger(value.order)
  ) {
    return null;
  }

  const profilePath = parseProfilePath(value.profilePath);
  if (profilePath === undefined) {
    return null;
  }

  return {
    id: value.id,
    name: value.name,
    character: value.character,
    profilePath,
    order: value.order,
  };
}

export function parseCastResponse(value: unknown): CastResponse | null {
  if (!isExactRecord(value, ["cast"]) || !Array.isArray(value.cast)) {
    return null;
  }

  const cast: CastMember[] = [];
  for (const member of value.cast) {
    const parsedMember = parseCastMember(member);
    if (parsedMember === null) {
      return null;
    }
    cast.push(parsedMember);
  }

  return { cast };
}

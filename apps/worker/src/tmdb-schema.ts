import type { CastMember, CastResponse } from "@lettercast/contracts";

type RawTmdbCastMember = {
  id: number;
  name: string;
  character?: string | null;
  profile_path?: string | null;
  order: number;
};

const PROFILE_PATH_PATTERN = /^\/[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function parseOptionalText(
  value: unknown,
  present: boolean,
): string | null | undefined {
  if (!present || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  return value.trim() === "" ? null : value;
}

function parseProfilePath(
  value: unknown,
  present: boolean,
): string | null | undefined {
  if (!present || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  if (value.trim() === "") {
    return null;
  }
  return PROFILE_PATH_PATTERN.test(value) ? value : undefined;
}

function parseRawCastMember(value: unknown): RawTmdbCastMember | null {
  if (
    !isRecord(value) ||
    !isPositiveSafeInteger(value.id) ||
    typeof value.name !== "string" ||
    value.name.trim() === "" ||
    !isNonNegativeSafeInteger(value.order)
  ) {
    return null;
  }

  const character = parseOptionalText(
    value.character,
    Object.hasOwn(value, "character"),
  );
  const profilePath = parseProfilePath(
    value.profile_path,
    Object.hasOwn(value, "profile_path"),
  );
  if (character === undefined || profilePath === undefined) {
    return null;
  }

  return {
    id: value.id,
    name: value.name,
    character,
    profile_path: profilePath,
    order: value.order,
  };
}

export function parseTmdbCredits(value: unknown): CastResponse | null {
  if (!isRecord(value) || !Array.isArray(value.cast)) {
    return null;
  }

  const normalized: Array<{ member: CastMember; sourceIndex: number }> = [];
  for (const [sourceIndex, valueMember] of value.cast.entries()) {
    const member = parseRawCastMember(valueMember);
    if (member === null) {
      return null;
    }

    normalized.push({
      sourceIndex,
      member: {
        id: member.id,
        name: member.name,
        character: member.character ?? null,
        profilePath: member.profile_path ?? null,
        order: member.order,
      },
    });
  }

  normalized.sort(
    (left, right) =>
      left.member.order - right.member.order ||
      left.sourceIndex - right.sourceIndex,
  );

  return { cast: normalized.map(({ member }) => member) };
}

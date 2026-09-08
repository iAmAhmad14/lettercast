export const GET_CAST_ERRORS = [
  "UNSUPPORTED_MEDIA_TYPE",
  "BACKEND_UNAVAILABLE",
  "TIMEOUT",
  "INVALID_ID",
  "RATE_LIMITED",
  "UNKNOWN",
] as const;

export type GetCastError = (typeof GET_CAST_ERRORS)[number];

export function isGetCastError(value: unknown): value is GetCastError {
  return (
    typeof value === "string" &&
    (GET_CAST_ERRORS as readonly string[]).includes(value)
  );
}

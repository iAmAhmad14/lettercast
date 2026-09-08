import type { GetCastError } from "./errors";
import { isGetCastError } from "./errors";
import { isExactRecord } from "./validation";

export type BackendErrorResponse = { error: GetCastError };

export function parseBackendErrorResponse(
  value: unknown,
): BackendErrorResponse | null {
  if (!isExactRecord(value, ["error"]) || !isGetCastError(value.error)) {
    return null;
  }

  return { error: value.error };
}

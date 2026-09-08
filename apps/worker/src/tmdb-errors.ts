import type { GetCastError } from "@lettercast/contracts";

export type TmdbErrorKind =
  | "AUTHENTICATION"
  | "CONFIGURATION"
  | "INVALID_RESPONSE"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "UPSTREAM_UNAVAILABLE";

export class TmdbError extends Error {
  readonly kind: TmdbErrorKind;

  constructor(kind: TmdbErrorKind) {
    super("TMDB request failed");
    this.name = "TmdbError";
    this.kind = kind;
  }
}

export type PublicError = {
  error: GetCastError;
  status: number;
};

export function mapTmdbError(error: unknown): PublicError {
  if (!(error instanceof TmdbError)) {
    return { error: "BACKEND_UNAVAILABLE", status: 503 };
  }

  switch (error.kind) {
    case "NOT_FOUND":
      return { error: "INVALID_ID", status: 404 };
    case "RATE_LIMITED":
      return { error: "RATE_LIMITED", status: 429 };
    case "TIMEOUT":
      return { error: "TIMEOUT", status: 504 };
    case "INVALID_RESPONSE":
    case "UPSTREAM_UNAVAILABLE":
      return { error: "BACKEND_UNAVAILABLE", status: 502 };
    case "AUTHENTICATION":
    case "CONFIGURATION":
      return { error: "BACKEND_UNAVAILABLE", status: 503 };
  }
}

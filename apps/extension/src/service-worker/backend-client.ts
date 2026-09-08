import {
  parseBackendErrorResponse,
  parseCastResponse,
  type GetCastError,
  type GetCastResponse,
} from "@lettercast/contracts";

import { parseBackendOrigin } from "./backend-origin";

export const BACKEND_TIMEOUT_MS = 10_000;

export type FetchBackend = (
  input: string,
  init: RequestInit,
) => Promise<Response>;

export type BackendClient = {
  getCast(tmdbId: number): Promise<GetCastResponse>;
};

export type BackendClientOptions = {
  backendOrigin: unknown;
  fetch?: FetchBackend;
  timeoutMs?: number;
};

const EXPECTED_ERROR_BY_STATUS: Readonly<Partial<Record<number, GetCastError>>> =
  {
    400: "INVALID_ID",
    403: "UNKNOWN",
    404: "INVALID_ID",
    429: "RATE_LIMITED",
    502: "BACKEND_UNAVAILABLE",
    503: "BACKEND_UNAVAILABLE",
    504: "TIMEOUT",
  };

function failure(error: GetCastError): GetCastResponse {
  return { ok: false, error };
}

async function parseBackendResponse(
  response: Response,
): Promise<GetCastResponse> {
  if (!response.headers.get("Content-Type")?.startsWith("application/json")) {
    return failure("UNKNOWN");
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return failure("UNKNOWN");
  }

  if (response.status === 200) {
    const parsed = parseCastResponse(body);
    return parsed === null
      ? failure("UNKNOWN")
      : { ok: true, cast: parsed.cast };
  }

  const expectedError = EXPECTED_ERROR_BY_STATUS[response.status];
  const parsed = parseBackendErrorResponse(body);
  if (expectedError === undefined || parsed?.error !== expectedError) {
    return failure("UNKNOWN");
  }

  return failure(parsed.error);
}

export function createBackendClient(
  options: BackendClientOptions,
): BackendClient {
  const backendOrigin = parseBackendOrigin(options.backendOrigin);
  const fetchBackend = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? BACKEND_TIMEOUT_MS;

  return {
    async getCast(tmdbId) {
      if (backendOrigin === null) {
        return failure("BACKEND_UNAVAILABLE");
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchBackend(
          `${backendOrigin}/v1/movie/${tmdbId}/cast`,
          {
            method: "GET",
            headers: { Accept: "application/json" },
            credentials: "omit",
            redirect: "error",
            signal: controller.signal,
          },
        );
        const result = await parseBackendResponse(response);
        return controller.signal.aborted ? failure("TIMEOUT") : result;
      } catch {
        return failure(
          controller.signal.aborted ? "TIMEOUT" : "BACKEND_UNAVAILABLE",
        );
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

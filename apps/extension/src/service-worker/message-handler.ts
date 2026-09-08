import {
  parseGetCastRequest,
  type GetCastResponse,
} from "@lettercast/contracts";

import type { BackendClient } from "./backend-client";

export type GetCastMessageHandler = (
  message: unknown,
) => Promise<GetCastResponse> | undefined;

export function createGetCastMessageHandler(
  client: BackendClient,
): GetCastMessageHandler {
  return (message) => {
    const request = parseGetCastRequest(message);
    if (request === null) {
      return undefined;
    }

    return client
      .getCast(request.tmdbId)
      .catch(() => ({ ok: false, error: "BACKEND_UNAVAILABLE" }));
  };
}

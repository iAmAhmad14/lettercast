import type {
  BackendErrorResponse,
  CastResponse,
  GetCastError,
} from "@lettercast/contracts";

function jsonResponse(
  body: BackendErrorResponse | CastResponse,
  status: number,
  origin?: string,
  extraHeaders?: HeadersInit,
): Response {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("X-Content-Type-Options", "nosniff");

  if (origin !== undefined) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }

  return Response.json(body, { status, headers });
}

export function castResponse(body: CastResponse, origin: string): Response {
  return jsonResponse(body, 200, origin);
}

export function errorResponse(
  error: GetCastError,
  status: number,
  origin?: string,
  extraHeaders?: HeadersInit,
): Response {
  return jsonResponse({ error }, status, origin, extraHeaders);
}

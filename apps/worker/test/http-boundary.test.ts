import type { CastResponse } from "@lettercast/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  createWorker,
  type WorkerDependencies,
  type WorkerEnvironment,
} from "../src/index";

const ALLOWED_ORIGIN = `chrome-extension://${"a".repeat(32)}`;
const OTHER_ORIGIN = `chrome-extension://${"b".repeat(32)}`;
const environment: WorkerEnvironment = {
  ALLOWED_EXTENSION_ORIGIN: ALLOWED_ORIGIN,
};

const cast: CastResponse = {
  cast: [
    {
      id: 1,
      name: "Actor",
      character: "Character",
      profilePath: "/profile.jpg",
      order: 0,
    },
  ],
};

function request(
  path: string,
  options: { method?: string; origin?: string | null } = {},
): Request {
  const headers = new Headers();
  const origin = options.origin === undefined ? ALLOWED_ORIGIN : options.origin;
  if (origin !== null) {
    headers.set("Origin", origin);
  }

  return new Request(`https://api.lettercast.test${path}`, {
    method: options.method ?? "GET",
    headers,
  });
}

function setup(result: CastResponse = cast): {
  worker: ReturnType<typeof createWorker>;
  getCast: ReturnType<typeof vi.fn<WorkerDependencies["getCast"]>>;
} {
  const getCast = vi.fn<WorkerDependencies["getCast"]>(async (tmdbId) => {
    void tmdbId;
    return result;
  });

  return { worker: createWorker({ getCast }), getCast };
}

describe("Cloudflare Worker HTTP boundary", () => {
  it("accepts only the fixed movie-cast route and passes its ID downstream", async () => {
    const { worker, getCast } = setup();

    const response = await worker.fetch(
      request("/v1/movie/693134/cast"),
      environment,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(cast);
    expect(getCast).toHaveBeenCalledOnce();
    expect(getCast).toHaveBeenCalledWith(693134, environment);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      ALLOWED_ORIGIN,
    );
    expect(response.headers.get("Vary")).toBe("Origin");
    expect(response.headers.get("Content-Type")).toBe(
      "application/json; charset=utf-8",
    );
  });

  it.each(["0", "-1", "1.5", "01", "9007199254740992", "abc"])(
    "rejects invalid movie ID %s without calling downstream",
    async (rawId) => {
      const { worker, getCast } = setup();

      const response = await worker.fetch(
        request(`/v1/movie/${rawId}/cast`),
        environment,
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "INVALID_ID" });
      expect(getCast).not.toHaveBeenCalled();
    },
  );

  it("rejects non-GET methods with an Allow header", async () => {
    const { worker, getCast } = setup();

    const response = await worker.fetch(
      request("/v1/movie/603/cast", { method: "POST" }),
      environment,
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
    await expect(response.json()).resolves.toEqual({ error: "UNKNOWN" });
    expect(getCast).not.toHaveBeenCalled();
  });

  it.each([
    "/v1/movie/603/cast/extra",
    "/v1/movie/603",
    "/v1/tv/603/cast",
    "/v1/movie/603/cast?url=https%3A%2F%2Fexample.com",
    "/v1/movie/603/cast?append_to_response=images",
  ])("rejects extra path or query surface %s", async (path) => {
    const { worker, getCast } = setup();

    const response = await worker.fetch(request(path), environment);

    expect([400, 404]).toContain(response.status);
    await expect(response.json()).resolves.toEqual({ error: "UNKNOWN" });
    expect(getCast).not.toHaveBeenCalled();
  });

  it("rejects a different extension origin without CORS access", async () => {
    const { worker, getCast } = setup();

    const response = await worker.fetch(
      request("/v1/movie/603/cast", { origin: OTHER_ORIGIN }),
      environment,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "UNKNOWN" });
    expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
    expect(getCast).not.toHaveBeenCalled();
  });

  it("rejects an absent Origin without calling downstream", async () => {
    const { worker, getCast } = setup();

    const response = await worker.fetch(
      request("/v1/movie/603/cast", { origin: null }),
      environment,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "UNKNOWN" });
    expect(getCast).not.toHaveBeenCalled();
  });

  it("fails closed when the configured extension origin is missing or invalid", async () => {
    const { worker, getCast } = setup();

    const missing = await worker.fetch(request("/v1/movie/603/cast"), {});
    const invalid = await worker.fetch(request("/v1/movie/603/cast"), {
      ALLOWED_EXTENSION_ORIGIN: "https://letterboxd.com",
    });

    expect(missing.status).toBe(403);
    expect(invalid.status).toBe(403);
    expect(getCast).not.toHaveBeenCalled();
  });

  it("maps an unavailable downstream dependency to a bounded error", async () => {
    const getCast = vi.fn<WorkerDependencies["getCast"]>(() =>
      Promise.reject(new Error("sensitive upstream detail")),
    );
    const worker = createWorker({ getCast });

    const response = await worker.fetch(
      request("/v1/movie/603/cast"),
      environment,
    );

    expect(response.status).toBe(503);
    expect(await response.text()).toBe('{"error":"BACKEND_UNAVAILABLE"}');
    expect(getCast).toHaveBeenCalledOnce();
  });
});

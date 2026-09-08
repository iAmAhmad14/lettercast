import type { GetCastResponse } from "@lettercast/contracts";
import { describe, expect, it, vi } from "vitest";

import type { BackendClient } from "../src/service-worker/backend-client";
import { createGetCastMessageHandler } from "../src/service-worker/message-handler";

function clientWith(
  response: GetCastResponse = { ok: true, cast: [] },
): BackendClient & { getCast: ReturnType<typeof vi.fn<BackendClient["getCast"]>> } {
  return {
    getCast: vi.fn<BackendClient["getCast"]>(async () => response),
  };
}

describe("get-cast runtime message boundary", () => {
  it("validates and forwards only the movie ID", async () => {
    const client = clientWith();
    const handleMessage = createGetCastMessageHandler(client);

    await expect(
      handleMessage({ type: "get-cast", tmdbId: 693134 }),
    ).resolves.toEqual({ ok: true, cast: [] });
    expect(client.getCast).toHaveBeenCalledOnce();
    expect(client.getCast).toHaveBeenCalledWith(693134);
  });

  it.each([
    undefined,
    null,
    "get-cast",
    {},
    { type: "other", tmdbId: 603 },
    { type: "get-cast", tmdbId: 0 },
    { type: "get-cast", tmdbId: "603" },
    { type: "get-cast", tmdbId: 603, url: "https://example.com" },
  ])("ignores invalid sender payload %j without network work", (message) => {
    const client = clientWith();
    const handleMessage = createGetCastMessageHandler(client);

    expect(handleMessage(message)).toBeUndefined();
    expect(client.getCast).not.toHaveBeenCalled();
  });

  it("contains unexpected client rejection as a typed failure", async () => {
    const client: BackendClient = {
      getCast: () => Promise.reject(new Error("internal detail")),
    };
    const handleMessage = createGetCastMessageHandler(client);

    await expect(
      handleMessage({ type: "get-cast", tmdbId: 603 }),
    ).resolves.toEqual({ ok: false, error: "BACKEND_UNAVAILABLE" });
  });

  it("has identical semantics after a fresh-handler cold start", async () => {
    const firstClient = clientWith({ ok: false, error: "RATE_LIMITED" });
    const secondClient = clientWith({ ok: false, error: "RATE_LIMITED" });
    const message = { type: "get-cast", tmdbId: 603 };

    const first = await createGetCastMessageHandler(firstClient)(message);
    const afterRestart = await createGetCastMessageHandler(secondClient)(message);

    expect(first).toEqual({ ok: false, error: "RATE_LIMITED" });
    expect(afterRestart).toEqual(first);
    expect(firstClient.getCast).toHaveBeenCalledOnce();
    expect(secondClient.getCast).toHaveBeenCalledOnce();
  });
});

import { describe, expect, it } from "vitest";

import { GET_CAST_ERRORS } from "./errors";
import { parseGetCastRequest, parseGetCastResponse } from "./messages";

const validMember = {
  id: 1,
  name: "Actor",
  character: "Character",
  profilePath: "/profile.jpg",
  order: 0,
};

describe("parseGetCastRequest", () => {
  it("accepts only the get-cast operation with a positive safe integer ID", () => {
    expect(parseGetCastRequest({ type: "get-cast", tmdbId: 693134 })).toEqual({
      type: "get-cast",
      tmdbId: 693134,
    });

    for (const tmdbId of [0, -1, 1.5, "693134", Number.NaN, Infinity]) {
      expect(parseGetCastRequest({ type: "get-cast", tmdbId })).toBeNull();
    }
    expect(
      parseGetCastRequest({
        type: "get-cast",
        tmdbId: Number.MAX_SAFE_INTEGER + 1,
      }),
    ).toBeNull();
  });

  it("rejects unknown operations, arbitrary URLs, missing fields, and extras", () => {
    expect(parseGetCastRequest({ type: "fetch", tmdbId: 1 })).toBeNull();
    expect(parseGetCastRequest({ type: "get-cast" })).toBeNull();
    expect(
      parseGetCastRequest({
        type: "get-cast",
        tmdbId: 1,
        url: "https://example.com",
      }),
    ).toBeNull();
  });
});

describe("parseGetCastResponse", () => {
  it("accepts an exact successful response", () => {
    expect(parseGetCastResponse({ ok: true, cast: [validMember] })).toEqual({
      ok: true,
      cast: [validMember],
    });
  });

  it.each(GET_CAST_ERRORS)("accepts the documented %s failure", (error) => {
    expect(parseGetCastResponse({ ok: false, error })).toEqual({
      ok: false,
      error,
    });
  });

  it("rejects malformed and unexpected response shapes", () => {
    expect(parseGetCastResponse({ ok: true })).toBeNull();
    expect(parseGetCastResponse({ ok: false, error: "NOT_DOCUMENTED" })).toBeNull();
    expect(parseGetCastResponse({ ok: "true", cast: [] })).toBeNull();
    expect(parseGetCastResponse({ ok: true, cast: [], extra: true })).toBeNull();
    expect(
      parseGetCastResponse({ ok: true, cast: [{ ...validMember, order: "0" }] }),
    ).toBeNull();
  });
});

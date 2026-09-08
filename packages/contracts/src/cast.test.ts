import { describe, expect, it } from "vitest";

import { parseBackendErrorResponse } from "./backend";
import { parseCastResponse, parseProfilePath } from "./cast";

const validMember = {
  id: 31,
  name: "Carrie-Anne Moss",
  character: "Trinity",
  profilePath: "/xD4jTA3KmVp5Rq3aHcymL9DUGjD.jpg",
  order: 1,
};

describe("parseCastResponse", () => {
  it("accepts complete and nullable cast members", () => {
    expect(
      parseCastResponse({
        cast: [
          validMember,
          { ...validMember, id: 32, character: null, profilePath: null },
        ],
      }),
    ).toEqual({
      cast: [
        validMember,
        { ...validMember, id: 32, character: null, profilePath: null },
      ],
    });
    expect(parseCastResponse({ cast: [] })).toEqual({ cast: [] });
  });

  it("rejects missing, extra, and wrong-type fields", () => {
    for (const member of [
      {
        id: validMember.id,
        character: validMember.character,
        profilePath: validMember.profilePath,
        order: validMember.order,
      },
      { ...validMember, id: 0 },
      { ...validMember, name: null },
      { ...validMember, character: undefined },
      { ...validMember, order: -1 },
      { ...validMember, extra: true },
    ]) {
      expect(parseCastResponse({ cast: [member] })).toBeNull();
    }

    expect(parseCastResponse({})).toBeNull();
    expect(parseCastResponse({ cast: null })).toBeNull();
    expect(parseCastResponse({ cast: [], extra: true })).toBeNull();
  });

  it("rejects the complete response when any cast member is malformed", () => {
    expect(
      parseCastResponse({
        cast: [validMember, { ...validMember, id: "31" }],
      }),
    ).toBeNull();
  });
});

describe("parseProfilePath", () => {
  it("accepts null and a TMDB-style relative file path", () => {
    expect(parseProfilePath(null)).toBeNull();
    expect(parseProfilePath("/profile_1-2.jpg")).toBe("/profile_1-2.jpg");
  });

  it.each([
    "https://image.tmdb.org/profile.jpg",
    "//example.com/profile.jpg",
    "profile.jpg",
    "/../profile.jpg",
    "/folder/profile.jpg",
    "/profile.jpg?size=original",
    "/profile.jpg#fragment",
    "",
  ])("rejects unsafe or non-relative path %j", (value) => {
    expect(parseProfilePath(value)).toBeUndefined();
  });
});

describe("parseBackendErrorResponse", () => {
  it("accepts only an exact documented error payload", () => {
    expect(parseBackendErrorResponse({ error: "RATE_LIMITED" })).toEqual({
      error: "RATE_LIMITED",
    });
    expect(parseBackendErrorResponse({ error: "OTHER" })).toBeNull();
    expect(
      parseBackendErrorResponse({ error: "RATE_LIMITED", detail: "upstream" }),
    ).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import { parseBackendOrigin } from "../src/service-worker/backend-origin";

describe("backend origin configuration", () => {
  it("normalizes an origin-only HTTPS URL", () => {
    expect(parseBackendOrigin("https://api.lettercast.example")).toBe(
      "https://api.lettercast.example",
    );
    expect(parseBackendOrigin("https://api.lettercast.example/")).toBe(
      "https://api.lettercast.example",
    );
  });

  it.each([
    undefined,
    "",
    "http://api.lettercast.example",
    "https://api.lettercast.example/v1",
    "https://api.lettercast.example/?target=other",
    "https://user:password@api.lettercast.example",
    "not a URL",
  ])("rejects unsafe or non-origin configuration %s", (value) => {
    expect(parseBackendOrigin(value)).toBeNull();
  });
});

import { parseGetCastRequest } from "@lettercast/contracts";
import { describe, expect, it } from "vitest";

describe("extension scaffold", () => {
  it("provides a DOM test environment", () => {
    const element = document.createElement("div");
    element.textContent = "Lettercast";

    expect(element.textContent).toBe("Lettercast");
  });

  it("resolves the shared runtime-message contract", () => {
    expect(parseGetCastRequest({ type: "get-cast", tmdbId: 603 })).toEqual({
      type: "get-cast",
      tmdbId: 603,
    });
  });
});

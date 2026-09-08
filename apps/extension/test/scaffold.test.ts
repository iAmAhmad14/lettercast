import { describe, expect, it } from "vitest";

describe("extension scaffold", () => {
  it("provides a DOM test environment", () => {
    const element = document.createElement("div");
    element.textContent = "Lettercast";

    expect(element.textContent).toBe("Lettercast");
  });
});

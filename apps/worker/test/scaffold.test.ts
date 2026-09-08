import { describe, expect, it } from "vitest";
import worker from "../src/index";

describe("worker scaffold", () => {
  it("runs an inert module Worker", async () => {
    const response = await worker.fetch();

    expect(response.status).toBe(404);
  });
});

import { describe, expect, it } from "vitest";
import { statusMessage } from "./status";

describe("statusMessage", () => {
  it("says what the product will do", () => {
    expect(statusMessage()).toContain("bin days");
  });
});

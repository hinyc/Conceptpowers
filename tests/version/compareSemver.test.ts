import { describe, it, expect } from "vitest";
import { isNewer } from "../../src/version/compareSemver.js";

describe("isNewer", () => {
  it("major/minor/patch가 더 높으면 true", () => {
    expect(isNewer("1.0.0", "0.9.9")).toBe(true);
    expect(isNewer("0.2.0", "0.1.9")).toBe(true);
    expect(isNewer("0.1.1", "0.1.0")).toBe(true);
  });
  it("같거나 낮으면 false", () => {
    expect(isNewer("0.1.0", "0.1.0")).toBe(false);
    expect(isNewer("0.1.0", "0.2.0")).toBe(false);
    expect(isNewer("1.0.0", "2.0.0")).toBe(false);
  });
  it("형식이 아니면 false(안전 측)", () => {
    expect(isNewer("1.0", "0.9.9")).toBe(false);
    expect(isNewer("abc", "0.1.0")).toBe(false);
    expect(isNewer("1.0.0", "")).toBe(false);
  });
});

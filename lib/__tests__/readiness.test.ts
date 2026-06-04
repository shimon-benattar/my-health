import { describe, it, expect } from "vitest";
import { calcReadiness } from "@/lib/readiness";

describe("calcReadiness", () => {
  it("returns 0 when both metrics are missing", () => {
    expect(calcReadiness(null, null)).toBe(0);
  });

  it("handles zero-minute sleep", () => {
    // HRV=50 => 50, sleep=0 => 0, average => 25
    expect(calcReadiness(50, 0)).toBe(25);
  });

  it("caps values above max", () => {
    expect(calcReadiness(200, 1000)).toBe(100);
  });

  it("clamps values below min", () => {
    expect(calcReadiness(0, 0)).toBe(0);
  });

  it("computes a mid-range value", () => {
    // HRV=44 => 40, sleep=420 => 50, average => 45
    expect(calcReadiness(44, 420)).toBe(45);
  });
});

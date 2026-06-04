import { describe, it, expect } from "vitest";
import { getMockSportData } from "@/lib/mockData";

describe("getMockSportData", () => {
  it("returns running sessions with expected shape", () => {
    const sessions = getMockSportData("running");
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions[0]).toEqual(
      expect.objectContaining({
        date: expect.any(String),
        peakHeartRate: expect.any(Number),
        calories: expect.any(Number),
        steps: expect.any(Number),
      })
    );
  });

  it("returns padel sessions", () => {
    const sessions = getMockSportData("padel");
    expect(sessions.length).toBeGreaterThan(0);
  });

  it("returns empty array for unknown sport", () => {
    expect(getMockSportData("swimming")).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { readinessInsight, sleepInsight } from "@/lib/dashboardInsights";
import type { HealthEntryDoc } from "@/types/health";

function makeEntry(date: string, sleep: number | null): HealthEntryDoc {
  return {
    _id: date,
    date: new Date(`${date}T00:00:00.000Z`),
    activeCalories: null,
    cardioFitness: null,
    heartRate: null,
    hrv: null,
    restingHeartRate: null,
    sleep,
    steps: null,
  };
}

describe("dashboardInsights", () => {
  it("describes sleep using recent measured days instead of whole-history averages", () => {
    const entries = [
      makeEntry("2026-06-01", 360),
      makeEntry("2026-06-02", 390),
      makeEntry("2026-06-03", null),
      makeEntry("2026-06-04", 450),
      makeEntry("2026-06-05", 480),
    ];

    const insight = sleepInsight(entries, "all");

    expect(insight.summary).toContain("Recent sleep is 7.8 hrs");
    expect(insight.summary).toContain("2 measured days");
    expect(insight.trend).toContain("previous 2 measured days");
    expect(insight.trend).toContain("1.5 hrs");
  });

  it("explains readiness gaps when either HRV or sleep is missing", () => {
    const insight = readinessInsight(null, [], "30d");

    expect(insight.summary).toContain("both HRV and sleep measurements");
    expect(insight.trend).toContain("No readiness trend");
  });
});

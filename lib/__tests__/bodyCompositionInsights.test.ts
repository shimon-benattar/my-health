import { describe, it, expect } from "vitest";
import {
  assessMetric,
  bmrCrossCheck,
  buildBodyInsights,
  buildRecoveryLink,
  computeTrend,
  isEveningReading,
  selectComparable,
  type BodyProfile,
  type HealthContextEntry,
} from "@/lib/bodyCompositionInsights";
import { findRange } from "@/lib/bodyCompositionKnowledge";
import { BODY_METRIC_KEYS, type BodyMeasurement } from "@/types/body";

const profile: BodyProfile = { age: 47, sex: "male", heightCm: 177 };

function reading(iso: string, overrides: Partial<BodyMeasurement> = {}): BodyMeasurement {
  const base = Object.fromEntries(BODY_METRIC_KEYS.map((k) => [k, null])) as unknown as BodyMeasurement;
  return {
    ...base,
    measuredAt: iso,
    weightKg: 85,
    fatPct: 25.7,
    fatKg: 21.8,
    leanMassKg: 63.2,
    visceralFat: 15,
    bmr: 1757,
    bodyAge: 45,
    ...overrides,
  };
}

const sample = [
  reading("2026-10-15T19:55:00.000Z", { weightKg: 85.0 }),
  reading("2026-10-18T07:13:00.000Z", { weightKg: 84.35, fatPct: 25.4, fatKg: 21.4, leanMassKg: 62.9 }),
  reading("2026-10-25T07:18:00.000Z", { weightKg: 84.5, fatPct: 25.5, fatKg: 21.5, leanMassKg: 63.0 }),
  reading("2026-11-01T07:13:00.000Z", { weightKg: 85.1, fatPct: 25.7, fatKg: 21.9, leanMassKg: 63.2 }),
];

describe("selectComparable", () => {
  it("drops evening readings by default and keeps them on request", () => {
    expect(isEveningReading(sample[0].measuredAt)).toBe(true);
    expect(selectComparable(sample)).toHaveLength(3);
    expect(selectComparable(sample, true)).toHaveLength(4);
  });

  it("falls back to all readings when every reading is an evening one", () => {
    expect(selectComparable([sample[0]])).toHaveLength(1);
  });
});

describe("computeTrend", () => {
  const morning = selectComparable(sample);

  it("is insufficient with 1 or 2 readings but still reports deltas for 2", () => {
    expect(computeTrend(morning.slice(0, 1), "weightKg").direction).toBe("insufficient");
    const two = computeTrend(morning.slice(0, 2), "weightKg");
    expect(two.direction).toBe("insufficient");
    expect(two.deltaPrev).toBeCloseTo(0.15, 2);
  });

  it("calls sub-noise movement flat with 3 readings", () => {
    const t = computeTrend(morning, "weightKg");
    expect(t.direction).toBe("flat");
    expect(t.slopePerWeek).toBeNull();
  });

  it("detects a real change and computes a weekly slope from 5 readings", () => {
    const rows = [0, 1, 2, 3, 4].map((i) => reading(`2026-10-${String(1 + i * 7).padStart(2, "0")}T07:00:00.000Z`, { weightKg: 90 - i }));
    const t = computeTrend(rows, "weightKg");
    expect(t.direction).toBe("down");
    expect(t.slopePerWeek).toBeCloseTo(-1, 2);
  });

  it("ignores null values", () => {
    expect(computeTrend([reading("2026-10-01T07:00:00.000Z", { bmi: null })], "bmi").n).toBe(0);
  });
});

describe("assessMetric / ranges", () => {
  it("flags visceral fat of 15 as above range and body fat 25.7 as above the male 40-59 band", () => {
    const rows = selectComparable(sample);
    expect(assessMetric(rows, "visceralFat", profile).status).toBe("above");
    const fat = assessMetric(rows, "fatPct", profile);
    expect(fat.status).toBe("above");
    expect(fat.forMe).toMatch(/above the typical band/);
  });

  it("does not grade metrics without a reliable range", () => {
    expect(assessMetric(selectComparable(sample), "boneMassKg", profile).status).toBe("ungraded");
    expect(findRange("skeletalMusclePct", "male", 47)).toBeNull();
  });

  it("selects the age-appropriate range", () => {
    expect(findRange("fatPct", "male", 30)?.high).toBe(20);
    expect(findRange("fatPct", "male", 47)?.high).toBe(22);
  });
});

describe("bmrCrossCheck and insights", () => {
  it("matches Mifflin-St Jeor within a few percent for the sample user", () => {
    const check = bmrCrossCheck({ ...sample[3], weightKg: 85.1 }, profile);
    expect(check.mifflin).toBeCloseTo(1727.25, 1);
    expect(Math.abs(check.diffPct ?? 99)).toBeLessThan(3);
  });

  it("returns no insights for an empty list", () => {
    expect(buildBodyInsights([], profile)).toEqual([]);
  });

  it("reports stable composition and the excluded evening reading", () => {
    const blocks = buildBodyInsights(selectComparable(sample), profile, sample.length);
    const titles = blocks.map((b) => b.title);
    expect(titles).toContain("Visceral fat");
    expect(titles).toContain("Metabolism (BMR) cross-check");
    const composition = blocks.find((b) => b.title === "Weight and composition")!;
    expect(composition.trend).toMatch(/inside scale noise/);
    expect(blocks.find((b) => b.title === "Measurement quality")!.summary).toMatch(/1 evening reading excluded/);
  });

  it("handles a single reading without claiming a trend", () => {
    const blocks = buildBodyInsights([sample[3]], profile);
    expect(blocks.find((b) => b.title === "Weight and composition")!.trend).toMatch(/Too few readings/);
  });
});

describe("buildRecoveryLink", () => {
  const readings = [
    reading("2026-10-01T07:00:00.000Z"),
    reading("2026-10-29T07:00:00.000Z"),
  ];

  function days(startIso: string, count: number, make: (i: number) => Partial<HealthContextEntry>): HealthContextEntry[] {
    return Array.from({ length: count }, (_, i) => ({
      date: new Date(new Date(startIso).getTime() + i * 86400000).toISOString(),
      restingHeartRate: null, hrv: null, cardioFitness: null, activeCalories: null, sleep: null,
      ...make(i),
    }));
  }

  it("compares the windows ending at the first and latest reading and judges direction", () => {
    const entries = [
      ...days("2026-09-18T00:00:00.000Z", 14, () => ({ restingHeartRate: 60, hrv: { min: 30, max: 50 }, activeCalories: 500 })),
      ...days("2026-10-16T00:00:00.000Z", 14, () => ({ restingHeartRate: 56, hrv: { min: 30, max: 50 }, activeCalories: 700 })),
    ];
    const link = buildRecoveryLink(readings, entries)!;
    const rhr = link.rows.find((r) => r.key === "restingHeartRate")!;
    expect(rhr.before).toBeCloseTo(60);
    expect(rhr.after).toBeCloseTo(56);
    expect(rhr.favourable).toBe(true);
    expect(link.rows.find((r) => r.key === "hrv")!.favourable).toBeNull();
    expect(link.rows.find((r) => r.key === "activeCalories")!.favourable).toBeNull();
    expect(link.rows.find((r) => r.key === "sleep")).toBeUndefined();
  });

  it("flags an unfavourable move", () => {
    const entries = [
      ...days("2026-09-18T00:00:00.000Z", 14, () => ({ restingHeartRate: 55 })),
      ...days("2026-10-16T00:00:00.000Z", 14, () => ({ restingHeartRate: 60 })),
    ];
    expect(buildRecoveryLink(readings, entries)!.rows[0].favourable).toBe(false);
  });

  it("returns null with too little Apple Health data in a window", () => {
    const entries = days("2026-10-16T00:00:00.000Z", 14, () => ({ restingHeartRate: 56 }));
    expect(buildRecoveryLink(readings, entries)).toBeNull();
    expect(buildRecoveryLink(readings, [])).toBeNull();
  });

  it("returns null when the readings are under a week apart or there is only one", () => {
    const entries = days("2026-09-18T00:00:00.000Z", 60, () => ({ restingHeartRate: 56 }));
    expect(buildRecoveryLink([readings[0], reading("2026-10-05T07:00:00.000Z")], entries)).toBeNull();
    expect(buildRecoveryLink([readings[0]], entries)).toBeNull();
  });
});

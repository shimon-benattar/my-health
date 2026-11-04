import { describe, expect, it } from "vitest";
import { buildKmSplitsFromRoute } from "@/lib/parsers/routeSplits";

// ~111.19 m per 0.001 degree of latitude
const M_PER_DEG = 111_194.9;

function track(totalMeters: number, secondsPerKm: number, stepMeters = 10, startMs = Date.UTC(2026, 9, 28, 18, 40)) {
  const pts = [];
  for (let m = 0; m <= totalMeters; m += stepMeters) {
    pts.push({ lat: m / M_PER_DEG, lon: 0, time: new Date(startMs + (m / 1000) * secondsPerKm * 1000) });
  }
  return pts;
}

describe("buildKmSplitsFromRoute", () => {
  it("produces one split per km plus a partial remainder", () => {
    const splits = buildKmSplitsFromRoute(track(2500, 300), []);
    expect(splits.map((s) => s.kmIndex)).toEqual([1, 2, 3]);
    expect(splits[0].distanceKm).toBeCloseTo(1, 2);
    expect(splits[0].paceMinPerKm).toBeCloseTo(5, 1);
    expect(splits[2].distanceKm).toBeCloseTo(0.5, 1);
    expect(splits[2].paceMinPerKm).toBeCloseTo(5, 1);
  });

  it("returns ~10 splits for a 10 km run", () => {
    expect(buildKmSplitsFromRoute(track(10_000, 300), [])).toHaveLength(10);
  });

  it("excludes stationary pauses from duration", () => {
    const pts = track(1000, 300);
    const last = pts[pts.length - 1];
    const resumed = track(1000, 300, 10, last.time.getTime() + 5 * 60_000).map((p) => ({ ...p, lat: p.lat + last.lat }));
    const splits = buildKmSplitsFromRoute([...pts, ...resumed], []);
    expect(splits).toHaveLength(2);
    expect(splits[1].paceMinPerKm).toBeCloseTo(5, 1);
  });

  it("attaches avg/max heart rate from overlapping samples", () => {
    const pts = track(1000, 300);
    const hr = [{ start: pts[0].time, end: pts[pts.length - 1].time, value: 150 }];
    const [split] = buildKmSplitsFromRoute(pts, hr);
    expect(split.avgHeartRate).toBe(150);
    expect(split.maxHeartRate).toBe(150);
  });

  it("returns [] for too few points", () => {
    expect(buildKmSplitsFromRoute(track(0, 300), [])).toEqual([]);
  });
});

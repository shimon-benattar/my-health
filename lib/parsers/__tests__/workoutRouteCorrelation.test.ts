import { describe, it, expect } from "vitest";
import { correlateWorkoutsToRoutes } from "@/lib/parsers/workoutRouteCorrelation";

const workout = {
  workoutActivityType: "HKWorkoutActivityTypeRunning",
  startDate: new Date("2026-06-01T08:00:00.000Z"),
  endDate: new Date("2026-06-01T08:30:00.000Z"),
  durationMinutes: 30,
  totalEnergyBurned: 300,
  totalDistance: 5,
  sourceName: "Watch",
  sourceVersion: "10",
};

describe("correlateWorkoutsToRoutes", () => {
  it("matches the nearest route within tolerance", () => {
    const routes = [
      {
        routePath: "workout-routes/far.gpx",
        pointCount: 10,
        firstTimestamp: new Date("2026-06-01T10:00:00.000Z"),
        lastTimestamp: new Date("2026-06-01T10:30:00.000Z"),
        boundingBox: null,
        distanceEstimateMeters: null,
      },
      {
        routePath: "workout-routes/near.gpx",
        pointCount: 10,
        firstTimestamp: new Date("2026-06-01T08:01:00.000Z"),
        lastTimestamp: new Date("2026-06-01T08:29:00.000Z"),
        boundingBox: null,
        distanceEstimateMeters: null,
      },
    ];

    const [result] = correlateWorkoutsToRoutes([workout], routes);
    expect(result.matched).toBe(true);
    expect(result.route?.routePath).toBe("workout-routes/near.gpx");
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("marks workout unmatched when no routes overlap tolerance window", () => {
    const routes = [
      {
        routePath: "workout-routes/far.gpx",
        pointCount: 10,
        firstTimestamp: new Date("2026-06-01T12:00:00.000Z"),
        lastTimestamp: new Date("2026-06-01T12:30:00.000Z"),
        boundingBox: null,
        distanceEstimateMeters: null,
      },
    ];

    const [result] = correlateWorkoutsToRoutes([workout], routes);
    expect(result.matched).toBe(false);
    expect(result.route).toBeNull();
  });
});

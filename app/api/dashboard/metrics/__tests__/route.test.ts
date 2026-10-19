import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { connectDB, resetDBConnection } from "@/lib/db";
import { clearDashboardMetricsCache } from "@/lib/dashboardMetricsCache";

vi.mock("@/lib/db", () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
  resetDBConnection: vi.fn().mockResolvedValue(undefined),
}));

const mockLean = vi.fn();
const mockSort = vi.fn(() => ({ lean: mockLean }));
const mockFind = vi.fn(() => ({ sort: mockSort }));
const mockFindOneLean = vi.fn();
const mockFindOneSort = vi.fn(() => ({ lean: mockFindOneLean }));
const mockFindOne = vi.fn(() => ({ sort: mockFindOneSort }));

const mockWorkoutLean = vi.fn();
const mockWorkoutSort = vi.fn(() => ({ lean: mockWorkoutLean }));
const mockWorkoutFind = vi.fn(() => ({ sort: mockWorkoutSort }));
const mockWorkoutFindOneLean = vi.fn();
const mockWorkoutFindOneSort = vi.fn(() => ({ lean: mockWorkoutFindOneLean }));
const mockWorkoutFindOne = vi.fn(() => ({ sort: mockWorkoutFindOneSort }));

vi.mock("@/lib/models/HealthEntry", () => ({
  default: { find: mockFind, findOne: mockFindOne },
}));

vi.mock("@/lib/models/AppleHealthWorkout", () => ({
  default: { find: mockWorkoutFind, findOne: mockWorkoutFindOne },
}));

const mockFindOneAndUpdateProfile = vi.fn().mockResolvedValue({
  key: "primary",
  name: "Shimon",
  birthdate: "21/04/1979",
  weightKg: 85,
  heightCm: 177,
});

vi.mock("@/lib/models/UserProfile", () => ({
  default: { findOneAndUpdate: mockFindOneAndUpdateProfile },
}));

const { GET } = await import("@/app/api/dashboard/metrics/route");
const mockConnectDB = vi.mocked(connectDB);
const mockResetDBConnection = vi.mocked(resetDBConnection);

beforeEach(() => {
  vi.clearAllMocks();
  mockConnectDB.mockResolvedValue(undefined);
  mockResetDBConnection.mockResolvedValue(undefined);
  mockFindOneLean.mockResolvedValue(null);
  mockWorkoutFindOneLean.mockResolvedValue(null);
  return clearDashboardMetricsCache();
});

function makeRequest(url: string) {
  return new NextRequest(url);
}

describe("GET /api/dashboard/metrics", () => {
  it("returns 200 with default range and readiness", async () => {
    mockLean.mockResolvedValue([
      {
        date: new Date("2026-06-03"),
        hrv: { min: 30, max: 50 },
        sleep: 420,
        recoveryMetrics: {
          hrvRmssd: { avg: 42, min: 39, max: 45 },
          sleepingWristTemperature: 35.6,
        },
        vitalityMetrics: {
          timeInDaylightMinutes: 22,
        },
      },
      { date: new Date("2026-06-02"), hrv: { min: 28, max: 45 }, sleep: 390 },
    ]);
    mockWorkoutLean.mockResolvedValue([
      {
        _id: "w1",
        externalId: "run-1",
        workoutType: "HKWorkoutActivityTypeRunning",
        startDate: new Date("2026-06-03T08:00:00.000Z"),
        endDate: new Date("2026-06-03T08:30:00.000Z"),
        durationMinutes: 30,
        totalEnergyBurned: 300,
        totalDistance: 5,
        effort: { workoutEffortScore: 8 },
      },
    ]);

    const res = await GET(makeRequest("http://localhost:3000/api/dashboard/metrics"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(Array.isArray(body.entries)).toBe(true);
    expect(body.readiness).toBeGreaterThanOrEqual(0);
    expect(body.readiness).toBeLessThanOrEqual(100);
    expect(body.recentWatchMetricsAvailability.hrvRmssd.firstDate).toBe("2026-06-03");
    expect(body.recentWatchMetricsAvailability.workoutEffortScore.sampleCount).toBe(1);
    expect(mockFind).toHaveBeenCalledWith(expect.objectContaining({ date: expect.any(Object) }));
  });

  it("applies sportType filter when provided", async () => {
    mockLean.mockResolvedValue([]);
    mockWorkoutLean.mockResolvedValue([]);

    const res = await GET(makeRequest("http://localhost:3000/api/dashboard/metrics?sportType=running&range=7d"));
    expect(res.status).toBe(200);
    expect(mockFind).toHaveBeenCalledWith(expect.objectContaining({ sportType: "running" }));
    expect(mockWorkoutFind).toHaveBeenCalledWith(expect.objectContaining({ workoutType: expect.any(Object) }));
  });

  it("returns 200 with empty entries for unknown sport", async () => {
    mockLean.mockResolvedValue([]);
    mockWorkoutLean.mockResolvedValue([]);

    const res = await GET(makeRequest("http://localhost:3000/api/dashboard/metrics?sportType=padel"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries).toEqual([]);
    expect(body.readiness).toBe(0);
  });

  it("returns 500 when database query fails", async () => {
    mockLean.mockRejectedValue(new Error("db down"));
    mockWorkoutLean.mockResolvedValue([]);
    const res = await GET(makeRequest("http://localhost:3000/api/dashboard/metrics"));
    expect(res.status).toBe(500);
  });

  it("returns 503 when database connection is unavailable", async () => {
    mockConnectDB.mockRejectedValueOnce(new Error("Could not connect to any servers in your MongoDB Atlas cluster."));
    mockConnectDB.mockRejectedValueOnce(new Error("Could not connect to any servers in your MongoDB Atlas cluster."));
    const res = await GET(makeRequest("http://localhost:3000/api/dashboard/metrics"));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe("database_unavailable");
    expect(mockResetDBConnection).toHaveBeenCalledTimes(1);
  });

  it("retries once after a transient database availability error during query", async () => {
    const transientError = Object.assign(new Error("Socket 'secureConnect' timed out after 30000ms"), {
      name: "MongoServerSelectionError",
    });

    mockLean
      .mockRejectedValueOnce(transientError)
      .mockResolvedValueOnce([
        { date: new Date("2026-06-03"), hrv: { min: 30, max: 50 }, sleep: 420 },
      ]);
    mockWorkoutLean.mockResolvedValue([
      {
        _id: "w1",
        externalId: "run-1",
        workoutType: "HKWorkoutActivityTypeRunning",
        startDate: new Date("2026-06-03T08:00:00.000Z"),
        endDate: new Date("2026-06-03T08:30:00.000Z"),
        durationMinutes: 30,
        totalEnergyBurned: 300,
        totalDistance: 5,
      },
    ]);

    const res = await GET(makeRequest("http://localhost:3000/api/dashboard/metrics"));
    expect(res.status).toBe(200);
    expect(mockResetDBConnection).toHaveBeenCalledTimes(1);
    expect(mockConnectDB).toHaveBeenCalledTimes(2);
  });

  it("retries after the initial-connection race instead of returning a generic 500", async () => {
    const transientError = new Error(
      "Cannot call `healthentries.find()` before initial connection is complete if `bufferCommands = false`."
    );

    mockLean
      .mockRejectedValueOnce(transientError)
      .mockResolvedValueOnce([
        { date: new Date("2026-06-03"), hrv: { min: 30, max: 50 }, sleep: 420 },
      ]);
    mockWorkoutLean.mockResolvedValue([
      {
        _id: "w1",
        externalId: "run-1",
        workoutType: "HKWorkoutActivityTypeRunning",
        startDate: new Date("2026-06-03T08:00:00.000Z"),
        endDate: new Date("2026-06-03T08:30:00.000Z"),
        durationMinutes: 30,
        totalEnergyBurned: 300,
        totalDistance: 5,
      },
    ]);

    const res = await GET(makeRequest("http://localhost:3000/api/dashboard/metrics?range=all&refresh=1"));
    expect(res.status).toBe(200);
    expect(mockResetDBConnection).toHaveBeenCalledTimes(1);
    expect(mockConnectDB).toHaveBeenCalledTimes(2);
  });

  it("returns cached payload immediately when a prior success exists for the same request", async () => {
    mockLean.mockResolvedValueOnce([
      { date: new Date("2026-06-03"), hrv: { min: 30, max: 50 }, sleep: 420 },
    ]);
    mockWorkoutLean.mockResolvedValueOnce([]);

    const firstRes = await GET(makeRequest("http://localhost:3000/api/dashboard/metrics?range=all"));
    expect(firstRes.status).toBe(200);

    const transientError = Object.assign(new Error("Socket 'secureConnect' timed out after 30000ms"), {
      name: "MongoServerSelectionError",
    });

    const secondRes = await GET(makeRequest("http://localhost:3000/api/dashboard/metrics?range=all"));
    expect(secondRes.status).toBe(200);
    const body = await secondRes.json();
    expect(body.stale).toBeUndefined();
    expect(Array.isArray(body.entries)).toBe(true);
    expect(secondRes.headers.get("x-dashboard-cache")).toBe("hit");
  });

  it("includes the database-unavailable reason when serving a stale cached snapshot", async () => {
    mockLean.mockResolvedValueOnce([
      { date: new Date("2026-06-03"), hrv: { min: 30, max: 50 }, sleep: 420 },
    ]);
    mockWorkoutLean.mockResolvedValueOnce([]);

    const firstRes = await GET(makeRequest("http://localhost:3000/api/dashboard/metrics?range=all&refresh=1"));
    expect(firstRes.status).toBe(200);

    const unavailableError = Object.assign(
      new Error("Could not connect to any servers in your MongoDB Atlas cluster."),
      { name: "MongooseServerSelectionError" }
    );

    mockConnectDB.mockRejectedValueOnce(unavailableError);
    mockConnectDB.mockRejectedValueOnce(unavailableError);

    const cachedRes = await GET(makeRequest("http://localhost:3000/api/dashboard/metrics?range=all&refresh=1"));
    expect(cachedRes.status).toBe(200);
    const body = await cachedRes.json();
    expect(body.stale).toBe(true);
    expect(body.staleCode).toBe("database_unavailable");
    expect(body.staleReason).toMatch(/MongoDB Atlas connectivity or IP allowlist/i);
  });

  it("derives filtered range responses from the cached full snapshot without touching the database", async () => {
    const recentDay = new Date();
    recentDay.setUTCDate(recentDay.getUTCDate() - 2);
    recentDay.setUTCHours(0, 0, 0, 0);
    const oldDay = new Date("2026-01-01T00:00:00.000Z");
    const recentWorkoutStart = new Date(recentDay);
    recentWorkoutStart.setUTCHours(8, 0, 0, 0);
    const recentWorkoutEnd = new Date(recentWorkoutStart);
    recentWorkoutEnd.setUTCMinutes(recentWorkoutEnd.getUTCMinutes() + 30);

    mockLean.mockResolvedValueOnce([
      { date: recentDay, hrv: { min: 30, max: 50 }, sleep: 420 },
      { date: oldDay, hrv: { min: 20, max: 30 }, sleep: 300 },
    ]);
    mockWorkoutLean.mockResolvedValueOnce([
      {
        _id: "w1",
        externalId: "run-recent",
        workoutType: "HKWorkoutActivityTypeRunning",
        startDate: recentWorkoutStart,
        endDate: recentWorkoutEnd,
        durationMinutes: 30,
        totalEnergyBurned: 300,
        totalDistance: 5,
      },
      {
        _id: "w2",
        externalId: "run-old",
        workoutType: "HKWorkoutActivityTypeRunning",
        startDate: new Date("2026-01-01T08:00:00.000Z"),
        endDate: new Date("2026-01-01T08:30:00.000Z"),
        durationMinutes: 30,
        totalEnergyBurned: 300,
        totalDistance: 5,
      },
    ]);

    const allRes = await GET(makeRequest("http://localhost:3000/api/dashboard/metrics?range=all"));
    expect(allRes.status).toBe(200);

    vi.clearAllMocks();

    const rangedRes = await GET(makeRequest("http://localhost:3000/api/dashboard/metrics?range=7d"));
    expect(rangedRes.status).toBe(200);
    expect(rangedRes.headers.get("x-dashboard-cache")).toBe("hit");
    const body = await rangedRes.json();
    expect(body.entries).toHaveLength(1);
    expect(body.workouts).toHaveLength(1);
    expect(mockConnectDB).not.toHaveBeenCalled();
    expect(mockFind).not.toHaveBeenCalled();
    expect(mockWorkoutFind).not.toHaveBeenCalled();
  });
});

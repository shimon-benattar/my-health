import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }));

const mockLean = vi.fn();
const mockSort = vi.fn(() => ({ lean: mockLean }));
const mockFind = vi.fn(() => ({ sort: mockSort }));

const mockWorkoutLean = vi.fn();
const mockWorkoutSort = vi.fn(() => ({ lean: mockWorkoutLean }));
const mockWorkoutFind = vi.fn(() => ({ sort: mockWorkoutSort }));

vi.mock("@/lib/models/HealthEntry", () => ({
  default: { find: mockFind },
}));

vi.mock("@/lib/models/AppleHealthWorkout", () => ({
  default: { find: mockWorkoutFind },
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

beforeEach(() => {
  vi.clearAllMocks();
});

function makeRequest(url: string) {
  return new NextRequest(url);
}

describe("GET /api/dashboard/metrics", () => {
  it("returns 200 with default range and readiness", async () => {
    mockLean.mockResolvedValue([
      { date: new Date("2026-06-03"), hrv: { min: 30, max: 50 }, sleep: 420 },
      { date: new Date("2026-06-02"), hrv: { min: 28, max: 45 }, sleep: 390 },
    ]);
    mockWorkoutLean.mockResolvedValue([]);

    const res = await GET(makeRequest("http://localhost:3000/api/dashboard/metrics"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(Array.isArray(body.entries)).toBe(true);
    expect(body.readiness).toBeGreaterThanOrEqual(0);
    expect(body.readiness).toBeLessThanOrEqual(100);
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
});

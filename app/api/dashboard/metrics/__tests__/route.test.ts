import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }));

const mockLean = vi.fn();
const mockSort = vi.fn(() => ({ lean: mockLean }));
const mockFind = vi.fn(() => ({ sort: mockSort }));

vi.mock("@/lib/models/HealthEntry", () => ({
  default: { find: mockFind },
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

    const res = await GET(makeRequest("http://localhost:3000/api/dashboard/metrics?sportType=running&range=7d"));
    expect(res.status).toBe(200);
    expect(mockFind).toHaveBeenCalledWith(expect.objectContaining({ sportType: "running" }));
  });

  it("returns 200 with empty entries for unknown sport", async () => {
    mockLean.mockResolvedValue([]);

    const res = await GET(makeRequest("http://localhost:3000/api/dashboard/metrics?sportType=padel"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries).toEqual([]);
    expect(body.readiness).toBe(0);
  });

  it("returns 500 when database query fails", async () => {
    mockLean.mockRejectedValue(new Error("db down"));
    const res = await GET(makeRequest("http://localhost:3000/api/dashboard/metrics"));
    expect(res.status).toBe(500);
  });
});

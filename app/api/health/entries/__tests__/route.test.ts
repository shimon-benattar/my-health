import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }));

const mockFind = vi.fn();
vi.mock("@/lib/models/HealthEntry", () => ({
  default: {
    find: vi.fn(() => ({ sort: vi.fn(() => ({ lean: mockFind })) })),
  },
}));

const { GET } = await import("@/app/api/health/entries/route");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/health/entries", () => {
  it("returns 200 with sorted entries", async () => {
    const fakeEntries = [
      { date: new Date("2026-06-02"), steps: 6313 },
      { date: new Date("2026-06-01"), steps: 9565 },
    ];
    mockFind.mockResolvedValue(fakeEntries);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(JSON.parse(JSON.stringify(fakeEntries)));
  });

  it("returns 200 with empty array when no entries exist", async () => {
    mockFind.mockResolvedValue([]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("returns 500 on DB error", async () => {
    mockFind.mockRejectedValue(new Error("Connection lost"));

    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/internal server error/i);
  });
});

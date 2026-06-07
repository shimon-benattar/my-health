import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }));

const mockFindOneAndUpdate = vi.fn();
vi.mock("@/lib/models/UserProfile", () => ({
  default: { findOneAndUpdate: mockFindOneAndUpdate },
}));

const { GET, PATCH } = await import("@/app/api/profile/route");

function makeJsonRequest(body: unknown): NextRequest {
  return {
    json: vi.fn().mockResolvedValue(body),
  } as unknown as NextRequest;
}

describe("/api/profile route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET returns profile document", async () => {
    mockFindOneAndUpdate.mockResolvedValue({
      key: "primary",
      name: "Shimon",
      birthdate: "21/04/1979",
      weightKg: 85,
      heightCm: 177,
      timezone: "Asia/Jerusalem",
    });

    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.name).toBe("Shimon");
    expect(mockFindOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  it("PATCH returns 400 for invalid imageUrl type instead of 500", async () => {
    const res = await PATCH(
      makeJsonRequest({
        imageUrl: 42,
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid image url/i);
    expect(body.code).toBe("PROFILE_INVALID_IMAGE_URL");
    expect(typeof body.requestId).toBe("string");
  });

  it("PATCH returns 400 for invalid notes type instead of 500", async () => {
    const res = await PATCH(
      makeJsonRequest({
        notes: { bad: true },
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid notes/i);
    expect(body.code).toBe("PROFILE_INVALID_NOTES");
    expect(typeof body.requestId).toBe("string");
  });

  it("PATCH normalizes ISO birthdate and updates profile", async () => {
    mockFindOneAndUpdate.mockResolvedValue({
      key: "primary",
      name: "Alice",
      birthdate: "07/06/2026",
      weightKg: 70.5,
      heightCm: 168,
      imageUrl: null,
      sex: "female",
      timezone: "Asia/Jerusalem",
      notes: null,
    });

    const res = await PATCH(
      makeJsonRequest({
        name: "  Alice  ",
        birthdate: "2026-06-07",
        weightKg: 70.52,
        heightCm: 167.7,
        timezone: "  Asia/Jerusalem ",
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.birthdate).toBe("07/06/2026");
    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { key: "primary" },
      expect.objectContaining({
        $set: expect.objectContaining({
          name: "Alice",
          birthdate: "07/06/2026",
          weightKg: 70.5,
          heightCm: 168,
          timezone: "Asia/Jerusalem",
        }),
      }),
      expect.any(Object)
    );
  });

  it("PATCH returns structured 500 error with requestId on DB failure", async () => {
    mockFindOneAndUpdate.mockRejectedValue(new Error("DB timeout"));

    const res = await PATCH(
      makeJsonRequest({
        name: "Valid Name",
      })
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/failed to save profile/i);
    expect(body.code).toBe("PROFILE_PATCH_FAILED");
    expect(typeof body.requestId).toBe("string");
    expect(JSON.stringify(body)).not.toMatch(/timeout/i);
  });
});

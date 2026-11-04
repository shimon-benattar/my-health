import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { buildSampleScaleXlsx } from "@/lib/parsers/__tests__/scaleFixture";

vi.mock("@/lib/db", () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }));

const mockBulkWrite = vi.fn();
const mockLean = vi.fn();
const mockFind = vi.fn(() => ({ sort: vi.fn(() => ({ lean: mockLean })) }));
vi.mock("@/lib/models/BodyMeasurement", () => ({
  default: { bulkWrite: mockBulkWrite, find: mockFind },
}));

const { POST } = await import("@/app/api/body/import/route");
const { GET } = await import("@/app/api/body/measurements/route");
const { connectDB } = await import("@/lib/db");

function importRequest(file: File | null) {
  const fd = new FormData();
  if (file) fd.append("file", file);
  return { formData: vi.fn().mockResolvedValue(fd) } as unknown as NextRequest;
}

async function sampleFile(name = "scale.xlsx") {
  return new File([await buildSampleScaleXlsx()], name);
}

function getRequest(query = "") {
  return new NextRequest(`http://localhost/api/body/measurements${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockBulkWrite.mockResolvedValue({ upsertedCount: 3, modifiedCount: 1 });
});

describe("POST /api/body/import", () => {
  it("imports the sample workbook and reports counts", async () => {
    const res = await POST(importRequest(await sampleFile()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ total: 4, inserted: 3, updated: 1, meta: { sex: "male", age: 47, heightCm: 177 } });
    const ops = mockBulkWrite.mock.calls[0][0];
    expect(ops).toHaveLength(4);
    expect(ops[0].updateOne.upsert).toBe(true);
    expect(ops[0].updateOne.update.$set.scaleSex).toBe("male");
  });

  it("returns 400 when no file is provided", async () => {
    const res = await POST(importRequest(null));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "BODY_NO_FILE" });
  });

  it("rejects non-xlsx files", async () => {
    const res = await POST(importRequest(new File(["a,b"], "scale.csv")));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "BODY_INVALID_TYPE" });
  });

  it("rejects empty files", async () => {
    const res = await POST(importRequest(new File([], "scale.xlsx")));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "BODY_EMPTY_FILE" });
  });

  it("returns 422 with a stable error shape for a corrupt workbook", async () => {
    const res = await POST(importRequest(new File(["not a zip"], "scale.xlsx")));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toMatchObject({ code: "BODY_INVALID_XLSX" });
    expect(body.requestId).toBeTruthy();
    expect(mockBulkWrite).not.toHaveBeenCalled();
  });

  it("returns 503 when the database is unavailable", async () => {
    const err = new Error("could not connect to any servers");
    vi.mocked(connectDB).mockRejectedValueOnce(err);
    const res = await POST(importRequest(await sampleFile()));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "database_unavailable" });
  });

  it("returns 500 without leaking details on unexpected errors", async () => {
    mockBulkWrite.mockRejectedValueOnce(new Error("secret mongodb://user:pass@host"));
    const res = await POST(importRequest(await sampleFile()));
    expect(res.status).toBe(500);
    const text = JSON.stringify(await res.json());
    expect(text).toContain("BODY_IMPORT_FAILED");
    expect(text).not.toContain("pass@host");
  });
});

describe("GET /api/body/measurements", () => {
  it("returns serialised measurements with evening flag and scale profile", async () => {
    mockLean.mockResolvedValue([
      { measuredAt: new Date("2026-10-15T19:55:00Z"), weightKg: 85, scaleSex: "male", scaleHeightCm: 177 },
      { measuredAt: new Date("2026-11-01T07:13:00Z"), weightKg: 85.1, scaleSex: "male", scaleHeightCm: 177 },
    ]);
    const res = await GET(getRequest("?range=all"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.measurements).toHaveLength(2);
    expect(body.measurements[0].isEvening).toBe(true);
    expect(body.measurements[1].isEvening).toBe(false);
    expect(body.measurements[1].fatPct).toBeNull();
    expect(body.scaleProfile).toEqual({ sex: "male", heightCm: 177 });
  });

  it("applies a date filter for a bounded range", async () => {
    mockLean.mockResolvedValue([]);
    await GET(getRequest("?range=30d"));
    const filter = mockFind.mock.calls[0][0] as { measuredAt?: { $gte: Date } };
    expect(filter.measuredAt?.$gte).toBeInstanceOf(Date);
  });

  it("rejects an invalid range", async () => {
    const res = await GET(getRequest("?range=1y"));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "BODY_INVALID_RANGE" });
  });

  it("returns 500 on database failure", async () => {
    mockLean.mockRejectedValue(new Error("boom"));
    const res = await GET(getRequest());
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ code: "BODY_FETCH_FAILED" });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mock mongoose and DB helpers before importing the route
// ---------------------------------------------------------------------------
vi.mock("@/lib/db", () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }));

const mockFindOneAndUpdate = vi.fn();
vi.mock("@/lib/models/HealthEntry", () => ({
  default: { findOneAndUpdate: mockFindOneAndUpdate },
}));

// Import route AFTER mocks are set up
const { POST } = await import("@/app/api/health/upload/route");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const VALID_CSV = [
  `"Date","Active Calories" (kcal),"Cardio Fitness" (mL/min·kg),"Heart Rate" (bpm),"Heart Rate Variability" (ms),"Resting Heart Rate" (bpm),"Sleep","Steps" (steps)`,
  `02/05/2026,449,-,46-105,21.55-64.63,52,5h 8m,6313`,
  `03/05/2026,700,-,45-110,20-70,50,7h,9000`,
].join("\n");

const EMPTY_CSV = `"Date","Active Calories" (kcal),"Cardio Fitness" (mL/min·kg),"Heart Rate" (bpm),"Heart Rate Variability" (ms),"Resting Heart Rate" (bpm),"Sleep","Steps" (steps)`;

/**
 * Builds a mock NextRequest whose formData() resolves to a FormData containing
 * the given CSV text. This sidesteps Node.js multipart serialisation issues.
 */
function makeRequest(csvContent: string, filename = "export.csv") {
  const file = new File([csvContent], filename, { type: "text/csv" });
  const fd = new FormData();
  fd.append("file", file);
  return {
    formData: vi.fn().mockResolvedValue(fd),
  } as unknown as NextRequest;
}

function makeEmptyBodyRequest() {
  return {
    formData: vi.fn().mockResolvedValue(new FormData()),
  } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// POST /api/health/upload
// ---------------------------------------------------------------------------
describe("POST /api/health/upload", () => {
  it("returns 400 when no file is provided", async () => {
    const res = await POST(makeEmptyBodyRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no file/i);
  });

  it("returns 422 when CSV has no valid rows", async () => {
    const res = await POST(makeRequest(EMPTY_CSV));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/no valid rows/i);
  });

  it("returns 200 with inserted count for new rows", async () => {
    // findOneAndUpdate returns null → new insert
    mockFindOneAndUpdate.mockResolvedValue(null);

    const res = await POST(makeRequest(VALID_CSV));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.inserted).toBe(2);
    expect(body.updated).toBe(0);
    expect(body.skipped).toBe(0);
    expect(body.dateRange).toEqual({ from: "2026-05-02", to: "2026-05-03" });
  });

  it("returns 200 with updated count for existing rows (always overrides)", async () => {
    // findOneAndUpdate returns existing doc → always updated
    mockFindOneAndUpdate.mockResolvedValue({
      activeCalories: 449,
      cardioFitness: null,
      restingHeartRate: 52,
      sleep: 308,
      steps: 6313,
    });

    const singleRowCsv = [
      `"Date","Active Calories" (kcal),"Cardio Fitness" (mL/min·kg),"Heart Rate" (bpm),"Heart Rate Variability" (ms),"Resting Heart Rate" (bpm),"Sleep","Steps" (steps)`,
      `02/05/2026,449,-,46-105,21.55-64.63,52,5h 8m,6313`,
    ].join("\n");

    const res = await POST(makeRequest(singleRowCsv));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated).toBe(1);
    expect(body.inserted).toBe(0);
    expect(body.skipped).toBe(0);
    expect(body.dateRange).toEqual({ from: "2026-05-02", to: "2026-05-02" });
  });

  it("returns 200 with mix of inserted and updated for partial overlap", async () => {
    // First row exists, second is new
    mockFindOneAndUpdate
      .mockResolvedValueOnce({ activeCalories: 449 }) // existing → updated
      .mockResolvedValueOnce(null);                   // new → inserted

    const res = await POST(makeRequest(VALID_CSV));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.inserted).toBe(1);
    expect(body.updated).toBe(1);
    expect(body.dateRange).toEqual({ from: "2026-05-02", to: "2026-05-03" });
  });

  it("returns 500 on unexpected DB error", async () => {
    mockFindOneAndUpdate.mockRejectedValue(new Error("DB timeout"));
    const res = await POST(makeRequest(VALID_CSV));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/internal server error/i);
  });
});

// ---------------------------------------------------------------------------
// Security — POST /api/health/upload
// ---------------------------------------------------------------------------
describe("POST /api/health/upload — security", () => {
  it("returns 400 when file has a non-CSV extension (.exe)", async () => {
    const req = {
      formData: vi.fn().mockResolvedValue(
        (() => {
          const fd = new FormData();
          fd.append("file", new File(["payload"], "malware.exe", { type: "application/octet-stream" }));
          return fd;
        })()
      ),
    } as unknown as NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/only csv/i);
  });

  it("returns 400 when file has a .php extension", async () => {
    const req = {
      formData: vi.fn().mockResolvedValue(
        (() => {
          const fd = new FormData();
          fd.append("file", new File(["<?php echo 1; ?>"], "shell.php", { type: "text/php" }));
          return fd;
        })()
      ),
    } as unknown as NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/only csv/i);
  });

  it("returns 400 when file has a .json extension", async () => {
    const req = {
      formData: vi.fn().mockResolvedValue(
        (() => {
          const fd = new FormData();
          fd.append("file", new File(['{"key":"value"}'], "data.json", { type: "application/json" }));
          return fd;
        })()
      ),
    } as unknown as NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("accepts a CSV file regardless of MIME type (extension check only)", async () => {
    mockFindOneAndUpdate.mockResolvedValue(null);
    const req = {
      formData: vi.fn().mockResolvedValue(
        (() => {
          const fd = new FormData();
          // Same VALID_CSV content but with application/octet-stream MIME
          fd.append("file", new File([VALID_CSV], "export.csv", { type: "application/octet-stream" }));
          return fd;
        })()
      ),
    } as unknown as NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("response never includes MongoDB connection string or stack trace", async () => {
    mockFindOneAndUpdate.mockRejectedValue(new Error("mongodb+srv://user:pass@cluster"));
    const res = await POST(makeRequest(VALID_CSV));
    const body = await res.json();
    // Internal error message must not leak connection details
    expect(JSON.stringify(body)).not.toMatch(/mongodb\+srv/i);
    expect(JSON.stringify(body)).not.toMatch(/password/i);
  });
});

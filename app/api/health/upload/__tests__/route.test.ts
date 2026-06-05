import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import JSZip from "jszip";

// ---------------------------------------------------------------------------
// Mock mongoose and DB helpers before importing the route
// ---------------------------------------------------------------------------
vi.mock("@/lib/db", () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }));

const mockFindOne = vi.fn();
const mockCreate = vi.fn();
const mockUpdateOne = vi.fn();
const mockBackupCreate = vi.fn();
const mockImportLogCreate = vi.fn();
const mockImportLogUpdateOne = vi.fn();
vi.mock("@/lib/models/HealthEntry", () => ({
  default: { findOne: mockFindOne, create: mockCreate, updateOne: mockUpdateOne },
}));
vi.mock("@/lib/models/HealthEntryBackup", () => ({ default: { create: mockBackupCreate } }));
vi.mock("@/lib/models/ImportLog", () => ({ default: { create: mockImportLogCreate, updateOne: mockImportLogUpdateOne } }));

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
async function makeRequest(csvContent: string, filename = "export.zip") {
  const zip = new JSZip();
  zip.file("HealthExport.csv", csvContent);
  const zipBytes = await zip.generateAsync({ type: "uint8array" });
  const file = new File([zipBytes], filename, { type: "application/zip" });
  const fd = new FormData();
  fd.append("file", file);
  return {
    formData: vi.fn().mockResolvedValue(fd),
  } as unknown as NextRequest;
}

async function makeZipRequest(files: Array<{ name: string; content: string }>, filename = "export.zip") {
  const zip = new JSZip();
  for (const entry of files) {
    zip.file(entry.name, entry.content);
  }
  const zipBytes = await zip.generateAsync({ type: "uint8array" });
  const file = new File([zipBytes], filename, { type: "application/zip" });
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
  mockCreate.mockResolvedValue(undefined);
  mockUpdateOne.mockResolvedValue({ acknowledged: true, modifiedCount: 1 });
  mockBackupCreate.mockResolvedValue(undefined);
  mockImportLogCreate.mockResolvedValue(undefined);
  mockImportLogUpdateOne.mockResolvedValue({ acknowledged: true, modifiedCount: 1 });
});

function mockFindOneLeanSequence(values: Array<Record<string, unknown> | null>) {
  values.forEach((value) => {
    mockFindOne.mockReturnValueOnce({ lean: vi.fn().mockResolvedValue(value) });
  });
}

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
    const res = await POST(await makeRequest(EMPTY_CSV));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/no valid rows/i);
  });

  it("returns 422 when zip does not contain a CSV", async () => {
    const req = await makeZipRequest([{ name: "export.xml", content: "<HealthData />" }]);
    const res = await POST(req);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/supports csv packaged in zip/i);
  });

  it("returns 200 with inserted count for new rows", async () => {
    mockFindOneLeanSequence([null, null]);

    const res = await POST(await makeRequest(VALID_CSV));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.inserted).toBe(2);
    expect(body.updated).toBe(0);
    expect(body.unchanged).toBe(0);
    expect(body.skipped).toBe(0);
    expect(body.dateRange).toEqual({ from: "2026-05-02", to: "2026-05-03" });
    expect(body.pulled).toHaveLength(2);
  });

  it("returns unchanged count when incoming row matches existing data", async () => {
    mockFindOneLeanSequence([
      {
        _id: "x1",
        date: new Date("2026-05-02T00:00:00.000Z"),
        sportType: null,
        workoutType: null,
        workoutDurationMinutes: null,
        activeCalories: 449,
        cardioFitness: null,
        heartRate: { min: 46, max: 105 },
        hrv: { min: 21.55, max: 64.63 },
        restingHeartRate: 52,
        sleep: 308,
        steps: 6313,
      },
    ]);

    const singleRowCsv = [
      `"Date","Active Calories" (kcal),"Cardio Fitness" (mL/min·kg),"Heart Rate" (bpm),"Heart Rate Variability" (ms),"Resting Heart Rate" (bpm),"Sleep","Steps" (steps)`,
      `02/05/2026,449,-,46-105,21.55-64.63,52,5h 8m,6313`,
    ].join("\n");

    const res = await POST(await makeRequest(singleRowCsv));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated).toBe(0);
    expect(body.inserted).toBe(0);
    expect(body.unchanged).toBe(1);
    expect(body.skipped).toBe(0);
    expect(body.dateRange).toBeNull();
    expect(body.pulled).toHaveLength(0);
    expect(mockBackupCreate).not.toHaveBeenCalled();
    expect(mockUpdateOne).not.toHaveBeenCalled();
  });

  it("returns 200 with mix of inserted and updated for partial overlap", async () => {
    mockFindOneLeanSequence([
      {
        _id: "existing-1",
        date: new Date("2026-05-02T00:00:00.000Z"),
        sportType: null,
        workoutType: null,
        workoutDurationMinutes: null,
        activeCalories: 111,
        cardioFitness: null,
        heartRate: { min: 46, max: 105 },
        hrv: { min: 21.55, max: 64.63 },
        restingHeartRate: 52,
        sleep: 308,
        steps: 6313,
      },
      null,
    ]);

    const res = await POST(await makeRequest(VALID_CSV));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.inserted).toBe(1);
    expect(body.updated).toBe(1);
    expect(body.unchanged).toBe(0);
    expect(body.dateRange).toEqual({ from: "2026-05-02", to: "2026-05-03" });
    expect(body.pulled).toHaveLength(2);
    expect(mockBackupCreate).toHaveBeenCalledTimes(1);
  });

  it("returns 500 on unexpected DB error", async () => {
    mockFindOne.mockReturnValue({ lean: vi.fn().mockRejectedValue(new Error("DB timeout")) });
    const res = await POST(await makeRequest(VALID_CSV));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/internal server error/i);
  });
});

// ---------------------------------------------------------------------------
// Security — POST /api/health/upload
// ---------------------------------------------------------------------------
describe("POST /api/health/upload — security", () => {
  it("returns 400 when file has a non-ZIP extension (.exe)", async () => {
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
    expect(body.error).toMatch(/only zip/i);
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
    expect(body.error).toMatch(/only zip/i);
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

  it("accepts a ZIP file regardless of MIME type (extension check only)", async () => {
    mockFindOneLeanSequence([null, null]);
    const req = await makeRequest(VALID_CSV, "export.zip");
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("returns 400 when zip is not used even if content might be CSV", async () => {
    const req = {
      formData: vi.fn().mockResolvedValue(
        (() => {
          const fd = new FormData();
          fd.append("file", new File([VALID_CSV], "export.csv", { type: "application/octet-stream" }));
          return fd;
        })()
      ),
    } as unknown as NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("response never includes MongoDB connection string or stack trace", async () => {
    mockFindOne.mockReturnValue({ lean: vi.fn().mockRejectedValue(new Error("mongodb+srv://user:pass@cluster")) });
    const res = await POST(await makeRequest(VALID_CSV));
    const body = await res.json();
    // Internal error message must not leak connection details
    expect(JSON.stringify(body)).not.toMatch(/mongodb\+srv/i);
    expect(JSON.stringify(body)).not.toMatch(/password/i);
  });
});

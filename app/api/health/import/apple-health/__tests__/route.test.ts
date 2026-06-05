import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import JSZip from "jszip";

vi.mock("@/lib/db", () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }));

const mockFindOne = vi.fn();
const mockCreate = vi.fn();
const mockUpdateOne = vi.fn();
const mockBulkWrite = vi.fn();
const mockImportCreate = vi.fn();
const mockImportUpdateOne = vi.fn();
const mockWorkoutUpdateOne = vi.fn();
const mockWorkoutBulkWrite = vi.fn();

vi.mock("@/lib/models/HealthEntry", () => ({
  default: { findOne: mockFindOne, create: mockCreate, updateOne: mockUpdateOne, bulkWrite: mockBulkWrite },
}));
vi.mock("@/lib/models/ImportLog", () => ({
  default: { create: mockImportCreate, updateOne: mockImportUpdateOne },
}));
vi.mock("@/lib/models/AppleHealthWorkout", () => ({
  default: { updateOne: mockWorkoutUpdateOne, bulkWrite: mockWorkoutBulkWrite },
}));

const mockParseAppleHealthXmlStream = vi.fn();
const mockParseGpxRoute = vi.fn();
const mockCorrelate = vi.fn();

vi.mock("@/lib/parsers/appleHealthXmlParser", () => ({ parseAppleHealthXmlStream: mockParseAppleHealthXmlStream }));
vi.mock("@/lib/parsers/gpxRouteParser", () => ({ parseGpxRoute: mockParseGpxRoute }));
vi.mock("@/lib/parsers/workoutRouteCorrelation", () => ({ correlateWorkoutsToRoutes: mockCorrelate }));

const { POST } = await import("@/app/api/health/import/apple-health/route");

async function makeZipRequest(files: Array<{ name: string; content: string }>, filename = "apple.zip") {
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.name, file.content);
  }
  const bytes = await zip.generateAsync({ type: "uint8array" });
  const formData = new FormData();
  formData.append("file", new File([bytes], filename, { type: "application/zip" }));
  return {
    formData: vi.fn().mockResolvedValue(formData),
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
  mockUpdateOne.mockResolvedValue({ acknowledged: true });
  mockBulkWrite.mockResolvedValue({ upsertedCount: 1, modifiedCount: 0 });
  mockImportCreate.mockResolvedValue(undefined);
  mockImportUpdateOne.mockResolvedValue({ acknowledged: true });
  mockWorkoutUpdateOne.mockResolvedValue({ acknowledged: true });
  mockWorkoutBulkWrite.mockResolvedValue({ upsertedCount: 1, modifiedCount: 0 });
  mockFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

  mockParseAppleHealthXmlStream.mockImplementation(async (_stream: unknown, handlers: { onRecord?: (record: Record<string, unknown>) => void; onWorkout?: (workout: Record<string, unknown>) => void }) => {
    handlers.onRecord?.({
      type: "HKQuantityTypeIdentifierStepCount",
      value: "1200",
      unit: "count",
      sourceName: "iPhone",
      sourceVersion: "17",
      startDate: new Date("2026-06-01T08:00:00.000Z"),
      endDate: new Date("2026-06-01T08:10:00.000Z"),
    });

    handlers.onWorkout?.({
      workoutActivityType: "HKWorkoutActivityTypeRunning",
      startDate: new Date("2026-06-01T08:00:00.000Z"),
      endDate: new Date("2026-06-01T08:30:00.000Z"),
      durationMinutes: 30,
      totalEnergyBurned: 300,
      totalDistance: 5,
      sourceName: "Watch",
      sourceVersion: "10",
    });

    return {
      recordsProcessed: 1,
      workoutsProcessed: 1,
      skippedRecords: 0,
      skippedWorkouts: 0,
      recordTypeCounts: { HKQuantityTypeIdentifierStepCount: 1 },
      workoutTypeCounts: { HKWorkoutActivityTypeRunning: 1 },
    };
  });

  mockParseGpxRoute.mockReturnValue({
    routePath: "workout-routes/route_1.gpx",
    pointCount: 10,
    firstTimestamp: new Date("2026-06-01T08:01:00.000Z"),
    lastTimestamp: new Date("2026-06-01T08:29:00.000Z"),
    boundingBox: null,
    distanceEstimateMeters: 5000,
  });

  mockCorrelate.mockReturnValue([
    {
      workout: {
        workoutActivityType: "HKWorkoutActivityTypeRunning",
        startDate: new Date("2026-06-01T08:00:00.000Z"),
        endDate: new Date("2026-06-01T08:30:00.000Z"),
        durationMinutes: 30,
        totalEnergyBurned: 300,
        totalDistance: 5,
        sourceName: "Watch",
        sourceVersion: "10",
      },
      route: {
        routePath: "workout-routes/route_1.gpx",
        pointCount: 10,
        firstTimestamp: new Date("2026-06-01T08:01:00.000Z"),
        lastTimestamp: new Date("2026-06-01T08:29:00.000Z"),
        boundingBox: null,
        distanceEstimateMeters: 5000,
      },
      matched: true,
      confidence: 0.9,
      matchReason: "Matched by minimum start/end delta score",
    },
  ]);
});

describe("POST /api/health/import/apple-health", () => {
  it("returns 400 when no file is provided", async () => {
    const res = await POST(makeEmptyBodyRequest());
    expect(res.status).toBe(400);
  });

  it("returns 422 when export.xml is missing", async () => {
    const req = await makeZipRequest([{ name: "workout-routes/route_1.gpx", content: "<gpx/>" }]);
    const res = await POST(req);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/export.xml/i);
  });

  it("imports Apple Health zip and returns structured summary", async () => {
    const req = await makeZipRequest([
      { name: "export.xml", content: "<HealthData />" },
      { name: "workout-routes/route_1.gpx", content: "<gpx/>" },
      { name: "export_cda.xml", content: "<ClinicalDocument/>" },
    ]);

    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.counts.recordsProcessed).toBe(1);
    expect(body.counts.workoutsProcessed).toBe(1);
    expect(body.counts.routesFound).toBe(1);
    expect(body.counts.routesMatched).toBe(1);
    expect(body.warnings).toContain("Ignored export_cda.xml");

    expect(mockParseAppleHealthXmlStream).toHaveBeenCalledTimes(1);
    expect(mockParseGpxRoute).toHaveBeenCalledTimes(1);
    expect(mockCorrelate).toHaveBeenCalledTimes(1);
    expect(mockBulkWrite).toHaveBeenCalledTimes(1);
    expect(mockWorkoutBulkWrite).toHaveBeenCalledTimes(1);
  });
});

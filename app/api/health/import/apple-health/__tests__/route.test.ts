import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import JSZip from "jszip";

vi.mock("@/lib/db", () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }));

const mockGetBlob = vi.fn();
const mockDeleteBlob = vi.fn();
vi.mock("@vercel/blob", () => ({
  get: mockGetBlob,
  del: mockDeleteBlob,
}));

const mockFindOne = vi.fn();
const mockCreate = vi.fn();
const mockUpdateOne = vi.fn();
const mockBulkWrite = vi.fn();
const mockCountDocumentsEntries = vi.fn();
const mockFindEntries = vi.fn();
const mockDeleteManyEntries = vi.fn();
const mockInsertManyEntries = vi.fn();
const mockImportCreate = vi.fn();
const mockImportUpdateOne = vi.fn();
const mockWorkoutUpdateOne = vi.fn();
const mockWorkoutBulkWrite = vi.fn();
const mockCountDocumentsWorkouts = vi.fn();
const mockFindWorkouts = vi.fn();
const mockDeleteManyWorkouts = vi.fn();
const mockInsertManyWorkouts = vi.fn();
const mockArchiveInsertMany = vi.fn();

vi.mock("@/lib/models/HealthEntry", () => ({
  default: {
    findOne: mockFindOne,
    create: mockCreate,
    updateOne: mockUpdateOne,
    bulkWrite: mockBulkWrite,
    countDocuments: mockCountDocumentsEntries,
    find: mockFindEntries,
    deleteMany: mockDeleteManyEntries,
    insertMany: mockInsertManyEntries,
  },
}));
vi.mock("@/lib/models/ImportLog", () => ({
  default: { create: mockImportCreate, updateOne: mockImportUpdateOne },
}));
vi.mock("@/lib/models/AppleHealthWorkout", () => ({
  default: {
    updateOne: mockWorkoutUpdateOne,
    bulkWrite: mockWorkoutBulkWrite,
    countDocuments: mockCountDocumentsWorkouts,
    find: mockFindWorkouts,
    deleteMany: mockDeleteManyWorkouts,
    insertMany: mockInsertManyWorkouts,
  },
}));
vi.mock("@/lib/models/ImportArchive", () => ({
  default: { insertMany: mockArchiveInsertMany },
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

function makeJsonBlobRequest(blobUrl: string) {
  return {
    headers: {
      get: vi.fn().mockImplementation((key: string) =>
        key.toLowerCase() === "content-type" ? "application/json" : null
      ),
    },
    json: vi.fn().mockResolvedValue({ blobUrl }),
  } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreate.mockResolvedValue(undefined);
  mockUpdateOne.mockResolvedValue({ acknowledged: true });
  mockBulkWrite.mockResolvedValue({ upsertedCount: 1, modifiedCount: 0 });
  mockCountDocumentsEntries.mockResolvedValue(0);
  mockCountDocumentsWorkouts.mockResolvedValue(0);
  mockFindEntries.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
  mockFindWorkouts.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
  mockDeleteManyEntries.mockResolvedValue({ acknowledged: true, deletedCount: 0 });
  mockDeleteManyWorkouts.mockResolvedValue({ acknowledged: true, deletedCount: 0 });
  mockInsertManyEntries.mockResolvedValue([]);
  mockInsertManyWorkouts.mockResolvedValue([]);
  mockArchiveInsertMany.mockResolvedValue([]);
  mockGetBlob.mockReset();
  mockDeleteBlob.mockReset();
  mockDeleteBlob.mockResolvedValue(undefined);
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
    expect(mockDeleteManyEntries).not.toHaveBeenCalled();
    expect(mockDeleteManyWorkouts).not.toHaveBeenCalled();
    expect(mockInsertManyEntries).toHaveBeenCalledTimes(1);
    expect(mockInsertManyWorkouts).toHaveBeenCalledTimes(1);
    expect(mockArchiveInsertMany).not.toHaveBeenCalled();
  });

  it("imports via blob URL by falling back to pathname when direct URL lookup returns 404", async () => {
    const zip = new JSZip();
    zip.file("export.xml", "<HealthData />");
    const bytes = await zip.generateAsync({ type: "uint8array" });

    mockGetBlob
      .mockResolvedValueOnce({ statusCode: 404, stream: null })
      .mockResolvedValueOnce({ statusCode: 200, stream: new ReadableStream({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }) });

    const res = await POST(
      makeJsonBlobRequest("https://example.public.blob.vercel-storage.com/path/upload%20file.zip")
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");

    expect(mockGetBlob).toHaveBeenCalledTimes(2);
    expect(mockGetBlob).toHaveBeenNthCalledWith(
      1,
      "https://example.public.blob.vercel-storage.com/path/upload%20file.zip",
      expect.objectContaining({ access: "private" })
    );
    expect(mockGetBlob).toHaveBeenNthCalledWith(
      2,
      "path/upload file.zip",
      expect.objectContaining({ access: "private" })
    );
  });

  it("returns 502 when blob storage cannot be fetched after retries", async () => {
    mockGetBlob.mockResolvedValue({ statusCode: 404, stream: null });

    const res = await POST(
      makeJsonBlobRequest("https://example.public.blob.vercel-storage.com/upload.zip")
    );

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/failed to fetch blob from storage/i);
  });
});

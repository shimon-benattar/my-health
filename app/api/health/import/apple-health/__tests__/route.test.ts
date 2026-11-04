import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import JSZip from "jszip";
import { connectDB } from "@/lib/db";
import { writeDashboardMetricsCacheToDisk } from "@/lib/dashboardMetricsCache";

vi.mock("@/lib/db", () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/dashboardMetricsCache", () => ({ writeDashboardMetricsCacheToDisk: vi.fn().mockResolvedValue(undefined) }));

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

const mockParseAppleHealthXmlStream = vi.fn();
const mockParseGpxRoute = vi.fn();
const mockCorrelate = vi.fn();

vi.mock("@/lib/parsers/appleHealthXmlParser", () => ({ parseAppleHealthXmlStream: mockParseAppleHealthXmlStream }));
vi.mock("@/lib/parsers/gpxRouteParser", () => ({ parseGpxRoute: mockParseGpxRoute }));
vi.mock("@/lib/parsers/workoutRouteCorrelation", () => ({ correlateWorkoutsToRoutes: mockCorrelate }));

const { POST } = await import("@/app/api/health/import/apple-health/route");
const mockConnectDB = vi.mocked(connectDB);
const mockWriteDashboardMetricsCacheToDisk = vi.mocked(writeDashboardMetricsCacheToDisk);

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
  mockConnectDB.mockResolvedValue(undefined);
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
  mockFindOneAndUpdateProfile.mockResolvedValue({
    key: "primary",
    name: "Shimon",
    birthdate: "21/04/1979",
    weightKg: 85,
    heightCm: 177,
  });
  mockWriteDashboardMetricsCacheToDisk.mockResolvedValue(undefined);
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
      events: [],
      stats: {},
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

  it("aggregates recovery metrics and persists workout effort, cadence, and splits", async () => {
    mockParseAppleHealthXmlStream.mockImplementationOnce(async (_stream: unknown, handlers: { onRecord?: (record: Record<string, unknown>) => void; onWorkout?: (workout: Record<string, unknown>) => void }) => {
      handlers.onRecord?.({
        type: "HKQuantityTypeIdentifierRespiratoryRate",
        value: "14.5",
        unit: "count/min",
        sourceName: "Watch",
        sourceVersion: "12",
        startDate: new Date("2026-10-10T04:00:00.000Z"),
        endDate: new Date("2026-10-10T04:00:00.000Z"),
      });
      handlers.onRecord?.({
        type: "HKQuantityTypeIdentifierHeartRateVariabilityRMSSD",
        value: "41",
        unit: "ms",
        sourceName: "Watch",
        sourceVersion: "12",
        startDate: new Date("2026-10-10T04:05:00.000Z"),
        endDate: new Date("2026-10-10T04:05:00.000Z"),
      });
      handlers.onRecord?.({
        type: "HKQuantityTypeIdentifierAppleSleepingWristTemperature",
        value: "35.6",
        unit: "degC",
        sourceName: "Watch",
        sourceVersion: "12",
        startDate: new Date("2026-10-10T00:00:00.000Z"),
        endDate: new Date("2026-10-10T07:00:00.000Z"),
      });
      handlers.onRecord?.({
        type: "HKQuantityTypeIdentifierTimeInDaylight",
        value: "24",
        unit: "min",
        sourceName: "Watch",
        sourceVersion: "12",
        startDate: new Date("2026-10-10T08:00:00.000Z"),
        endDate: new Date("2026-10-10T08:24:00.000Z"),
      });
      handlers.onRecord?.({
        type: "HKQuantityTypeIdentifierWorkoutEffortScore",
        value: "8",
        unit: "appleEffortScore",
        sourceName: "Watch",
        sourceVersion: "12",
        startDate: new Date("2026-10-10T08:29:00.000Z"),
        endDate: new Date("2026-10-10T08:29:00.000Z"),
      });
      handlers.onRecord?.({
        type: "HKQuantityTypeIdentifierHeartRateRecoveryOneMinute",
        value: "31",
        unit: "count/min",
        sourceName: "Watch",
        sourceVersion: "12",
        startDate: new Date("2026-10-10T08:31:00.000Z"),
        endDate: new Date("2026-10-10T08:31:00.000Z"),
      });
      handlers.onRecord?.({
        type: "HKQuantityTypeIdentifierHeartRate",
        value: "150",
        unit: "count/min",
        sourceName: "Watch",
        sourceVersion: "12",
        startDate: new Date("2026-10-10T08:00:00.000Z"),
        endDate: new Date("2026-10-10T08:01:00.000Z"),
      });

      handlers.onWorkout?.({
        workoutActivityType: "HKWorkoutActivityTypeRunning",
        startDate: new Date("2026-10-10T08:00:00.000Z"),
        endDate: new Date("2026-10-10T08:30:00.000Z"),
        durationMinutes: 30,
        totalEnergyBurned: 300,
        totalDistance: 5,
        sourceName: "Watch",
        sourceVersion: "12",
        events: [
          { type: "HKWorkoutEventTypeSegment", date: new Date("2026-10-10T08:00:00.000Z"), durationMinutes: 5.5 },
          { type: "HKWorkoutEventTypeSegment", date: new Date("2026-10-10T08:05:30.000Z"), durationMinutes: 5.8 },
        ],
        stats: {
          runningSpeedKmh: { avg: 10.5, min: 9.2, max: 12.1, sum: null },
          runningStrideM: { avg: 1.05, min: 0.98, max: 1.12, sum: null },
          stepCount: 5100,
          heartRate: { avg: 155, min: 140, max: 172, sum: null },
        },
      });

      return {
        recordsProcessed: 7,
        workoutsProcessed: 1,
        skippedRecords: 0,
        skippedWorkouts: 0,
        recordTypeCounts: {},
        workoutTypeCounts: { HKWorkoutActivityTypeRunning: 1 },
      };
    });
    mockCorrelate.mockReturnValueOnce([
      {
        workout: {
          workoutActivityType: "HKWorkoutActivityTypeRunning",
          startDate: new Date("2026-10-10T08:00:00.000Z"),
          endDate: new Date("2026-10-10T08:30:00.000Z"),
          durationMinutes: 30,
          totalEnergyBurned: 300,
          totalDistance: 5,
          sourceName: "Watch",
          sourceVersion: "12",
          events: [
            { type: "HKWorkoutEventTypeSegment", date: new Date("2026-10-10T08:00:00.000Z"), durationMinutes: 5.5 },
            { type: "HKWorkoutEventTypeSegment", date: new Date("2026-10-10T08:05:30.000Z"), durationMinutes: 5.8 },
          ],
          stats: {
            runningSpeedKmh: { avg: 10.5, min: 9.2, max: 12.1, sum: null },
            runningStrideM: { avg: 1.05, min: 0.98, max: 1.12, sum: null },
            stepCount: 5100,
            heartRate: { avg: 155, min: 140, max: 172, sum: null },
          },
        },
        route: {
          routePath: "workout-routes/route_splits.gpx",
          pointCount: 241,
          firstTimestamp: new Date("2026-10-10T08:00:00.000Z"),
          lastTimestamp: new Date("2026-10-10T08:12:00.000Z"),
          boundingBox: { minLat: 0, maxLat: 0.0216, minLon: 0, maxLon: 0 },
          distanceEstimateMeters: 2400,
          // 2.4 km at 5:00/km, one point every 10 m
          points: Array.from({ length: 241 }, (_, i) => ({
            lat: (i * 10) / 111194.9,
            lon: 0,
            time: new Date(Date.parse("2026-10-10T08:00:00.000Z") + i * 3000),
          })),
        },
        matched: true,
        confidence: 1,
        matchReason: "test",
      },
    ]);

    const req = await makeZipRequest([{ name: "export.xml", content: "<HealthData />" }]);
    const res = await POST(req);

    expect(res.status).toBe(200);

    const insertedEntries = mockInsertManyEntries.mock.calls.at(-1)?.[0] as Array<{
      recoveryMetrics?: { respiratoryRate?: { avg?: number | null } | null; hrvRmssd?: { avg?: number | null } | null; sleepingWristTemperature?: number | null };
      vitalityMetrics?: { timeInDaylightMinutes?: number | null };
    }>;
    expect(insertedEntries[0]?.recoveryMetrics?.respiratoryRate?.avg).toBe(14.5);
    expect(insertedEntries[0]?.recoveryMetrics?.hrvRmssd?.avg).toBe(41);
    expect(insertedEntries[0]?.recoveryMetrics?.sleepingWristTemperature).toBe(35.6);
    expect(insertedEntries[0]?.vitalityMetrics?.timeInDaylightMinutes).toBe(24);

    const insertedWorkouts = mockInsertManyWorkouts.mock.calls.at(-1)?.[0] as Array<{
      effort?: { workoutEffortScore?: number | null };
      recovery?: { heartRateRecoveryOneMinute?: number | null };
      splits?: Array<{ kilometer: number; durationSeconds: number }>;
      stats?: { runningCadenceSpm?: { avg?: number | null } | null };
    }>;
    expect(insertedWorkouts[0]?.effort?.workoutEffortScore).toBe(8);
    expect(insertedWorkouts[0]?.recovery?.heartRateRecoveryOneMinute).toBe(31);
    // Splits come from the GPX route (2 full km + 0.4 km remainder), not Apple's segment events.
    expect(insertedWorkouts[0]?.splits).toHaveLength(3);
    expect(insertedWorkouts[0]?.splits?.[0]).toMatchObject({ kilometer: 1, durationSeconds: 300 });
    expect(insertedWorkouts[0]?.stats?.runningCadenceSpm?.avg).toBeGreaterThan(0);
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

  it("groups overnight sleep and same-day naps into the wake day and counts only sleeping HR samples", async () => {
    mockParseAppleHealthXmlStream.mockImplementationOnce(async (_stream: unknown, handlers: { onRecord?: (record: Record<string, unknown>) => void }) => {
      handlers.onRecord?.({
        type: "HKCategoryTypeIdentifierSleepAnalysis",
        value: "HKCategoryValueSleepAnalysisAsleep",
        unit: null,
        sourceName: "Watch",
        sourceVersion: "10",
        startDate: new Date("2026-06-01T22:00:00.000Z"),
        endDate: new Date("2026-06-02T06:00:00.000Z"),
      });
      handlers.onRecord?.({
        type: "HKCategoryTypeIdentifierSleepAnalysis",
        value: "HKCategoryValueSleepAnalysisAsleep",
        unit: null,
        sourceName: "Watch",
        sourceVersion: "10",
        startDate: new Date("2026-06-02T13:00:00.000Z"),
        endDate: new Date("2026-06-02T14:00:00.000Z"),
      });
      handlers.onRecord?.({
        type: "HKQuantityTypeIdentifierHeartRate",
        value: "38",
        unit: "count/min",
        sourceName: "Watch",
        sourceVersion: "10",
        startDate: new Date("2026-06-02T01:30:00.000Z"),
        endDate: new Date("2026-06-02T01:31:00.000Z"),
      });
      handlers.onRecord?.({
        type: "HKQuantityTypeIdentifierHeartRate",
        value: "72",
        unit: "count/min",
        sourceName: "Watch",
        sourceVersion: "10",
        startDate: new Date("2026-06-02T18:00:00.000Z"),
        endDate: new Date("2026-06-02T18:01:00.000Z"),
      });

      return {
        recordsProcessed: 4,
        workoutsProcessed: 0,
        skippedRecords: 0,
        skippedWorkouts: 0,
        recordTypeCounts: {
          HKCategoryTypeIdentifierSleepAnalysis: 2,
          HKQuantityTypeIdentifierHeartRate: 2,
        },
        workoutTypeCounts: {},
      };
    });
    mockCorrelate.mockReturnValueOnce([]);

    const req = await makeZipRequest([{ name: "export.xml", content: "<HealthData />" }]);
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockInsertManyEntries).toHaveBeenCalledTimes(1);

    const insertedEntries = mockInsertManyEntries.mock.calls[0]?.[0] as Array<{
      date: Date;
      sleep: number | null;
      sleepHeartRate?: { avg: number | null; min: number | null; max: number | null; lowAlerts: number } | null;
    }>;

    expect(insertedEntries).toHaveLength(1);
    expect(insertedEntries[0].date.toISOString()).toBe("2026-06-02T00:00:00.000Z");
    expect(insertedEntries[0].sleep).toBe(540);
    expect(insertedEntries[0].sleepHeartRate).toMatchObject({
      avg: 38,
      min: 38,
      max: 38,
      lowAlerts: 1,
    });
  });

  it("returns 503 with database_unavailable when MongoDB cannot be reached", async () => {
    mockConnectDB.mockRejectedValueOnce(new Error("Socket 'secureConnect' timed out after 30000ms (connectTimeoutMS: 30000)"));
    const req = await makeZipRequest([{ name: "export.xml", content: "<HealthData />" }]);
    const res = await POST(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe("database_unavailable");
    expect(body.error).toMatch(/database is unavailable/i);
  });
});

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { del, get as getBlob } from "@vercel/blob";
import JSZip from "jszip";
import { databaseUnavailablePayload, isDatabaseUnavailableError } from "@/lib/apiErrors";
import { connectDB } from "@/lib/db";
import { writeDashboardMetricsCacheToDisk } from "@/lib/dashboardMetricsCache";
import { buildDashboardMetricsPayload } from "@/lib/dashboardMetricsPayload";
import HealthEntry from "@/lib/models/HealthEntry";
import ImportLog from "@/lib/models/ImportLog";
import AppleHealthWorkout from "@/lib/models/AppleHealthWorkout";
import ImportArchive from "@/lib/models/ImportArchive";
import UserProfile from "@/lib/models/UserProfile";
import { parseAppleHealthXmlStream, type AppleHealthWorkout as AppleHealthWorkoutRecord } from "@/lib/parsers/appleHealthXmlParser";
import { parseGpxRoute } from "@/lib/parsers/gpxRouteParser";
import { correlateWorkoutsToRoutes } from "@/lib/parsers/workoutRouteCorrelation";
import type { AverageRangeValue, DashboardWorkoutDoc, HealthEntryDoc, HealthEntryInput, AppleHealthImportResult, UserProfile as DashboardUserProfile, WorkoutSplit } from "@/types/health";

const ARCHIVE_TTL_DAYS = 30;

function normalizeProfile(profile: {
  key?: string;
  name: string;
  birthdate: string;
  weightKg: number;
  heightCm: number;
  imageUrl?: string | null;
  sex?: "female" | "male" | "other" | null;
  timezone?: string | null;
  notes?: string | null;
  updatedAt?: Date | string;
} | null): DashboardUserProfile | null {
  if (!profile) return null;

  return {
    ...profile,
    updatedAt: profile.updatedAt instanceof Date ? profile.updatedAt.toISOString() : profile.updatedAt,
  };
}

async function waitMs(ms: number) {
  if (process.env.NODE_ENV === "test") {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function valueToNumber(raw: string): number | null {
  const val = Number.parseFloat(raw);
  return Number.isFinite(val) ? val : null;
}

type DailyAccumulator = {
  date: Date;
  activeCalories: number | null;
  steps: number | null;
  cardioSamples: number[];
  restingHrSamples: number[];
  heartRateMin: number | null;
  heartRateMax: number | null;
  hrvMin: number | null;
  hrvMax: number | null;
  respiratoryRateSamples: number[];
  hrvRmssdSamples: number[];
  walkingHeartRateAverageSamples: number[];
  sleepingWristTemperatureSamples: number[];
  heartRateRecoverySamples: number[];
  physicalEffortSamples: number[];
  timeInDaylightMinutes: number | null;
  sleepMinutes: number | null;
  sleepDetail: {
    remMinutes: number;
    coreMinutes: number;
    deepMinutes: number;
    awakeMinutes: number;
    asleepMinutes: number;
    inBedMinutes: number;
  };
  sleepHeartRate: {
    avg: number | null;
    min: number | null;
    max: number | null;
    lowAlerts: number;
  };
  syntheticAdjustments: {
    shabbatSleepAddedMinutes: number;
    shabbatStepsAdded: number;
  };
};

type SleepInterval = {
  start: Date;
  end: Date;
};

type HeartRateSample = {
  start: Date;
  end: Date;
  value: number;
};

type TimedNumericRecord = {
  start: Date;
  end: Date;
  value: number;
};

type DetailedWorkoutSplit = WorkoutSplit & {
  maxHeartRate?: number | null;
};

function averageOrNull(values: number[]): number | null {
  if (values.length === 0) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function toAverageRange(values: number[]): AverageRangeValue | null {
  if (values.length === 0) return null;
  return {
    avg: averageOrNull(values),
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function toHealthEntries(byDate: Map<string, DailyAccumulator>): HealthEntryInput[] {
  return Array.from(byDate.values()).map((entry) => ({
    date: entry.date,
    sourceType: "apple-health",
    sourceFile: "export.xml",
    sportType: null,
    workoutType: null,
    workoutDurationMinutes: null,
    activeCalories: entry.activeCalories,
    cardioFitness:
      entry.cardioSamples.length > 0
        ? entry.cardioSamples.reduce((sum, val) => sum + val, 0) / entry.cardioSamples.length
        : null,
    heartRate:
      entry.heartRateMin !== null && entry.heartRateMax !== null
        ? { min: entry.heartRateMin, max: entry.heartRateMax }
        : null,
    hrv:
      entry.hrvMin !== null && entry.hrvMax !== null
        ? { min: entry.hrvMin, max: entry.hrvMax }
        : null,
    restingHeartRate:
      entry.restingHrSamples.length > 0
        ? entry.restingHrSamples.reduce((sum, val) => sum + val, 0) / entry.restingHrSamples.length
        : null,
    sleep: entry.sleepMinutes,
    steps: entry.steps,
    sleepDetail: entry.sleepDetail,
    sleepHeartRate: entry.sleepHeartRate,
    recoveryMetrics: {
      respiratoryRate: toAverageRange(entry.respiratoryRateSamples),
      hrvRmssd: toAverageRange(entry.hrvRmssdSamples),
      walkingHeartRateAverage: averageOrNull(entry.walkingHeartRateAverageSamples),
      sleepingWristTemperature: averageOrNull(entry.sleepingWristTemperatureSamples),
      heartRateRecoveryOneMinute: averageOrNull(entry.heartRateRecoverySamples),
    },
    vitalityMetrics: {
      timeInDaylightMinutes: entry.timeInDaylightMinutes,
      physicalEffortAvg: averageOrNull(entry.physicalEffortSamples),
      physicalEffortMax: entry.physicalEffortSamples.length > 0 ? Math.max(...entry.physicalEffortSamples) : null,
    },
    syntheticAdjustments: entry.syntheticAdjustments,
  }));
}

function stageFromSleepValue(value: string): "rem" | "core" | "deep" | "awake" | "asleep" | "inbed" | null {
  const v = value.toLowerCase();
  if (v.includes("asleeprem") || v.includes("rem")) return "rem";
  if (v.includes("asleepcore") || v.includes("core")) return "core";
  if (v.includes("asleepdeep") || v.includes("deep")) return "deep";
  if (v.includes("awake")) return "awake";
  if (v.includes("inbed")) return "inbed";
  if (v.includes("asleep")) return "asleep";
  return null;
}

function initAccumulator(dateKey: string): DailyAccumulator {
  return {
    date: new Date(`${dateKey}T00:00:00.000Z`),
    activeCalories: null,
    steps: null,
    cardioSamples: [],
    restingHrSamples: [],
    heartRateMin: null,
    heartRateMax: null,
    hrvMin: null,
    hrvMax: null,
    respiratoryRateSamples: [],
    hrvRmssdSamples: [],
    walkingHeartRateAverageSamples: [],
    sleepingWristTemperatureSamples: [],
    heartRateRecoverySamples: [],
    physicalEffortSamples: [],
    timeInDaylightMinutes: null,
    sleepMinutes: null,
    sleepDetail: {
      remMinutes: 0,
      coreMinutes: 0,
      deepMinutes: 0,
      awakeMinutes: 0,
      asleepMinutes: 0,
      inBedMinutes: 0,
    },
    sleepHeartRate: {
      avg: null,
      min: null,
      max: null,
      lowAlerts: 0,
    },
    syntheticAdjustments: {
      shabbatSleepAddedMinutes: 0,
      shabbatStepsAdded: 0,
    },
  };
}

function appendSleepInterval(map: Map<string, SleepInterval[]>, dateKey: string, start: Date, end: Date) {
  const list = map.get(dateKey) ?? [];
  list.push({ start, end });
  map.set(dateKey, list);
}

function appendHeartRateSample(map: Map<string, HeartRateSample[]>, sample: HeartRateSample) {
  const keys = new Set([toDateKey(sample.start), toDateKey(sample.end)]);
  for (const key of keys) {
    const list = map.get(key) ?? [];
    list.push(sample);
    map.set(key, list);
  }
}

function overlapsSleep(sample: HeartRateSample, interval: SleepInterval): boolean {
  return sample.start < interval.end && sample.end > interval.start;
}

function applySyntheticShabbatAugmentation() {
  // Disabled intentionally: dashboard should only reflect imported measurements.
}

function averageHeartRateInRange(samples: HeartRateSample[], start: Date, end: Date): number | null {
  const values = samples
    .filter((sample) => sample.start < end && sample.end > start)
    .map((sample) => sample.value);
  return averageOrNull(values);
}

function maxHeartRateInRange(samples: HeartRateSample[], start: Date, end: Date): number | null {
  const values = samples
    .filter((sample) => sample.start < end && sample.end > start)
    .map((sample) => sample.value);
  return values.length > 0 ? Math.max(...values) : null;
}

function buildWorkoutSplits(workout: AppleHealthWorkoutRecord, heartRateSamples: HeartRateSample[]): DetailedWorkoutSplit[] {
  const segmentEvents = (workout.events ?? [])
    .filter((event) => event.type === "HKWorkoutEventTypeSegment" && (event.durationMinutes ?? 0) > 0)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (segmentEvents.length === 0) {
    return [];
  }

  return segmentEvents.map((event, index) => {
    const durationMinutes = event.durationMinutes ?? 0;
    const durationSeconds = Math.round(durationMinutes * 60);
    const endDate = new Date(event.date.getTime() + durationSeconds * 1000);
    const averageHeartRate = averageHeartRateInRange(heartRateSamples, event.date, endDate);
    const maxHeartRate = maxHeartRateInRange(heartRateSamples, event.date, endDate);

    return {
      kilometer: index + 1,
      durationSeconds,
      averageHeartRate,
      paceMinutesPerKm: durationMinutes > 0 ? durationMinutes : null,
      ...(maxHeartRate !== null ? { maxHeartRate } : {}),
    };
  });
}

function buildKmSplitsFromSplits(splits: WorkoutSplit[]) {
  return splits.map((split) => ({
    kmIndex: split.kilometer,
    distanceKm: 1,
    paceMinPerKm: split.paceMinutesPerKm ?? null,
    avgHeartRate: split.averageHeartRate ?? null,
    maxHeartRate: "maxHeartRate" in split ? (split as DetailedWorkoutSplit).maxHeartRate ?? null : null,
  }));
}

function findBestWorkoutRecord(records: TimedNumericRecord[], workout: AppleHealthWorkoutRecord): number | null {
  const overlapping = records.filter((record) => record.start <= workout.endDate && record.end >= workout.startDate);
  if (overlapping.length > 0) {
    return overlapping.reduce((best, record) => {
      const bestDelta = Math.abs(best.end.getTime() - workout.endDate.getTime());
      const nextDelta = Math.abs(record.end.getTime() - workout.endDate.getTime());
      return nextDelta < bestDelta ? record : best;
    }).value;
  }

  const nearby = records
    .filter((record) => Math.abs(record.end.getTime() - workout.endDate.getTime()) <= 30 * 60 * 1000)
    .sort((a, b) => Math.abs(a.end.getTime() - workout.endDate.getTime()) - Math.abs(b.end.getTime() - workout.endDate.getTime()));

  return nearby[0]?.value ?? null;
}

function deriveRunningCadenceSpm(workout: AppleHealthWorkoutRecord): number | null {
  const fromStats = workout.stats?.runningCadenceSpm?.avg ?? null;
  if (fromStats !== null && Number.isFinite(fromStats) && fromStats > 0) {
    return fromStats;
  }

  const speedKmh = workout.stats?.runningSpeedKmh?.avg ?? null;
  const strideM = workout.stats?.runningStrideM?.avg ?? null;
  if (speedKmh !== null && speedKmh > 0 && strideM !== null && strideM > 0) {
    const metersPerMinute = (speedKmh * 1000) / 60;
    const stepsPerMinute = metersPerMinute / strideM;
    if (Number.isFinite(stepsPerMinute) && stepsPerMinute > 0) {
      return stepsPerMinute;
    }
  }

  const stepCount = workout.stats?.stepCount ?? null;
  const durationMinutes = workout.durationMinutes ?? null;
  if (stepCount !== null && stepCount > 0 && durationMinutes !== null && durationMinutes > 0) {
    const stepsPerMinute = stepCount / durationMinutes;
    if (Number.isFinite(stepsPerMinute) && stepsPerMinute > 0) {
      return stepsPerMinute;
    }
  }

  return null;
}

function bytesToHuman(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function buildArchiveExpiryDate(archivedAt: Date): Date {
  return new Date(archivedAt.getTime() + ARCHIVE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

async function archiveExistingAppleHealthData(snapshotId: string, archivedAt: Date) {
  const expiresAt = buildArchiveExpiryDate(archivedAt);

  const [existingEntriesCount, existingWorkoutsCount] = await Promise.all([
    HealthEntry.countDocuments({ sourceType: "apple-health" }),
    AppleHealthWorkout.countDocuments({}),
  ]);

  if (existingEntriesCount === 0 && existingWorkoutsCount === 0) {
    return { archivedEntries: 0, archivedWorkouts: 0 };
  }

  const [existingEntries, existingWorkouts] = await Promise.all([
    HealthEntry.find({ sourceType: "apple-health" }).lean(),
    AppleHealthWorkout.find({}).lean(),
  ]);

  const archiveDocs = [
    ...existingEntries.map((entry) => ({
      snapshotId,
      sourceType: "apple-health" as const,
      collectionName: "HealthEntry" as const,
      originalId: String(entry._id),
      archivedAt,
      expiresAt,
      payload: entry as unknown as Record<string, unknown>,
    })),
    ...existingWorkouts.map((workout) => ({
      snapshotId,
      sourceType: "apple-health" as const,
      collectionName: "AppleHealthWorkout" as const,
      originalId: String(workout._id),
      archivedAt,
      expiresAt,
      payload: workout as unknown as Record<string, unknown>,
    })),
  ];

  if (archiveDocs.length > 0) {
    await ImportArchive.insertMany(archiveDocs, { ordered: true });
  }

  return {
    archivedEntries: existingEntries.length,
    archivedWorkouts: existingWorkouts.length,
  };
}

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  const logSteps: Array<{ at: Date; level: "info" | "warn" | "error"; message: string; meta?: Record<string, unknown> }> = [];

  function addLog(level: "info" | "warn" | "error", message: string, meta?: Record<string, unknown>) {
    const at = new Date();
    logSteps.push({ at, level, message, meta });
    const prefix = `[apple-health][${requestId}]`;
    const details = meta ? ` ${JSON.stringify(meta)}` : "";
    if (level === "error") {
      console.error(`${prefix} ${message}${details}`);
      return;
    }
    if (level === "warn") {
      console.warn(`${prefix} ${message}${details}`);
      return;
    }
    console.log(`${prefix} ${message}${details}`);
  }

  let filename = "unknown";
  let blobUrlToDelete: string | null = null;
  const blobAccessMode = process.env.BLOB_ACCESS_MODE === "public" ? "public" : "private";
  const readWriteToken = process.env.BLOB_READ_WRITE_TOKEN;
  const warnings: string[] = [];
  let importSucceeded = false;
  let dbConnected = false;

  try {
    await connectDB();
    dbConnected = true;

    // Accept either multipart/form-data (small files / tests) or JSON with blobUrl (large file
    // uploads that went directly to Vercel Blob to bypass the 4.5 MB function body limit).
    let zipBuffer: ArrayBuffer;
    const contentType = request.headers?.get?.("content-type") ?? "";

    if (contentType.startsWith("application/json")) {
      const body = (await request.json()) as { blobUrl?: string; weightKg?: string };
      if (!body.blobUrl || typeof body.blobUrl !== "string") {
        return NextResponse.json({ error: "blobUrl is required when using JSON body" }, { status: 400 });
      }
      blobUrlToDelete = body.blobUrl;
      filename = body.blobUrl.split("/").pop() ?? "upload.zip";

      addLog("info", "Import request received via blob URL", { blobUrl: body.blobUrl, filename });

      const accessAttempts: Array<"private" | "public"> =
        blobAccessMode === "private" ? ["private", "public"] : ["public", "private"];

      const blobCandidates: string[] = [body.blobUrl];
      try {
        const parsed = new URL(body.blobUrl);
        const pathname = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
        if (pathname.length > 0 && !blobCandidates.includes(pathname)) {
          blobCandidates.push(pathname);
        }
      } catch {
        // Keep only the original candidate when URL parsing fails.
      }

      let blobRes: Awaited<ReturnType<typeof getBlob>> | null = null;
      for (let attempt = 0; attempt < 6; attempt++) {
        for (const access of accessAttempts) {
          for (const candidate of blobCandidates) {
            blobRes = await getBlob(candidate, {
              access,
              token: readWriteToken,
            });

            if (blobRes?.statusCode === 200 && blobRes.stream) {
              addLog("info", "Fetched blob for import", {
                access,
                attempt: attempt + 1,
                candidate: candidate === body.blobUrl ? "url" : "pathname",
              });
              break;
            }

            addLog("warn", "Blob fetch attempt failed", {
              access,
              attempt: attempt + 1,
              candidate: candidate === body.blobUrl ? "url" : "pathname",
              statusCode: blobRes?.statusCode ?? null,
            });
          }

          if (blobRes?.statusCode === 200 && blobRes.stream) {
            break;
          }
        }

        if (blobRes?.statusCode === 200 && blobRes.stream) {
          break;
        }

        if (attempt < 5) {
          await waitMs(350 * (attempt + 1));
        }
      }

      if (!blobRes || blobRes.statusCode !== 200 || !blobRes.stream) {
        return NextResponse.json(
          { error: `Failed to fetch blob from storage: HTTP ${blobRes?.statusCode ?? 404}` },
          { status: 502 }
        );
      }
      zipBuffer = await new Response(blobRes.stream).arrayBuffer();
    } else {
      const formData = await request.formData();
      const file = formData.get("file");

      if (!file || !(file instanceof File)) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }
      filename = file.name;
      addLog("info", "Import request received via form upload", {
        filename: file.name,
        fileSizeBytes: file.size,
        fileSizeHuman: bytesToHuman(file.size),
        fileType: file.type || "unknown",
      });

      if (!file.name.toLowerCase().endsWith(".zip")) {
        addLog("warn", "Rejected non-zip upload", { filename: file.name });
        await ImportLog.create({
          requestId,
          filename,
          sourceType: "apple-health",
          status: "error",
          startedAt: new Date(),
          finishedAt: new Date(),
          error: "Only ZIP files are accepted",
          steps: logSteps,
        });
        return NextResponse.json({ error: "Only ZIP files are accepted" }, { status: 400 });
      }

      zipBuffer = await file.arrayBuffer();
    }

    await ImportLog.create({
      requestId,
      filename,
      sourceType: "apple-health",
      status: "processing",
      startedAt: new Date(),
      steps: [],
    });

    const zip = await JSZip.loadAsync(zipBuffer);
    const files = Object.values(zip.files).filter((item) => !item.dir);
    addLog("info", "ZIP loaded", {
      totalEntries: Object.keys(zip.files).length,
      fileEntries: files.length,
      firstEntries: files.slice(0, 10).map((item) => item.name),
    });
    const exportXmlEntry = files.find((item) => item.name.toLowerCase().endsWith("export.xml"));
    const cdaXmlEntry = files.find((item) => item.name.toLowerCase().endsWith("export_cda.xml"));

    if (!exportXmlEntry) {
      addLog("warn", "ZIP missing export.xml");
      return NextResponse.json({ error: "ZIP does not contain export.xml" }, { status: 422 });
    }

    if (cdaXmlEntry) {
      warnings.push("Ignored export_cda.xml");
      addLog("info", "Ignoring export_cda.xml", { path: cdaXmlEntry.name });
    }

    const byDate = new Map<string, DailyAccumulator>();
    const sleepIntervalsByDate = new Map<string, SleepInterval[]>();
    const heartRateSamplesByDate = new Map<string, HeartRateSample[]>();
    const allHeartRateSamples: HeartRateSample[] = [];
    const workoutEffortRecords: TimedNumericRecord[] = [];
    const estimatedWorkoutEffortRecords: TimedNumericRecord[] = [];
    const heartRateRecoveryRecords: TimedNumericRecord[] = [];
    const workouts: AppleHealthWorkoutRecord[] = [];

    const parsed = await parseAppleHealthXmlStream(exportXmlEntry.nodeStream("nodebuffer"), {
      onRecord: (record) => {
        const dateKey = record.type === "HKCategoryTypeIdentifierSleepAnalysis"
          ? toDateKey(record.endDate)
          : toDateKey(record.startDate);
        const existing = byDate.get(dateKey) ?? initAccumulator(dateKey);
        const numeric = valueToNumber(record.value);
        switch (record.type) {
          case "HKQuantityTypeIdentifierActiveEnergyBurned":
            if (numeric !== null) {
              existing.activeCalories = (existing.activeCalories ?? 0) + numeric;
            }
            break;
          case "HKQuantityTypeIdentifierStepCount":
            if (numeric !== null) {
              existing.steps = (existing.steps ?? 0) + numeric;
            }
            break;
          case "HKQuantityTypeIdentifierVO2Max":
            if (numeric !== null) {
              existing.cardioSamples.push(numeric);
            }
            break;
          case "HKQuantityTypeIdentifierRestingHeartRate":
            if (numeric !== null) {
              existing.restingHrSamples.push(numeric);
            }
            break;
          case "HKQuantityTypeIdentifierHeartRate":
            if (numeric !== null) {
              existing.heartRateMin = existing.heartRateMin === null ? numeric : Math.min(existing.heartRateMin, numeric);
              existing.heartRateMax = existing.heartRateMax === null ? numeric : Math.max(existing.heartRateMax, numeric);
              const sample = {
                start: record.startDate,
                end: record.endDate,
                value: numeric,
              };
              appendHeartRateSample(heartRateSamplesByDate, sample);
              allHeartRateSamples.push(sample);
            }
            break;
          case "HKQuantityTypeIdentifierHeartRateVariabilitySDNN":
            if (numeric !== null) {
              existing.hrvMin = existing.hrvMin === null ? numeric : Math.min(existing.hrvMin, numeric);
              existing.hrvMax = existing.hrvMax === null ? numeric : Math.max(existing.hrvMax, numeric);
            }
            break;
          case "HKQuantityTypeIdentifierHeartRateVariabilityRMSSD":
            if (numeric !== null) {
              existing.hrvRmssdSamples.push(numeric);
            }
            break;
          case "HKQuantityTypeIdentifierRespiratoryRate":
            if (numeric !== null) {
              existing.respiratoryRateSamples.push(numeric);
            }
            break;
          case "HKQuantityTypeIdentifierWalkingHeartRateAverage":
            if (numeric !== null) {
              existing.walkingHeartRateAverageSamples.push(numeric);
            }
            break;
          case "HKQuantityTypeIdentifierAppleSleepingWristTemperature":
            if (numeric !== null) {
              existing.sleepingWristTemperatureSamples.push(numeric);
            }
            break;
          case "HKQuantityTypeIdentifierHeartRateRecoveryOneMinute":
            if (numeric !== null) {
              existing.heartRateRecoverySamples.push(numeric);
              heartRateRecoveryRecords.push({
                start: record.startDate,
                end: record.endDate,
                value: numeric,
              });
            }
            break;
          case "HKQuantityTypeIdentifierTimeInDaylight":
            if (numeric !== null) {
              existing.timeInDaylightMinutes = (existing.timeInDaylightMinutes ?? 0) + numeric;
            }
            break;
          case "HKQuantityTypeIdentifierPhysicalEffort":
            if (numeric !== null) {
              existing.physicalEffortSamples.push(numeric);
            }
            break;
          case "HKQuantityTypeIdentifierWorkoutEffortScore":
            if (numeric !== null) {
              workoutEffortRecords.push({
                start: record.startDate,
                end: record.endDate,
                value: numeric,
              });
            }
            break;
          case "HKQuantityTypeIdentifierEstimatedWorkoutEffortScore":
            if (numeric !== null) {
              estimatedWorkoutEffortRecords.push({
                start: record.startDate,
                end: record.endDate,
                value: numeric,
              });
            }
            break;
          case "HKCategoryTypeIdentifierSleepAnalysis":
            {
              const minutes = (record.endDate.getTime() - record.startDate.getTime()) / (1000 * 60);
              if (minutes > 0) {
                const stage = stageFromSleepValue(record.value);
                if (stage === "rem") {
                  existing.sleepDetail.remMinutes += minutes;
                  existing.sleepDetail.asleepMinutes += minutes;
                  existing.sleepMinutes = (existing.sleepMinutes ?? 0) + minutes;
                  appendSleepInterval(sleepIntervalsByDate, dateKey, record.startDate, record.endDate);
                } else if (stage === "core") {
                  existing.sleepDetail.coreMinutes += minutes;
                  existing.sleepDetail.asleepMinutes += minutes;
                  existing.sleepMinutes = (existing.sleepMinutes ?? 0) + minutes;
                  appendSleepInterval(sleepIntervalsByDate, dateKey, record.startDate, record.endDate);
                } else if (stage === "deep") {
                  existing.sleepDetail.deepMinutes += minutes;
                  existing.sleepDetail.asleepMinutes += minutes;
                  existing.sleepMinutes = (existing.sleepMinutes ?? 0) + minutes;
                  appendSleepInterval(sleepIntervalsByDate, dateKey, record.startDate, record.endDate);
                } else if (stage === "awake") {
                  existing.sleepDetail.awakeMinutes += minutes;
                } else if (stage === "inbed") {
                  existing.sleepDetail.inBedMinutes += minutes;
                } else if (stage === "asleep") {
                  existing.sleepDetail.asleepMinutes += minutes;
                  existing.sleepMinutes = (existing.sleepMinutes ?? 0) + minutes;
                  appendSleepInterval(sleepIntervalsByDate, dateKey, record.startDate, record.endDate);
                }
              }
            }
            break;
          default:
            break;
        }

        byDate.set(dateKey, existing);
      },
      onWorkout: (workout) => {
        workouts.push(workout);
      },
    });
    addLog("info", "Parsed export.xml stream", {
      records: parsed.recordsProcessed,
      workouts: parsed.workoutsProcessed,
      skippedRecords: parsed.skippedRecords,
      skippedWorkouts: parsed.skippedWorkouts,
      recordTypeCounts: parsed.recordTypeCounts,
      workoutTypeCounts: parsed.workoutTypeCounts,
      dailyBuckets: byDate.size,
    });

    for (const [dateKey, entry] of byDate.entries()) {
      const hrSamples = heartRateSamplesByDate.get(dateKey) ?? [];
      const sleepIntervals = sleepIntervalsByDate.get(dateKey) ?? [];
      if (hrSamples.length > 0 && sleepIntervals.length > 0) {
        const sleepingSamples = hrSamples
          .filter((sample) => sleepIntervals.some((interval) => overlapsSleep(sample, interval)))
          .map((sample) => sample.value);

        if (sleepingSamples.length > 0) {
          const sum = sleepingSamples.reduce((acc, val) => acc + val, 0);
          entry.sleepHeartRate.avg = sum / sleepingSamples.length;
          entry.sleepHeartRate.min = Math.min(...sleepingSamples);
          entry.sleepHeartRate.max = Math.max(...sleepingSamples);
          entry.sleepHeartRate.lowAlerts = sleepingSamples.filter((val) => val < 40).length;
        }
      }
      byDate.set(dateKey, entry);
    }

    applySyntheticShabbatAugmentation();

    const gpxEntries = files.filter((item) => item.name.toLowerCase().includes("workout-routes/") && item.name.toLowerCase().endsWith(".gpx"));
    const routes = [];
    addLog("info", "GPX discovery complete", {
      gpxFiles: gpxEntries.length,
      routePaths: gpxEntries.map((entry) => entry.name),
    });
    for (const entry of gpxEntries) {
      const routeXml = await entry.async("string");
      routes.push(parseGpxRoute(entry.name, routeXml));
    }
    addLog("info", "GPX parsing complete", {
      routesParsed: routes.length,
      routesWithTimestamps: routes.filter((route) => route.firstTimestamp && route.lastTimestamp).length,
    });

    const correlations = correlateWorkoutsToRoutes(workouts, routes);
    const routesMatched = correlations.filter((item) => item.matched).length;
    const unmatchedWorkouts = correlations.length - routesMatched;
    addLog("info", "Workout correlation complete", {
      workouts: workouts.length,
      routesMatched,
      unmatchedWorkouts,
    });

    const importedAt = new Date();
    const archiveInfo = await archiveExistingAppleHealthData(requestId, importedAt);

    if (archiveInfo.archivedEntries > 0 || archiveInfo.archivedWorkouts > 0) {
      warnings.push(`Replaced existing apple-health data and archived the previous snapshot for ${ARCHIVE_TTL_DAYS} days.`);
      addLog("info", "Archived existing apple-health data", {
        archivedEntries: archiveInfo.archivedEntries,
        archivedWorkouts: archiveInfo.archivedWorkouts,
        expiresAt: buildArchiveExpiryDate(importedAt).toISOString(),
      });

      await Promise.all([
        HealthEntry.deleteMany({ sourceType: "apple-health" }),
        AppleHealthWorkout.deleteMany({}),
      ]);
    }

    const dailyEntries = toHealthEntries(byDate);
    const workoutDocs = correlations.map((item) => {
      const workout = item.workout;
      const externalId = `${workout.workoutActivityType}:${workout.startDate.toISOString()}:${workout.endDate.toISOString()}`;
      const splits = buildWorkoutSplits(workout, allHeartRateSamples);
      const kmSplits = buildKmSplitsFromSplits(splits);
      const runningCadenceSpm = deriveRunningCadenceSpm(workout);
      const stats = {
        ...(workout.stats ?? {}),
        ...(runningCadenceSpm !== null
          ? {
              runningCadenceSpm: {
                avg: runningCadenceSpm,
                min: workout.stats?.runningCadenceSpm?.min ?? null,
                max: workout.stats?.runningCadenceSpm?.max ?? null,
                sum: workout.stats?.runningCadenceSpm?.sum ?? null,
              },
            }
          : {}),
      };

      return {
        externalId,
        workoutType: workout.workoutActivityType,
        startDate: workout.startDate,
        endDate: workout.endDate,
        durationMinutes: workout.durationMinutes,
        totalEnergyBurned: workout.totalEnergyBurned,
        totalDistance: workout.totalDistance,
        sourceName: workout.sourceName,
        sourceVersion: workout.sourceVersion,
        routePath: item.route?.routePath ?? null,
        routeSummary: item.route
          ? {
              pointCount: item.route.pointCount,
              firstTimestamp: item.route.firstTimestamp,
              lastTimestamp: item.route.lastTimestamp,
              boundingBox: item.route.boundingBox,
              distanceEstimateMeters: item.route.distanceEstimateMeters,
            }
          : null,
        routeCorrelation: {
          matched: item.matched,
          confidence: item.confidence,
          matchReason: item.matchReason,
        },
        stats,
        recovery: {
          heartRateRecoveryOneMinute: findBestWorkoutRecord(heartRateRecoveryRecords, workout),
        },
        effort: {
          workoutEffortScore: findBestWorkoutRecord(workoutEffortRecords, workout),
          estimatedWorkoutEffortScore: findBestWorkoutRecord(estimatedWorkoutEffortRecords, workout),
        },
        kmSplits,
        splits,
        importedAt,
      };
    });

    const [dailyInsertResult, workoutInsertResult] = await Promise.all([
      dailyEntries.length > 0
        ? HealthEntry.insertMany(
            dailyEntries.map((entry) => ({
              ...entry,
              sourceType: "apple-health" as const,
              sourceFile: filename,
              importedAt,
            })),
            { ordered: true }
          )
        : [],
      workoutDocs.length > 0 ? AppleHealthWorkout.insertMany(workoutDocs, { ordered: true }) : [],
    ]);

    const inserted = Array.isArray(dailyInsertResult) ? dailyInsertResult.length : 0;
    const updated = 0;
    addLog("info", "Persistence complete", {
      dailyEntries: dailyEntries.length,
      inserted,
      updated,
      workoutsPersisted: correlations.length,
      workoutInserted: Array.isArray(workoutInsertResult) ? workoutInsertResult.length : 0,
    });

    const profile = await UserProfile.findOneAndUpdate(
      { key: "primary" },
      {
        $setOnInsert: {
          key: "primary",
          name: "Shimon",
          birthdate: "21/04/1979",
          weightKg: 85,
          heightCm: 177,
        },
      },
      { upsert: true, returnDocument: "after", lean: true }
    );

    const cachedEntries: HealthEntryDoc[] = dailyEntries.map((entry) => ({
      _id: `apple-health:${entry.date.toISOString()}`,
      ...entry,
      sourceType: "apple-health",
      sourceFile: filename,
      importedAt,
    }));

    const cachedWorkouts: DashboardWorkoutDoc[] = workoutDocs.map((workout) => ({
      _id: workout.externalId,
      externalId: workout.externalId,
      workoutType: workout.workoutType,
      startDate: workout.startDate,
      endDate: workout.endDate,
      durationMinutes: workout.durationMinutes,
      totalEnergyBurned: workout.totalEnergyBurned,
      totalDistance: workout.totalDistance,
      stats: workout.stats ?? null,
      routeSummary: workout.routeSummary
        ? {
            distanceEstimateMeters: workout.routeSummary.distanceEstimateMeters,
            pointCount: workout.routeSummary.pointCount,
            firstTimestamp: workout.routeSummary.firstTimestamp,
            lastTimestamp: workout.routeSummary.lastTimestamp,
          }
        : null,
      routeCorrelation: workout.routeCorrelation,
      recovery: workout.recovery ?? null,
      effort: workout.effort ?? null,
      kmSplits: workout.kmSplits ?? null,
      splits: workout.splits ?? null,
    }));

    const dashboardSnapshot = buildDashboardMetricsPayload({
      entries: cachedEntries,
      workouts: cachedWorkouts,
      profile: normalizeProfile(profile),
    });

    await Promise.all([
      writeDashboardMetricsCacheToDisk("__default__", dashboardSnapshot),
      writeDashboardMetricsCacheToDisk("range=all", dashboardSnapshot),
    ]);

    const result: AppleHealthImportResult = {
      requestId,
      status: "ok",
      counts: {
        recordsProcessed: parsed.recordsProcessed,
        workoutsProcessed: parsed.workoutsProcessed,
        routesFound: routes.length,
        routesMatched,
        unmatchedWorkouts,
        skipped: parsed.skippedRecords + parsed.skippedWorkouts,
        inserted,
        updated,
      },
      warnings,
      sampleUnmatchedWorkouts: correlations
        .filter((item) => !item.matched)
        .slice(0, 5)
        .map((item) => ({
          workoutType: item.workout.workoutActivityType,
          startDate: item.workout.startDate.toISOString(),
          endDate: item.workout.endDate.toISOString(),
          reason: item.matchReason,
        })),
    };

    await ImportLog.updateOne(
      { requestId },
      {
        $set: {
          status: "success",
          finishedAt: new Date(),
          filename,
          sourceType: "apple-health",
          result: {
            inserted: result.counts.inserted,
            updated: result.counts.updated,
            unchanged: 0,
            skipped: result.counts.skipped,
            pulled: 0,
          },
        },
        $push: { steps: { $each: logSteps } },
      }
    );

    addLog("info", "Import completed", {
      requestId,
      recordsProcessed: result.counts.recordsProcessed,
      workoutsProcessed: result.counts.workoutsProcessed,
      routesMatched: result.counts.routesMatched,
      unmatchedWorkouts: result.counts.unmatchedWorkouts,
      skipped: result.counts.skipped,
    });

    importSucceeded = true;
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    addLog("error", "Import failed", {
      error: err instanceof Error ? err.message : "Internal server error",
    });
    if (dbConnected) {
      await ImportLog.updateOne(
        { requestId },
        {
          $set: {
            status: "error",
            finishedAt: new Date(),
            filename,
            sourceType: "apple-health",
            error: err instanceof Error ? err.message : "Internal server error",
          },
          $push: { steps: { $each: logSteps } },
        },
        { upsert: true }
      ).catch(() => {
        // Do not throw from logging fallback
      });
    }

    if (isDatabaseUnavailableError(err)) {
      return NextResponse.json(databaseUnavailablePayload(requestId), { status: 503 });
    }

    return NextResponse.json({ error: "Internal server error", code: "internal_error", requestId }, { status: 500 });
  } finally {
    // Clean up blob only after successful import. On failure, keep it for retry/debug.
    if (blobUrlToDelete && importSucceeded) {
      await del(blobUrlToDelete).catch((e) =>
        console.warn("[apple-health] Failed to delete blob:", blobUrlToDelete, e)
      );
    }
  }
}

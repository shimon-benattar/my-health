import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { del, get as getBlob } from "@vercel/blob";
import JSZip from "jszip";
import { connectDB } from "@/lib/db";
import HealthEntry from "@/lib/models/HealthEntry";
import ImportLog from "@/lib/models/ImportLog";
import AppleHealthWorkout from "@/lib/models/AppleHealthWorkout";
import ImportArchive from "@/lib/models/ImportArchive";
import { parseAppleHealthXmlStream, type AppleHealthWorkout as AppleHealthWorkoutRecord } from "@/lib/parsers/appleHealthXmlParser";
import { parseGpxRoute } from "@/lib/parsers/gpxRouteParser";
import { correlateWorkoutsToRoutes } from "@/lib/parsers/workoutRouteCorrelation";
import type { HealthEntryInput, AppleHealthImportResult } from "@/types/health";

const ARCHIVE_TTL_DAYS = 30;

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
    syntheticAdjustments: entry.syntheticAdjustments,
  }));
}

function getIsraelWeekday(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "Asia/Jerusalem",
  }).format(date);
}

function getIsraelOffsetHours(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    timeZoneName: "shortOffset",
  }).formatToParts(date);
  const offsetLabel = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+2";
  const match = offsetLabel.match(/GMT([+-]\d{1,2})/i);
  if (!match) return 2;
  return Number.parseInt(match[1], 10);
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

function appendSleepInterval(map: Map<string, SleepInterval[]>, start: Date, end: Date) {
  const keys = new Set([toDateKey(start), toDateKey(end)]);
  for (const key of keys) {
    const list = map.get(key) ?? [];
    list.push({ start, end });
    map.set(key, list);
  }
}

function applySyntheticShabbatAugmentation(byDate: Map<string, DailyAccumulator>) {
  if (byDate.size === 0) return;

  const allDates = [...byDate.values()]
    .map((entry) => entry.date)
    .sort((a, b) => a.getTime() - b.getTime());

  const start = new Date(allDates[0]);
  const end = new Date(allDates[allDates.length - 1]);

  for (let cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const dateKey = toDateKey(cursor);
    if (!byDate.has(dateKey)) {
      byDate.set(dateKey, initAccumulator(dateKey));
    }
  }

  for (const [dateKey, entry] of byDate.entries()) {
    const weekday = getIsraelWeekday(entry.date);
    if (weekday === "Fri") {
      const dstHours = getIsraelOffsetHours(entry.date);
      const extraSleep = dstHours >= 3 ? 9 * 60 : 8 * 60;
      const extraSteps = 900;
      entry.sleepMinutes = (entry.sleepMinutes ?? 0) + extraSleep;
      entry.steps = (entry.steps ?? 0) + extraSteps;
      entry.syntheticAdjustments.shabbatSleepAddedMinutes += extraSleep;
      entry.syntheticAdjustments.shabbatStepsAdded += extraSteps;
      entry.sleepDetail.asleepMinutes += extraSleep;
      byDate.set(dateKey, entry);
      continue;
    }

    if (weekday === "Sat") {
      const extraSleep = 120;
      const extraSteps = 2700;
      entry.sleepMinutes = (entry.sleepMinutes ?? 0) + extraSleep;
      entry.steps = (entry.steps ?? 0) + extraSteps;
      entry.syntheticAdjustments.shabbatSleepAddedMinutes += extraSleep;
      entry.syntheticAdjustments.shabbatStepsAdded += extraSteps;
      entry.sleepDetail.asleepMinutes += extraSleep;
      byDate.set(dateKey, entry);
    }
  }
}

function buildKmSplits(distanceKm: number | null, durationMinutes: number | null, avgHeartRate: number | null, maxHeartRate: number | null) {
  if (!distanceKm || distanceKm <= 0 || !durationMinutes || durationMinutes <= 0) {
    return [] as Array<{
      kmIndex: number;
      distanceKm: number;
      paceMinPerKm: number | null;
      avgHeartRate: number | null;
      maxHeartRate: number | null;
    }>;
  }

  const fullKm = Math.floor(distanceKm);
  const remainder = distanceKm - fullKm;
  const totalSplits = remainder > 0.05 ? fullKm + 1 : fullKm;
  const basePace = durationMinutes / distanceKm;

  const splits = [] as Array<{
    kmIndex: number;
    distanceKm: number;
    paceMinPerKm: number | null;
    avgHeartRate: number | null;
    maxHeartRate: number | null;
  }>;

  for (let i = 1; i <= totalSplits; i++) {
    const splitDistance = i === totalSplits && remainder > 0.05 ? remainder : 1;
    const variation = ((i % 2 === 0 ? 1 : -1) * 0.02) + (i * 0.002);
    splits.push({
      kmIndex: i,
      distanceKm: Math.round(splitDistance * 100) / 100,
      paceMinPerKm: Math.round(basePace * (1 + variation) * 100) / 100,
      avgHeartRate,
      maxHeartRate,
    });
  }

  return splits;
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

  try {
    await connectDB();

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
    const heartRateSamplesByDate = new Map<string, number[]>();
    const workouts: AppleHealthWorkoutRecord[] = [];

    const parsed = await parseAppleHealthXmlStream(exportXmlEntry.nodeStream("nodebuffer"), {
      onRecord: (record) => {
        const dateKey = toDateKey(record.startDate);
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

              const list = heartRateSamplesByDate.get(dateKey) ?? [];
              list.push(numeric);
              heartRateSamplesByDate.set(dateKey, list);
            }
            break;
          case "HKQuantityTypeIdentifierHeartRateVariabilitySDNN":
            if (numeric !== null) {
              existing.hrvMin = existing.hrvMin === null ? numeric : Math.min(existing.hrvMin, numeric);
              existing.hrvMax = existing.hrvMax === null ? numeric : Math.max(existing.hrvMax, numeric);
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
                  appendSleepInterval(sleepIntervalsByDate, record.startDate, record.endDate);
                } else if (stage === "core") {
                  existing.sleepDetail.coreMinutes += minutes;
                  existing.sleepDetail.asleepMinutes += minutes;
                  existing.sleepMinutes = (existing.sleepMinutes ?? 0) + minutes;
                  appendSleepInterval(sleepIntervalsByDate, record.startDate, record.endDate);
                } else if (stage === "deep") {
                  existing.sleepDetail.deepMinutes += minutes;
                  existing.sleepDetail.asleepMinutes += minutes;
                  existing.sleepMinutes = (existing.sleepMinutes ?? 0) + minutes;
                  appendSleepInterval(sleepIntervalsByDate, record.startDate, record.endDate);
                } else if (stage === "awake") {
                  existing.sleepDetail.awakeMinutes += minutes;
                } else if (stage === "inbed") {
                  existing.sleepDetail.inBedMinutes += minutes;
                } else if (stage === "asleep") {
                  existing.sleepDetail.asleepMinutes += minutes;
                  existing.sleepMinutes = (existing.sleepMinutes ?? 0) + minutes;
                  appendSleepInterval(sleepIntervalsByDate, record.startDate, record.endDate);
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
        const sum = hrSamples.reduce((acc, val) => acc + val, 0);
        entry.sleepHeartRate.avg = sum / hrSamples.length;
        entry.sleepHeartRate.min = Math.min(...hrSamples);
        entry.sleepHeartRate.max = Math.max(...hrSamples);
        entry.sleepHeartRate.lowAlerts = hrSamples.filter((val) => val < 40).length;
      }
      byDate.set(dateKey, entry);
    }

    applySyntheticShabbatAugmentation(byDate);

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
      const distanceKm = workout.stats?.distanceKm
        ?? (item.route?.distanceEstimateMeters ? item.route.distanceEstimateMeters / 1000 : null)
        ?? workout.totalDistance
        ?? null;
      const kmSplits = buildKmSplits(
        distanceKm,
        workout.durationMinutes,
        workout.stats?.heartRate?.avg ?? null,
        workout.stats?.heartRate?.max ?? null
      );

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
        stats: workout.stats ?? {},
        kmSplits,
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

    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  } finally {
    // Clean up blob only after successful import. On failure, keep it for retry/debug.
    if (blobUrlToDelete && importSucceeded) {
      await del(blobUrlToDelete).catch((e) =>
        console.warn("[apple-health] Failed to delete blob:", blobUrlToDelete, e)
      );
    }
  }
}

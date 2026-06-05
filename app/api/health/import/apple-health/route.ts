import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import { connectDB } from "@/lib/db";
import HealthEntry from "@/lib/models/HealthEntry";
import ImportLog from "@/lib/models/ImportLog";
import AppleHealthWorkout from "@/lib/models/AppleHealthWorkout";
import { parseAppleHealthXmlStream, type AppleHealthWorkout as AppleHealthWorkoutRecord } from "@/lib/parsers/appleHealthXmlParser";
import { parseGpxRoute } from "@/lib/parsers/gpxRouteParser";
import { correlateWorkoutsToRoutes } from "@/lib/parsers/workoutRouteCorrelation";
import type { HealthEntryInput, AppleHealthImportResult } from "@/types/health";

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
  }));
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
  const warnings: string[] = [];

  try {
    await connectDB();
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    filename = file.name;
    addLog("info", "Import request received", {
      filename: file.name,
      fileSizeBytes: file.size,
      fileSizeHuman: bytesToHuman(file.size),
      fileType: file.type || "unknown",
    });

    await ImportLog.create({
      requestId,
      filename,
      sourceType: "apple-health",
      status: "processing",
      startedAt: new Date(),
      steps: [],
    });

    if (!file.name.toLowerCase().endsWith(".zip")) {
      addLog("warn", "Rejected non-zip upload", { filename: file.name });
      await ImportLog.updateOne(
        { requestId },
        {
          $set: { status: "error", finishedAt: new Date(), error: "Only ZIP files are accepted" },
          $push: { steps: { $each: logSteps } },
        }
      );
      return NextResponse.json({ error: "Only ZIP files are accepted" }, { status: 400 });
    }

    const zip = await JSZip.loadAsync(await file.arrayBuffer());
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
    const workouts: AppleHealthWorkoutRecord[] = [];

    const parsed = await parseAppleHealthXmlStream(exportXmlEntry.nodeStream("nodebuffer"), {
      onRecord: (record) => {
        const dateKey = toDateKey(record.startDate);
        const existing = byDate.get(dateKey) ?? {
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
        };

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
            }
            break;
          case "HKQuantityTypeIdentifierHeartRateVariabilitySDNN":
            if (numeric !== null) {
              existing.hrvMin = existing.hrvMin === null ? numeric : Math.min(existing.hrvMin, numeric);
              existing.hrvMax = existing.hrvMax === null ? numeric : Math.max(existing.hrvMax, numeric);
            }
            break;
          case "HKCategoryTypeIdentifierSleepAnalysis":
            if (record.value.includes("Asleep")) {
              const minutes = (record.endDate.getTime() - record.startDate.getTime()) / (1000 * 60);
              if (minutes > 0) {
                existing.sleepMinutes = (existing.sleepMinutes ?? 0) + minutes;
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

    const dailyEntries = toHealthEntries(byDate);
    const dailyOps = dailyEntries.map((entry) => ({
      updateOne: {
        filter: { date: entry.date },
        update: {
          $set: {
            ...entry,
            sourceType: "apple-health" as const,
            sourceFile: file.name,
            importedAt,
          },
        },
        upsert: true,
      },
    }));

    const dailyWriteResult =
      dailyOps.length > 0 ? await HealthEntry.bulkWrite(dailyOps, { ordered: false }) : null;

    const inserted = dailyWriteResult?.upsertedCount ?? 0;
    const updated = dailyWriteResult?.modifiedCount ?? 0;

    const workoutOps = correlations.map((item) => {
      const workout = item.workout;
      const externalId = `${workout.workoutActivityType}:${workout.startDate.toISOString()}:${workout.endDate.toISOString()}`;
      return {
        updateOne: {
          filter: { externalId },
          update: {
            $set: {
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
              importedAt,
            },
            $setOnInsert: { externalId },
          },
          upsert: true,
        },
      };
    });

    const workoutWriteResult =
      workoutOps.length > 0 ? await AppleHealthWorkout.bulkWrite(workoutOps, { ordered: false }) : null;
    addLog("info", "Persistence complete", {
      dailyEntries: dailyEntries.length,
      inserted,
      updated,
      workoutsPersisted: correlations.length,
      workoutUpserted: workoutWriteResult?.upsertedCount ?? 0,
      workoutModified: workoutWriteResult?.modifiedCount ?? 0,
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
  }
}

import { NextRequest, NextResponse } from "next/server";
import { databaseUnavailablePayload, isDatabaseUnavailableError } from "@/lib/apiErrors";
import { connectDB, resetDBConnection } from "@/lib/db";
import { buildDashboardMetricsPayload } from "@/lib/dashboardMetricsPayload";
import {
  getDashboardMetricsCache,
  readDashboardMetricsCacheFromDisk,
  setDashboardMetricsCache,
  writeDashboardMetricsCacheToDisk,
} from "@/lib/dashboardMetricsCache";
import HealthEntry from "@/lib/models/HealthEntry";
import UserProfile from "@/lib/models/UserProfile";
import AppleHealthWorkout from "@/lib/models/AppleHealthWorkout";
import type { HealthEntryDoc, UserProfile as DashboardUserProfile } from "@/types/health";

export const dynamic = "force-dynamic";

type RangeParam = "7d" | "30d" | "90d" | "all";

interface SportAggregate {
  sessions: number;
  totalCalories: number;
  totalSteps: number;
  peakHeartRateMax: number | null;
}

function normalizeSportKey(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const compact = raw
    .trim()
    .replace(/^HKWorkoutActivityType/i, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase();

  if (!compact) return null;
  if (compact.includes("run")) return "running";
  if (compact.includes("padel") || compact.includes("pickleball")) return "padel";
  if (compact.includes("racketball") || compact.includes("racquetball")) return "racketball";
  if (compact.includes("walk")) return "walking";
  if (compact.includes("cycle") || compact.includes("bike")) return "cycling";
  if (compact.includes("snowboard")) return "snowboarding";
  if (compact.includes("weight") || compact.includes("strength")) return "weightlifting";

  return compact.replace(/\s+/g, " ").trim();
}

function getStartDate(range: RangeParam, anchorDate: Date = new Date()): Date | null {
  if (range === "all") {
    return null;
  }

  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  const start = new Date(anchorDate);
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);
  return start;
}

function parseRange(raw: string | null): RangeParam {
  if (raw === "7d" || raw === "30d" || raw === "90d" || raw === "all") {
    return raw;
  }
  return "30d";
}

function parseDateParam(raw: string | null, endOfDay = false): Date | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;

  if (endOfDay) {
    parsed.setHours(23, 59, 59, 999);
  } else {
    parsed.setHours(0, 0, 0, 0);
  }

  return parsed;
}

function toDateSafe(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function normalizeProfile(profile: ({
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
} | DashboardUserProfile) | null): DashboardUserProfile | null {
  if (!profile) return null;

  return {
    ...profile,
    updatedAt: profile.updatedAt instanceof Date ? profile.updatedAt.toISOString() : profile.updatedAt,
  };
}

function latestPayloadDate(payload: DashboardPayload): Date | null {
  const entryTimes = payload.entries.map((entry) => toDateSafe(entry.date).getTime());
  const workoutTimes = payload.workouts.map((workout) => toDateSafe(workout.startDate).getTime());
  const latest = Math.max(0, ...entryTimes, ...workoutTimes);
  return latest > 0 ? new Date(latest) : null;
}

async function latestDatabaseDate(): Promise<Date | null> {
  const [latestEntry, latestWorkout] = await Promise.all([
    HealthEntry.findOne({}, { date: 1 }).sort({ date: -1 }).lean(),
    AppleHealthWorkout.findOne({}, { startDate: 1 }).sort({ startDate: -1 }).lean(),
  ]);

  const entryTime = latestEntry?.date ? toDateSafe(latestEntry.date as Date | string).getTime() : 0;
  const workoutTime = latestWorkout?.startDate ? toDateSafe(latestWorkout.startDate as Date | string).getTime() : 0;
  const latest = Math.max(entryTime, workoutTime);
  return latest > 0 ? new Date(latest) : null;
}

type DashboardPayload = {
  entries: HealthEntryDoc[];
  workouts: Array<{
    _id: string;
    externalId: string;
    workoutType: string;
    startDate: Date | string;
    endDate: Date | string;
    durationMinutes: number | null;
    totalEnergyBurned: number | null;
    totalDistance: number | null;
    stats: Record<string, unknown> | null;
    recovery: { heartRateRecoveryOneMinute?: number | null } | null;
    effort: { workoutEffortScore?: number | null; estimatedWorkoutEffortScore?: number | null } | null;
    routeSummary: {
      distanceEstimateMeters: number | null;
      pointCount: number;
      firstTimestamp: Date | null;
      lastTimestamp: Date | null;
    } | null;
    routeCorrelation?: { matched: boolean; confidence: number; matchReason: string };
    kmSplits: Array<{
      kmIndex: number;
      distanceKm: number;
      paceMinPerKm: number | null;
      avgHeartRate: number | null;
      maxHeartRate: number | null;
    }> | null;
    splits: Array<{
      kilometer: number;
      durationSeconds: number;
      averageHeartRate?: number | null;
      paceMinutesPerKm?: number | null;
    }> | null;
  }>;
  readiness: number;
  readinessTrend: number[];
  profile: DashboardUserProfile | null;
  sportSummary: Record<string, SportAggregate>;
  recentWatchMetricsAvailability: ReturnType<typeof buildDashboardMetricsPayload>["recentWatchMetricsAvailability"];
};

function cacheKeyForRequest(request: NextRequest): string {
  const params = request.nextUrl.searchParams;
  const entries = Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b));
  return entries.map(([key, value]) => `${key}=${value}`).join("&") || "__default__";
}

function shouldBypassCache(request: NextRequest): boolean {
  const refresh = request.nextUrl.searchParams.get("refresh");
  return refresh === "1" || refresh === "true";
}

function isCanonicalSnapshotRequest(request: NextRequest, cacheKey: string): boolean {
  const params = request.nextUrl.searchParams;
  const hasCustomFilters = Boolean(params.get("sportType") || params.get("startDate") || params.get("endDate"));
  return !hasCustomFilters && (cacheKey === "__default__" || parseRange(params.get("range")) === "all");
}

async function persistDashboardPayload(cacheKey: string, payload: DashboardPayload, request: NextRequest): Promise<void> {
  setDashboardMetricsCache(cacheKey, payload);
  await writeDashboardMetricsCacheToDisk(cacheKey, payload);

  if (!isCanonicalSnapshotRequest(request, cacheKey)) {
    return;
  }

  if (cacheKey !== "__default__") {
    setDashboardMetricsCache("__default__", payload);
    await writeDashboardMetricsCacheToDisk("__default__", payload);
  }

  if (cacheKey !== "range=all") {
    setDashboardMetricsCache("range=all", payload);
    await writeDashboardMetricsCacheToDisk("range=all", payload);
  }
}

function filterCachedPayload(request: NextRequest, payload: DashboardPayload): DashboardPayload {
  const params = request.nextUrl.searchParams;
  const range = parseRange(params.get("range"));
  const sportType = params.get("sportType")?.trim() || null;
  const rangeAnchorDate = latestPayloadDate(payload) ?? new Date();
  const rangeStartDate = getStartDate(range, rangeAnchorDate);
  const customStartDate = parseDateParam(params.get("startDate"), false);
  const customEndDate = parseDateParam(params.get("endDate"), true);
  const startDate = customStartDate ?? rangeStartDate;
  const endDate = customEndDate;

  const entries = payload.entries.filter((entry) => {
    const entryDate = toDateSafe(entry.date);
    if (startDate && entryDate < startDate) return false;
    if (endDate && entryDate > endDate) return false;
    if (sportType && entry.sportType !== sportType) return false;
    return true;
  });

  const workouts = payload.workouts.filter((workout) => {
    const workoutDate = toDateSafe(workout.startDate);
    if (startDate && workoutDate < startDate) return false;
    if (endDate && workoutDate > endDate) return false;
    if (sportType && normalizeSportKey(workout.workoutType) !== sportType) return false;
    return true;
  });

  return buildDashboardMetricsPayload({
    entries,
    workouts,
    profile: normalizeProfile(payload.profile ?? null),
  }) as DashboardPayload;
}

async function readCachedPayload(cacheKey: string): Promise<DashboardPayload | null> {
  const diskCached = await readDashboardMetricsCacheFromDisk(cacheKey);
  if (diskCached) {
    setDashboardMetricsCache(cacheKey, diskCached);
    return diskCached as DashboardPayload;
  }

  const memoryCached = getDashboardMetricsCache(cacheKey);
  if (memoryCached) {
    return memoryCached as DashboardPayload;
  }

  return null;
}

async function readBestCachedPayload(request: NextRequest, cacheKey: string): Promise<DashboardPayload | null> {
  const params = request.nextUrl.searchParams;
  const isDefaultAllRange =
    cacheKey === "__default__" ||
    cacheKey === "range=all" ||
    (!params.get("sportType") && !params.get("startDate") && !params.get("endDate") && parseRange(params.get("range")) === "all");

  if (isDefaultAllRange) {
    return await readCachedPayload(cacheKey);
  }

  const fullPayload = (await readCachedPayload("range=all")) ?? (await readCachedPayload("__default__"));
  if (!fullPayload) {
    return await readCachedPayload(cacheKey);
  }

  const filtered = filterCachedPayload(request, fullPayload);
  setDashboardMetricsCache(cacheKey, filtered);
  await writeDashboardMetricsCacheToDisk(cacheKey, filtered);
  return filtered;
}

async function loadDashboardPayload(request: NextRequest): Promise<DashboardPayload> {
  const params = request.nextUrl.searchParams;
  const range = parseRange(params.get("range"));
  const sportType = params.get("sportType")?.trim() || null;
  const customStartDate = parseDateParam(params.get("startDate"), false);
  const customEndDate = parseDateParam(params.get("endDate"), true);

  await connectDB();

  const rangeAnchorDate = customStartDate || range === "all" ? null : await latestDatabaseDate();
  const rangeStartDate = getStartDate(range, rangeAnchorDate ?? new Date());
  const startDate = customStartDate ?? rangeStartDate;
  const endDate = customEndDate;

  const filter: Record<string, unknown> = {};
  if (startDate) {
    filter.date = { ...(filter.date as Record<string, unknown> ?? {}), $gte: startDate };
  }
  if (endDate) {
    filter.date = { ...(filter.date as Record<string, unknown> ?? {}), $lte: endDate };
  }
  if (sportType) {
    filter.sportType = sportType;
  }

  const entries = (await HealthEntry.find(filter).sort({ date: -1 }).lean()) as unknown as HealthEntryDoc[];

  const workoutFilter: Record<string, unknown> = {};
  if (startDate) {
    workoutFilter.startDate = { ...(workoutFilter.startDate as Record<string, unknown> ?? {}), $gte: startDate };
  }
  if (endDate) {
    workoutFilter.startDate = { ...(workoutFilter.startDate as Record<string, unknown> ?? {}), $lte: endDate };
  }
  if (sportType) {
    // Pickleball workouts are presented as Padel, so the "padel" filter must match both.
    const workoutTypePattern = sportType.toLowerCase() === "padel" ? "padel|pickleball" : sportType;
    workoutFilter.workoutType = { $regex: workoutTypePattern, $options: "i" };
  }

  const rawWorkouts = (await AppleHealthWorkout.find(workoutFilter)
    .sort({ startDate: -1 })
    .lean()) as unknown as Array<{
    _id: unknown;
    externalId: string;
    workoutType: string;
    startDate: Date | string;
    endDate: Date | string;
    durationMinutes: number | null;
    totalEnergyBurned: number | null;
    totalDistance: number | null;
    stats?: Record<string, unknown> | null;
    recovery?: { heartRateRecoveryOneMinute?: number | null } | null;
    effort?: { workoutEffortScore?: number | null; estimatedWorkoutEffortScore?: number | null } | null;
    routeSummary?: {
      distanceEstimateMeters: number | null;
      pointCount: number;
      firstTimestamp: Date | null;
      lastTimestamp: Date | null;
    } | null;
    routeCorrelation?: { matched: boolean; confidence: number; matchReason: string };
    kmSplits?: Array<{
      kmIndex: number;
      distanceKm: number;
      paceMinPerKm: number | null;
      avgHeartRate: number | null;
      maxHeartRate: number | null;
    }>;
    splits?: Array<{
      kilometer: number;
      durationSeconds: number;
      averageHeartRate?: number | null;
      paceMinutesPerKm?: number | null;
    }>;
  }>;

  const workouts = rawWorkouts.map((workout) => ({
    _id: String(workout._id),
    externalId: workout.externalId,
    workoutType: workout.workoutType,
    startDate: workout.startDate,
    endDate: workout.endDate,
    durationMinutes: workout.durationMinutes,
    totalEnergyBurned: workout.totalEnergyBurned,
    totalDistance: workout.totalDistance,
    stats: workout.stats ?? null,
    recovery: workout.recovery ?? null,
    effort: workout.effort ?? null,
    routeSummary: workout.routeSummary ?? null,
    routeCorrelation: workout.routeCorrelation,
    kmSplits: workout.kmSplits ?? null,
    splits: workout.splits ?? null,
  }));

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

  return buildDashboardMetricsPayload({ entries, workouts, profile: normalizeProfile(profile) }) as DashboardPayload;
}

export async function GET(request: NextRequest) {
  const cacheKey = cacheKeyForRequest(request);

  if (!shouldBypassCache(request)) {
    const cachedPayload = await readBestCachedPayload(request, cacheKey);
    if (cachedPayload) {
      return NextResponse.json(cachedPayload, {
        status: 200,
        headers: {
          "x-dashboard-cache": "hit",
        },
      });
    }
  }

  try {
    const payload = await loadDashboardPayload(request);
    await persistDashboardPayload(cacheKey, payload, request);
    return NextResponse.json(payload, { status: 200 });
  } catch (err) {
    if (isDatabaseUnavailableError(err)) {
      const cachedPayload = await readBestCachedPayload(request, cacheKey);
      if (cachedPayload) {
        const unavailable = databaseUnavailablePayload();
        return NextResponse.json(
          {
            ...cachedPayload,
            stale: true,
            staleCode: unavailable.code,
            staleReason: unavailable.error,
          },
          { status: 200 }
        );
      }

      try {
        await resetDBConnection();
        const payload = await loadDashboardPayload(request);
        await persistDashboardPayload(cacheKey, payload, request);
        return NextResponse.json(payload, { status: 200 });
      } catch (retryErr) {
        console.error("[dashboard/metrics] retry failed:", retryErr);
        return NextResponse.json(databaseUnavailablePayload(), { status: 503 });
      }
    }

    console.error("[dashboard/metrics] error:", err);
    return NextResponse.json({ error: "Internal server error", code: "internal_error" }, { status: 500 });
  }
}

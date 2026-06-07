import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import HealthEntry from "@/lib/models/HealthEntry";
import UserProfile from "@/lib/models/UserProfile";
import AppleHealthWorkout from "@/lib/models/AppleHealthWorkout";
import { calcReadinessFromInput } from "@/lib/readiness";
import type { HealthEntryDoc } from "@/types/health";

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
  if (compact.includes("padel")) return "padel";
  if (compact.includes("racketball") || compact.includes("racquetball")) return "racketball";
  if (compact.includes("walk")) return "walking";
  if (compact.includes("cycle") || compact.includes("bike")) return "cycling";
  if (compact.includes("snowboard")) return "snowboarding";
  if (compact.includes("weight") || compact.includes("strength")) return "weightlifting";

  return compact.replace(/\s+/g, " ").trim();
}

function normalizeWorkoutType(raw: string | null | undefined): string | null {
  return normalizeSportKey(raw);
}

function getStartDate(range: RangeParam): Date | null {
  const now = new Date();

  if (range === "all") {
    return null;
  }

  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  const start = new Date(now);
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

function buildReadinessTrend(entries: HealthEntryDoc[]): number[] {
  const sortedAsc = [...entries].sort((a, b) => toDateSafe(a.date).getTime() - toDateSafe(b.date).getTime());

  return sortedAsc.map((entry, idx) => {
    const previous = idx > 0 ? sortedAsc[idx - 1] : null;
    return calcReadinessFromInput({
      currentHrvMax: entry.hrv?.max ?? null,
      yesterdaySleepMinutes: previous?.sleep ?? null,
    });
  });
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const range = parseRange(params.get("range"));
    const sportType = params.get("sportType")?.trim() || null;
    const rangeStartDate = getStartDate(range);
    const customStartDate = parseDateParam(params.get("startDate"), false);
    const customEndDate = parseDateParam(params.get("endDate"), true);
    const startDate = customStartDate ?? rangeStartDate;
    const endDate = customEndDate;

    await connectDB();

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
      workoutFilter.workoutType = { $regex: sportType, $options: "i" };
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
      routeSummary: workout.routeSummary ?? null,
      routeCorrelation: workout.routeCorrelation,
      kmSplits: workout.kmSplits ?? null,
    }));

    const sportSummary = workouts.reduce<Record<string, SportAggregate>>((acc, workout) => {
      const sport = normalizeWorkoutType(workout.workoutType);
      if (!sport) {
        return acc;
      }

      const existing = acc[sport] ?? {
        sessions: 0,
        totalCalories: 0,
        totalSteps: 0,
        peakHeartRateMax: null,
      };

      acc[sport] = {
        sessions: existing.sessions + 1,
        totalCalories: existing.totalCalories + (workout.totalEnergyBurned ?? 0),
        totalSteps: existing.totalSteps,
        peakHeartRateMax: existing.peakHeartRateMax,
      };

      return acc;
    }, {});

    const latest = entries[0] ?? null;
    const latestDate = latest ? toDateSafe(latest.date).getTime() : null;
    const previous =
      latestDate === null
        ? null
        : entries.find((entry) => toDateSafe(entry.date).getTime() < latestDate) ?? null;

    const readiness = calcReadinessFromInput({
      currentHrvMax: latest?.hrv?.max ?? null,
      yesterdaySleepMinutes: previous?.sleep ?? null,
    });

    const readinessTrend = buildReadinessTrend(entries);
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

    return NextResponse.json({ entries, workouts, readiness, readinessTrend, profile, sportSummary }, { status: 200 });
  } catch (err) {
    console.error("[dashboard/metrics] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

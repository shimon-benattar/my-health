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

function normalizeWorkoutType(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  if (value.includes("running")) return "running";
  if (value.includes("padel")) return "padel";
  if (value.includes("racketball")) return "racketball";
  if (value.includes("walk")) return "walking";
  if (value.includes("cycle") || value.includes("bike")) return "cycling";
  return value;
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
    const startDate = getStartDate(range);

    await connectDB();

    const filter: Record<string, unknown> = {};
    if (startDate) {
      filter.date = { $gte: startDate };
    }
    if (sportType) {
      filter.sportType = sportType;
    }

    const entries = (await HealthEntry.find(filter).sort({ date: -1 }).lean()) as unknown as HealthEntryDoc[];

    const workoutFilter: Record<string, unknown> = {};
    if (startDate) {
      workoutFilter.startDate = { $gte: startDate };
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

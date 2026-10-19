import { calcReadinessFromInput } from "@/lib/readiness";
import type { DashboardMetricsResponse, DashboardWorkoutDoc, HealthEntryDoc, UserProfile } from "@/types/health";

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

function toDateSafe(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function buildReadinessTrend(entries: HealthEntryDoc[]): number[] {
  const sortedAsc = [...entries].sort((a, b) => toDateSafe(a.date).getTime() - toDateSafe(b.date).getTime());

  return sortedAsc.flatMap((entry) => {
    if (entry.hrv?.max === null || entry.hrv?.max === undefined || entry.sleep === null || entry.sleep === undefined) {
      return [];
    }

    return [calcReadinessFromInput({
      currentHrvMax: entry.hrv.max,
      yesterdaySleepMinutes: entry.sleep,
    })];
  });
}

function availabilitySummary(
  entries: HealthEntryDoc[],
  workouts: Array<{ effort?: { workoutEffortScore?: number | null } | null; startDate: Date | string }>
) {
  const sleepingWristTemperatureEntries = entries.filter((entry) => entry.recoveryMetrics?.sleepingWristTemperature !== null && entry.recoveryMetrics?.sleepingWristTemperature !== undefined);
  const hrvRmssdEntries = entries.filter((entry) => entry.recoveryMetrics?.hrvRmssd?.avg !== null && entry.recoveryMetrics?.hrvRmssd?.avg !== undefined);
  const timeInDaylightEntries = entries.filter((entry) => entry.vitalityMetrics?.timeInDaylightMinutes !== null && entry.vitalityMetrics?.timeInDaylightMinutes !== undefined);
  const workoutEffortEntries = workouts.filter((workout) => workout.effort?.workoutEffortScore !== null && workout.effort?.workoutEffortScore !== undefined);

  return {
    sleepingWristTemperature: {
      firstDate: sleepingWristTemperatureEntries[0] ? toDateSafe(sleepingWristTemperatureEntries[0].date).toISOString().slice(0, 10) : null,
      sampleDays: sleepingWristTemperatureEntries.length,
    },
    hrvRmssd: {
      firstDate: hrvRmssdEntries[0] ? toDateSafe(hrvRmssdEntries[0].date).toISOString().slice(0, 10) : null,
      sampleDays: hrvRmssdEntries.length,
    },
    workoutEffortScore: {
      firstDate: workoutEffortEntries[0] ? toDateSafe(workoutEffortEntries[0].startDate).toISOString().slice(0, 10) : null,
      sampleCount: workoutEffortEntries.length,
    },
    timeInDaylightMinutes: {
      firstDate: timeInDaylightEntries[0] ? toDateSafe(timeInDaylightEntries[0].date).toISOString().slice(0, 10) : null,
      sampleDays: timeInDaylightEntries.length,
    },
  };
}

function buildSportSummary(workouts: DashboardWorkoutDoc[]): Record<string, SportAggregate> {
  return workouts.reduce<Record<string, SportAggregate>>((acc, workout) => {
    const sport = normalizeSportKey(workout.workoutType);
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
}

export function buildDashboardMetricsPayload({
  entries,
  workouts,
  profile,
}: {
  entries: HealthEntryDoc[];
  workouts: DashboardWorkoutDoc[];
  profile?: UserProfile | null;
}): DashboardMetricsResponse {
  const readinessTrend = buildReadinessTrend(entries);
  const readiness = readinessTrend[readinessTrend.length - 1] ?? 0;

  return {
    entries,
    workouts,
    readiness,
    readinessTrend,
    profile: profile ?? null,
    sportSummary: buildSportSummary(workouts),
    recentWatchMetricsAvailability: availabilitySummary(
      [...entries].sort((a, b) => toDateSafe(a.date).getTime() - toDateSafe(b.date).getTime()),
      [...workouts].sort((a, b) => toDateSafe(a.startDate).getTime() - toDateSafe(b.startDate).getTime())
    ),
  };
}

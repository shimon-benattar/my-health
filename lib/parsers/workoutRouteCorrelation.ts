import type { AppleHealthWorkout } from "@/lib/parsers/appleHealthXmlParser";
import type { GpxRouteSummary } from "@/lib/parsers/gpxRouteParser";

export interface CorrelationMatch {
  workout: AppleHealthWorkout;
  route: GpxRouteSummary | null;
  matched: boolean;
  confidence: number;
  matchReason: string;
}

interface CorrelationOptions {
  toleranceMinutes?: number;
  rejectionThresholdMinutes?: number;
}

function overlapWithinTolerance(
  workout: AppleHealthWorkout,
  route: GpxRouteSummary,
  toleranceMs: number
): boolean {
  if (!route.firstTimestamp || !route.lastTimestamp) return false;
  const windowStart = workout.startDate.getTime() - toleranceMs;
  const windowEnd = workout.endDate.getTime() + toleranceMs;
  return route.lastTimestamp.getTime() >= windowStart && route.firstTimestamp.getTime() <= windowEnd;
}

function scoreCandidate(workout: AppleHealthWorkout, route: GpxRouteSummary): number {
  if (!route.firstTimestamp || !route.lastTimestamp) return Number.POSITIVE_INFINITY;
  const startDelta = Math.abs(workout.startDate.getTime() - route.firstTimestamp.getTime());
  const endDelta = Math.abs(workout.endDate.getTime() - route.lastTimestamp.getTime());
  return startDelta + endDelta;
}

export function correlateWorkoutsToRoutes(
  workouts: AppleHealthWorkout[],
  routes: GpxRouteSummary[],
  options: CorrelationOptions = {}
): CorrelationMatch[] {
  const toleranceMs = (options.toleranceMinutes ?? 10) * 60 * 1000;
  const rejectionThresholdMs = (options.rejectionThresholdMinutes ?? 120) * 60 * 1000;

  return workouts.map((workout) => {
    const candidates = routes.filter((route) => overlapWithinTolerance(workout, route, toleranceMs));

    if (candidates.length === 0) {
      return {
        workout,
        route: null,
        matched: false,
        confidence: 0,
        matchReason: "No GPX candidates found in tolerance window",
      };
    }

    const ranked = candidates
      .map((route) => ({ route, score: scoreCandidate(workout, route) }))
      .sort((a, b) => {
        if (a.score !== b.score) return a.score - b.score;
        return a.route.routePath.localeCompare(b.route.routePath);
      });

    const best = ranked[0];
    if (best.score > rejectionThresholdMs) {
      return {
        workout,
        route: null,
        matched: false,
        confidence: 0,
        matchReason: "Best candidate exceeded rejection threshold",
      };
    }

    const confidence = Math.max(0, 1 - best.score / rejectionThresholdMs);
    return {
      workout,
      route: best.route,
      matched: true,
      confidence,
      matchReason: "Matched by minimum start/end delta score",
    };
  });
}

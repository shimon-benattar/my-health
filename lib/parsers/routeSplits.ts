import type { GpxRoutePoint } from "@/lib/parsers/gpxRouteParser";
import { haversineMeters } from "@/lib/parsers/geo";

export interface HeartRateWindowSample {
  start: Date;
  end: Date;
  value: number;
}

export interface RouteKmSplit {
  kmIndex: number;
  distanceKm: number;
  durationSeconds: number;
  paceMinPerKm: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
}

const SPLIT_METERS = 1000;
// A gap longer than this with almost no movement is treated as a pause and excluded from moving time.
const PAUSE_GAP_MS = 30_000;
const PAUSE_MAX_SPEED_MS = 0.5;
// A trailing remainder shorter than this is dropped (GPS noise / cooldown fragment).
const MIN_PARTIAL_METERS = 50;

function heartRateStats(samples: HeartRateWindowSample[], from: Date, to: Date) {
  const values = samples.filter((s) => s.start < to && s.end > from).map((s) => s.value);
  if (values.length === 0) return { avg: null, max: null };
  return { avg: values.reduce((a, b) => a + b, 0) / values.length, max: Math.max(...values) };
}

/**
 * Builds real 1 km splits from a timestamped GPS track. Paused time is excluded from
 * each split's duration; the final partial split is kept when it is long enough to matter.
 */
export function buildKmSplitsFromRoute(
  points: GpxRoutePoint[],
  heartRateSamples: HeartRateWindowSample[]
): RouteKmSplit[] {
  if (points.length < 2) return [];

  const splits: RouteKmSplit[] = [];
  let splitMeters = 0;
  let splitMovingMs = 0;
  let splitStart = points[0].time;

  const push = (end: Date, meters: number, movingMs: number) => {
    const hr = heartRateStats(heartRateSamples, splitStart, end);
    const seconds = Math.round(movingMs / 1000);
    splits.push({
      kmIndex: splits.length + 1,
      distanceKm: Math.round((meters / 1000) * 1000) / 1000,
      durationSeconds: seconds,
      paceMinPerKm: meters > 0 ? seconds / 60 / (meters / 1000) : null,
      avgHeartRate: hr.avg,
      maxHeartRate: hr.max,
    });
  };

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const dtMs = cur.time.getTime() - prev.time.getTime();
    if (dtMs <= 0) continue;
    const dist = haversineMeters(prev.lat, prev.lon, cur.lat, cur.lon);
    const isPause = dtMs > PAUSE_GAP_MS && dist / (dtMs / 1000) < PAUSE_MAX_SPEED_MS;
    const movingMs = isPause ? 0 : dtMs;

    let remainingDist = dist;
    let remainingMs = movingMs;
    // A single segment may cross one or more split boundaries; interpolate.
    while (splitMeters + remainingDist >= SPLIT_METERS && remainingDist > 0) {
      const needed = SPLIT_METERS - splitMeters;
      const frac = needed / remainingDist;
      const msPart = remainingMs * frac;
      const boundaryTime = new Date(cur.time.getTime() - (isPause ? 0 : remainingMs * (1 - frac)));
      push(boundaryTime, SPLIT_METERS, splitMovingMs + msPart);
      remainingDist -= needed;
      remainingMs -= msPart;
      splitMeters = 0;
      splitMovingMs = 0;
      splitStart = boundaryTime;
    }
    splitMeters += remainingDist;
    splitMovingMs += remainingMs;
  }

  if (splitMeters >= MIN_PARTIAL_METERS) {
    push(points[points.length - 1].time, splitMeters, splitMovingMs);
  }
  return splits;
}

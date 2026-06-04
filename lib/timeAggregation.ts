import type { MetricPoint } from "@/components/dashboard/MetricChart";

type Granularity = "day" | "week" | "month" | "year";
type AggregationMode = "total" | "average";

interface BucketState {
  sum: number;
  count: number;
}

function toDateSafe(value: string): Date {
  return new Date(value);
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function getWeekLabel(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${pad2(weekNo)}`;
}

function getBucketLabel(date: Date, granularity: Granularity): string {
  if (granularity === "day") {
    return date.toISOString().slice(0, 10);
  }
  if (granularity === "week") {
    return getWeekLabel(date);
  }
  if (granularity === "month") {
    return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;
  }
  return String(date.getUTCFullYear());
}

export function aggregateSeries(
  data: MetricPoint[],
  granularity: Granularity,
  mode: AggregationMode
): MetricPoint[] {
  const map = new Map<string, BucketState>();

  for (const point of data) {
    if (point.value === null) {
      continue;
    }

    const date = toDateSafe(point.label);
    if (Number.isNaN(date.getTime())) {
      continue;
    }

    const label = getBucketLabel(date, granularity);
    const state = map.get(label) ?? { sum: 0, count: 0 };
    state.sum += point.value;
    state.count += 1;
    map.set(label, state);
  }

  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, state]) => ({
      label,
      value: mode === "total" ? Math.round(state.sum * 10) / 10 : Math.round((state.sum / state.count) * 10) / 10,
    }));
}

export type { Granularity, AggregationMode };

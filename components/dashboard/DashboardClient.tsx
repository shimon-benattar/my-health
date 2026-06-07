"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import MetricChart, { type MetricPoint } from "@/components/dashboard/MetricChart";
import MetricConclusion from "@/components/dashboard/MetricConclusion";
import ReadinessGauge from "@/components/dashboard/ReadinessGauge";
import SportSection from "@/components/dashboard/SportSection";
import SourceDataTable from "@/components/dashboard/SourceDataTable";
import { getMockSportData, type SportSession } from "@/lib/mockData";
import { aggregateSeries, type AggregationMode, type Granularity } from "@/lib/timeAggregation";
import { hrvInsight, readinessInsight, rhrInsight, sleepInsight, stepsInsight, vo2Insight } from "@/lib/dashboardInsights";
import type { DashboardMetricsResponse, DashboardWorkoutDoc, HealthEntryDoc } from "@/types/health";

type Tab = "overview" | "sport";
type RangeParam = "7d" | "30d" | "90d" | "all";

interface Props {
  initialTab: Tab;
}

function toLabel(date: Date | string): string {
  return new Date(date).toISOString().slice(0, 10);
}

function buildOverviewPoints(entries: HealthEntryDoc[]) {
  const sorted = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return {
    vo2: sorted.map((e) => ({ label: toLabel(e.date), value: e.cardioFitness })) as MetricPoint[],
    rhr: sorted.map((e) => ({ label: toLabel(e.date), value: e.restingHeartRate })) as MetricPoint[],
    hrv: sorted.map((e) => ({ label: toLabel(e.date), value: e.hrv?.max ?? null })) as MetricPoint[],
    sleep: sorted.map((e) => ({ label: toLabel(e.date), value: e.sleep })) as MetricPoint[],
  };
}

function sportFromEntry(entry: HealthEntryDoc): string | null {
  const sport = entry.sportType?.trim().toLowerCase();
  if (sport) return sport;

  const workout = entry.workoutType?.trim().toLowerCase();
  if (!workout) return null;
  if (workout.includes("running")) return "running";
  if (workout.includes("padel")) return "padel";
  if (workout.includes("racketball")) return "racketball";
  if (workout.includes("walk")) return "walking";
  if (workout.includes("cycling") || workout.includes("bike")) return "cycling";
  return workout;
}

function sportFromWorkoutType(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  if (value.includes("running")) return "running";
  if (value.includes("padel")) return "padel";
  if (value.includes("racketball")) return "racketball";
  if (value.includes("walk")) return "walking";
  if (value.includes("cycle") || value.includes("bike")) return "cycling";
  return value;
}

function mapSessions(entries: HealthEntryDoc[], sport: string): SportSession[] {
  const normalized = sport.toLowerCase();

  return entries
    .filter((e) => {
      const workout = e.workoutType?.trim().toLowerCase() ?? "";
      return sportFromEntry(e) === normalized || workout.includes(normalized) || (normalized === "racketball" && workout.includes("padel"));
    })
    .filter((e) => e.heartRate?.max != null)
    .map((e) => ({
      date: new Date(e.date).toISOString().slice(0, 10),
      peakHeartRate: e.heartRate?.max ?? 0,
      calories: e.activeCalories ?? 0,
      steps: e.steps ?? 0,
      durationMinutes: e.workoutDurationMinutes ?? undefined,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function titleCase(input: string): string {
  return input
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function mapWorkoutSessions(workouts: DashboardWorkoutDoc[], entries: HealthEntryDoc[]) {
  const dailyByDate = new Map<string, HealthEntryDoc>();
  for (const entry of entries) {
    dailyByDate.set(toLabel(entry.date), entry);
  }

  const bySport = new Map<string, SportSession[]>();
  for (const workout of workouts) {
    const sport = sportFromWorkoutType(workout.workoutType);
    if (!sport) continue;

    const dateKey = toLabel(workout.startDate);
    const daily = dailyByDate.get(dateKey);
    const session: SportSession = {
      date: dateKey,
      peakHeartRate: daily?.heartRate?.max ?? 0,
      calories: workout.totalEnergyBurned ?? daily?.activeCalories ?? 0,
      steps: daily?.steps ?? 0,
      durationMinutes: workout.durationMinutes ?? undefined,
    };

    const existing = bySport.get(sport) ?? [];
    existing.push(session);
    bySport.set(sport, existing);
  }

  return bySport;
}

export default function DashboardClient({ initialTab }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [range, setRange] = useState<RangeParam>("all");
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [mode, setMode] = useState<AggregationMode>("average");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [metrics, setMetrics] = useState<DashboardMetricsResponse>({ entries: [], readiness: 0, readinessTrend: [] });

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/dashboard/metrics?range=${range}`, { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const body = (await res.json()) as DashboardMetricsResponse;
        if (active) {
          setMetrics(body);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load metrics");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [range]);

  const overview = useMemo(() => buildOverviewPoints(metrics.entries), [metrics.entries]);
  const overviewAgg = useMemo(() => ({
    vo2: aggregateSeries(overview.vo2, granularity, mode, { trimPartialEdges: mode === "total" }),
    rhr: aggregateSeries(overview.rhr, granularity, mode, { trimPartialEdges: mode === "total" }),
    hrv: aggregateSeries(overview.hrv, granularity, mode, { trimPartialEdges: mode === "total" }),
    sleep: aggregateSeries(overview.sleep, granularity, mode, { trimPartialEdges: mode === "total" }),
    steps: aggregateSeries(metrics.entries.map((e) => ({ label: toLabel(e.date), value: e.steps })), granularity, mode, { trimPartialEdges: mode === "total" }),
    readiness: aggregateSeries(
      metrics.readinessTrend.map((val, idx) => {
        const entriesAsc = [...metrics.entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        return {
          label: entriesAsc[idx] ? toLabel(entriesAsc[idx].date) : String(idx),
          value: val,
        };
      }),
      granularity,
      mode,
      { trimPartialEdges: mode === "total" }
    ),
  }), [overview, granularity, mode, metrics.entries, metrics.readinessTrend]);

  const sportSections = useMemo(() => {
    const workoutSessions = mapWorkoutSessions(metrics.workouts ?? [], metrics.entries);
    if (workoutSessions.size > 0) {
      return [...workoutSessions.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([sport, sessions]) => ({
          sport: titleCase(sport),
          sessions: sessions.sort((a, b) => a.date.localeCompare(b.date)),
          isMock: false,
        }));
    }

    const allSports = new Set<string>();
    for (const entry of metrics.entries) {
      const sport = sportFromEntry(entry);
      if (sport) {
        allSports.add(sport);
      }
    }

    const sortedSports = [...allSports].sort((a, b) => a.localeCompare(b));
    if (sortedSports.length === 0) {
      return [
        {
          sport: "Padel",
          sessions: getMockSportData("padel"),
          isMock: true,
        },
      ];
    }

    return sortedSports.map((sport) => ({
      sport: titleCase(sport),
      sessions: mapSessions(metrics.entries, sport),
      isMock: false,
    }));
  }, [metrics.entries, metrics.workouts]);

  const dataCoverage = useMemo(() => {
    if (metrics.entries.length === 0) {
      return "No imported entries";
    }
    const sorted = [...metrics.entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const first = toLabel(sorted[0].date);
    const last = toLabel(sorted[sorted.length - 1].date);
    return `${first} to ${last}`;
  }, [metrics.entries]);

  const sourceSummary = useMemo(() => {
    return metrics.entries.reduce(
      (acc, entry) => {
        const source = entry.sourceType ?? "csv";
        if (source === "apple-health") {
          acc.appleHealth += 1;
        } else {
          acc.csv += 1;
        }
        return acc;
      },
      { csv: 0, appleHealth: 0 }
    );
  }, [metrics.entries]);

  const readinessText = readinessInsight(metrics.readiness, metrics.readinessTrend);
  const vo2Text = vo2Insight(metrics.entries, metrics.profile ?? null);
  const rhrText = rhrInsight(metrics.entries);
  const hrvText = hrvInsight(metrics.entries);
  const sleepText = sleepInsight(metrics.entries);
  const stepsText = stepsInsight(metrics.entries);

  const chartInsights = [
    { title: "VO2 Max", chart: <MetricChart title="VO2 Max" tooltipKey="vo2Max" data={overviewAgg.vo2} unit="mL/min·kg" />, insight: vo2Text },
    { title: "Resting Heart Rate", chart: <MetricChart title="Resting Heart Rate" tooltipKey="rhr" data={overviewAgg.rhr} unit="bpm" />, insight: rhrText },
    { title: "HRV", chart: <MetricChart title="HRV" tooltipKey="hrv" data={overviewAgg.hrv} unit="ms" />, insight: hrvText },
    { title: "Sleep", chart: <MetricChart title="Sleep" tooltipKey="sleep" data={overviewAgg.sleep} unit="min" />, insight: sleepText },
    { title: "Steps", chart: <MetricChart title="Steps" tooltipKey="steps" data={overviewAgg.steps} unit="steps" />, insight: stepsText },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Link href="/" className="text-sm font-medium text-blue-700 hover:text-blue-800">← Back to Landing</Link>
              <h1 className="mt-1 text-2xl font-bold text-gray-900">Health Dashboard V1</h1>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 p-1 text-xs">
              <span className="px-2 py-1 font-semibold text-gray-600">Version</span>
              <Link href="/dashboard?version=v1" className="rounded bg-blue-600 px-2 py-1 font-semibold text-white">V1</Link>
              <Link href="/dashboard?version=v0" className="rounded bg-white px-2 py-1 font-semibold text-gray-700">V0</Link>
            </div>
          </div>
          <p className="mt-1 text-sm text-gray-600">V1 uses all imported history by default and dynamically adapts charts and sport views to your actual imported Apple Health data.</p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
              <p className="text-xs uppercase tracking-wide text-gray-500">Date Coverage</p>
              <p className="mt-1 font-semibold text-gray-900">{dataCoverage}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
              <p className="text-xs uppercase tracking-wide text-gray-500">Days Imported</p>
              <p className="mt-1 font-semibold text-gray-900">{metrics.entries.length}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
              <p className="text-xs uppercase tracking-wide text-gray-500">Apple Health Days</p>
              <p className="mt-1 font-semibold text-gray-900">{sourceSummary.appleHealth}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
              <p className="text-xs uppercase tracking-wide text-gray-500">CSV Days</p>
              <p className="mt-1 font-semibold text-gray-900">{sourceSummary.csv}</p>
            </div>
          </div>

          <div className="mt-4 inline-flex rounded-lg border border-gray-200 bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => setTab("overview")}
              className={`rounded-md px-4 py-2 text-sm font-medium ${tab === "overview" ? "bg-white text-blue-700 shadow-sm" : "text-gray-600"}`}
              data-testid="tab-overview"
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => setTab("sport")}
              className={`rounded-md px-4 py-2 text-sm font-medium ${tab === "sport" ? "bg-white text-blue-700 shadow-sm" : "text-gray-600"}`}
              data-testid="tab-sport"
            >
              Sport Performance
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-gray-700">Range:</span>
            {(["all", "90d", "30d", "7d"] as RangeParam[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setRange(value)}
                className={`rounded px-2 py-1 ${range === value ? "bg-blue-600 text-white" : "bg-white text-gray-700 border border-gray-300"}`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        {loading && <p className="text-sm text-gray-500">Loading dashboard metrics...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {!loading && !error && tab === "overview" && (
          <section className="space-y-5" data-testid="overview-panel">
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 text-sm">
              <span className="font-medium text-gray-700">View by:</span>
              {(["day", "week", "month", "year"] as Granularity[]).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGranularity(g)}
                  className={`rounded px-2 py-1 ${granularity === g ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}`}
                >
                  {g}
                </button>
              ))}
              <span className="ml-2 font-medium text-gray-700">Mode:</span>
              {(["average", "total"] as AggregationMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`rounded px-2 py-1 ${mode === m ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}`}
                >
                  {m}
                </button>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {chartInsights.map((item) => (
                <div key={item.title} className="space-y-3">
                  {item.chart}
                  <MetricConclusion title={item.title} summary={item.insight.summary} trend={item.insight.trend} action={item.insight.action} />
                </div>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <MetricChart title="Readiness Trend" tooltipKey="hrv" data={overviewAgg.readiness} unit="score" />
              <div className="space-y-3">
                <ReadinessGauge score={metrics.readiness} />
                <MetricConclusion title="Readiness Score" summary={readinessText.summary} trend={readinessText.trend} action={readinessText.action} />
              </div>
            </div>

            <SourceDataTable entries={metrics.entries} />
          </section>
        )}

        {!loading && !error && tab === "sport" && (
          <section className="space-y-5" data-testid="sport-panel">
            {sportSections.map((section) => (
              <SportSection
                key={section.sport}
                sport={section.sport}
                sessions={section.sessions}
                isMock={section.isMock}
                granularity={granularity}
                mode={mode}
              />
            ))}
          </section>
        )}
      </main>
    </div>
  );
}

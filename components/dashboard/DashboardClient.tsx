"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import MetricChart, { type MetricPoint } from "@/components/dashboard/MetricChart";
import ReadinessGauge from "@/components/dashboard/ReadinessGauge";
import SportSection from "@/components/dashboard/SportSection";
import SourceDataTable from "@/components/dashboard/SourceDataTable";
import { getMockSportData, type SportSession } from "@/lib/mockData";
import { aggregateSeries, type AggregationMode, type Granularity } from "@/lib/timeAggregation";
import { hrvInsight, readinessInsight, rhrInsight, sleepInsight, stepsInsight, vo2Insight } from "@/lib/dashboardInsights";
import type { DashboardMetricsResponse, HealthEntryDoc } from "@/types/health";

type Tab = "overview" | "sport";

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
  return entry.sportType?.trim().toLowerCase() ?? null;
}

function mapSessions(entries: HealthEntryDoc[], sport: string): SportSession[] {
  const normalized = sport.toLowerCase();

  return entries
    .filter((e) => sportFromEntry(e) === normalized)
    .filter((e) => e.heartRate?.max != null)
    .map((e) => ({
      date: new Date(e.date).toISOString().slice(0, 10),
      peakHeartRate: e.heartRate?.max ?? 0,
      calories: e.activeCalories ?? 0,
      steps: e.steps ?? 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export default function DashboardClient({ initialTab }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
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
        const res = await fetch("/api/dashboard/metrics?range=30d", { cache: "no-store" });
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
  }, []);

  const overview = useMemo(() => buildOverviewPoints(metrics.entries), [metrics.entries]);
  const overviewAgg = useMemo(() => ({
    vo2: aggregateSeries(overview.vo2, granularity, mode),
    rhr: aggregateSeries(overview.rhr, granularity, mode),
    hrv: aggregateSeries(overview.hrv, granularity, mode),
    sleep: aggregateSeries(overview.sleep, granularity, mode),
    steps: aggregateSeries(metrics.entries.map((e) => ({ label: toLabel(e.date), value: e.steps })), granularity, mode),
    readiness: aggregateSeries(
      metrics.readinessTrend.map((val, idx) => {
        const entriesAsc = [...metrics.entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        return {
          label: entriesAsc[idx] ? toLabel(entriesAsc[idx].date) : String(idx),
          value: val,
        };
      }),
      granularity,
      mode
    ),
  }), [overview, granularity, mode, metrics.entries, metrics.readinessTrend]);

  const runningReal = useMemo(() => mapSessions(metrics.entries, "running"), [metrics.entries]);
  const racketballReal = useMemo(() => mapSessions(metrics.entries, "racketball"), [metrics.entries]);

  const runningSessions = runningReal;
  const racketballSessions = racketballReal.length > 0 ? racketballReal : getMockSportData("padel");

  const readinessText = readinessInsight(metrics.readiness, metrics.readinessTrend);
  const vo2Text = vo2Insight(metrics.entries, metrics.profile ?? null);
  const rhrText = rhrInsight(metrics.entries);
  const hrvText = hrvInsight(metrics.entries);
  const sleepText = sleepInsight(metrics.entries);
  const stepsText = stepsInsight(metrics.entries);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Link href="/" className="text-sm font-medium text-blue-700 hover:text-blue-800">← Back to Landing</Link>
              <h1 className="mt-1 text-2xl font-bold text-gray-900">Health Dashboard</h1>
            </div>
          </div>
          <p className="mt-1 text-sm text-gray-600">Interactive trends, readiness insights, and sport performance deep-dive.</p>

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

            <ReadinessGauge score={metrics.readiness} />
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900" data-testid="readiness-explainer">
              <p><strong>What 53 means:</strong> {readinessText.standing}</p>
              <p className="mt-1"><strong>Trend:</strong> {readinessText.trend}</p>
              <p className="mt-1"><strong>What to do:</strong> {readinessText.action}</p>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <MetricChart title="VO2 Max" tooltipKey="vo2Max" data={overviewAgg.vo2} unit="mL/min·kg" />
              <MetricChart title="Resting Heart Rate" tooltipKey="rhr" data={overviewAgg.rhr} unit="bpm" />
              <MetricChart title="HRV" tooltipKey="hrv" data={overviewAgg.hrv} unit="ms" />
              <MetricChart title="Sleep" tooltipKey="sleep" data={overviewAgg.sleep} unit="min" />
              <MetricChart title="Steps" tooltipKey="steps" data={overviewAgg.steps} unit="steps" />
              <MetricChart title="Readiness Trend" tooltipKey="hrv" data={overviewAgg.readiness} unit="score" />
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {[vo2Text, rhrText, hrvText, sleepText, stepsText].map((insight, idx) => (
                <div key={idx} className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700">
                  <p><strong>Standing:</strong> {insight.standing}</p>
                  <p className="mt-1"><strong>Trend:</strong> {insight.trend}</p>
                  <p className="mt-1"><strong>Action:</strong> {insight.action}</p>
                </div>
              ))}
            </div>

            <SourceDataTable entries={metrics.entries} />
          </section>
        )}

        {!loading && !error && tab === "sport" && (
          <section className="space-y-5" data-testid="sport-panel">
            {runningSessions.length > 0 ? (
              <SportSection sport="Running" sessions={runningSessions} isMock={false} granularity={granularity} mode={mode} />
            ) : (
              <div className="rounded-lg border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-600">
                Running sessions were detected in your CSV export format, but existing database rows may be from earlier imports.
                Re-import the CSV from the landing page to populate running workout metadata.
              </div>
            )}
            <SportSection sport="Padel" sessions={racketballSessions} isMock={racketballReal.length === 0} granularity={granularity} mode={mode} />
          </section>
        )}
      </main>
    </div>
  );
}

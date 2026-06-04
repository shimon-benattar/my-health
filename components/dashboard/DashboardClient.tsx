"use client";

import { useEffect, useMemo, useState } from "react";
import UploadForm from "@/components/UploadForm";
import MetricChart, { type MetricPoint } from "@/components/dashboard/MetricChart";
import ReadinessGauge from "@/components/dashboard/ReadinessGauge";
import SportSection from "@/components/dashboard/SportSection";
import { getMockSportData, type SportSession } from "@/lib/mockData";
import type { DashboardMetricsResponse, HealthEntryDoc } from "@/types/health";

type Tab = "overview" | "sport";

interface Props {
  initialTab: Tab;
}

function toLabel(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [metrics, setMetrics] = useState<DashboardMetricsResponse>({ entries: [], readiness: 0 });

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

  const runningReal = useMemo(() => mapSessions(metrics.entries, "running"), [metrics.entries]);
  const padelReal = useMemo(() => mapSessions(metrics.entries, "padel"), [metrics.entries]);

  const runningSessions = runningReal.length > 0 ? runningReal : getMockSportData("running");
  const padelSessions = padelReal.length > 0 ? padelReal : getMockSportData("padel");

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-6">
          <h1 className="text-2xl font-bold text-gray-900">Health Dashboard</h1>
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
        <div className="max-w-xl">
          <UploadForm />
        </div>

        {loading && <p className="text-sm text-gray-500">Loading dashboard metrics...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {!loading && !error && tab === "overview" && (
          <section className="space-y-5" data-testid="overview-panel">
            <ReadinessGauge score={metrics.readiness} />
            <div className="grid gap-4 lg:grid-cols-2">
              <MetricChart title="VO2 Max" tooltipKey="vo2Max" data={overview.vo2} unit="mL/min·kg" />
              <MetricChart title="Resting Heart Rate" tooltipKey="rhr" data={overview.rhr} unit="bpm" />
              <MetricChart title="HRV" tooltipKey="hrv" data={overview.hrv} unit="ms" />
              <MetricChart title="Sleep" tooltipKey="sleep" data={overview.sleep} unit="min" />
            </div>
          </section>
        )}

        {!loading && !error && tab === "sport" && (
          <section className="space-y-5" data-testid="sport-panel">
            <SportSection sport="Running" sessions={runningSessions} isMock={runningReal.length === 0} />
            <SportSection sport="Padel" sessions={padelSessions} isMock={padelReal.length === 0} />
          </section>
        )}
      </main>
    </div>
  );
}

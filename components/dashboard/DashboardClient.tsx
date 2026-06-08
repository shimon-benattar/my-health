"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import MetricChart, { type MetricPoint } from "@/components/dashboard/MetricChart";
import MetricConclusion from "@/components/dashboard/MetricConclusion";
import ReadinessGauge from "@/components/dashboard/ReadinessGauge";
import SourceDataTable from "@/components/dashboard/SourceDataTable";
import SportSection from "@/components/dashboard/SportSection";
import { getMockSportData, type SportSession } from "@/lib/mockData";
import { calcReadinessFromInput } from "@/lib/readiness";
import { aggregateSeries, type AggregationMode, type Granularity } from "@/lib/timeAggregation";
import { activeCaloriesInsight, hrvInsight, readinessInsight, rhrInsight, sleepInsight, stepsInsight, vo2Insight } from "@/lib/dashboardInsights";
import type { DashboardMetricsResponse, DashboardWorkoutDoc, HealthEntryDoc } from "@/types/health";

type Tab = "overview" | "sport";
type RangeParam = "7d" | "30d" | "90d" | "all";

interface Props {
  initialTab: Tab;
}

function toLabel(date: Date | string): string {
  return new Date(date).toISOString().slice(0, 10);
}

function toDisplayDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

function toInputDate(date: Date | string): string {
  return new Date(date).toISOString().slice(0, 10);
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

function sportLabel(key: string): string {
  if (key === "racketball") return "Padel (Racketball source)";
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function isAppleHealthEntry(entry: HealthEntryDoc): boolean {
  return (entry.sourceType ?? "csv") === "apple-health";
}

function formatSleepDuration(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "-";
  const whole = Math.round(minutes);
  const hours = Math.floor(whole / 60);
  const mins = whole % 60;
  return `${hours}h ${mins}m`;
}

function normalizeManualAdjustments(entry: HealthEntryDoc): HealthEntryDoc | null {
  const syntheticSleep = entry.syntheticAdjustments?.shabbatSleepAddedMinutes ?? 0;
  const syntheticSteps = entry.syntheticAdjustments?.shabbatStepsAdded ?? 0;
  const sourceIsSyntheticOnly = (entry.sourceFile ?? "").toLowerCase() === "synthetic-shabbat-augmentation";

  const adjustedSleep = entry.sleep !== null ? Math.max(0, (entry.sleep ?? 0) - syntheticSleep) : null;
  const adjustedSteps = entry.steps !== null ? Math.max(0, (entry.steps ?? 0) - syntheticSteps) : null;
  const adjustedAsleep = Math.max(0, (entry.sleepDetail?.asleepMinutes ?? 0) - syntheticSleep);

  const noRealDailyValues =
    (adjustedSleep === null || adjustedSleep === 0) &&
    (adjustedSteps === null || adjustedSteps === 0) &&
    entry.activeCalories === null &&
    entry.cardioFitness === null &&
    entry.restingHeartRate === null &&
    entry.hrv === null &&
    entry.heartRate === null;

  if (sourceIsSyntheticOnly || noRealDailyValues) {
    return null;
  }

  return {
    ...entry,
    sleep: adjustedSleep,
    steps: adjustedSteps,
    sleepDetail: entry.sleepDetail
      ? {
          ...entry.sleepDetail,
          asleepMinutes: adjustedAsleep,
        }
      : entry.sleepDetail,
    syntheticAdjustments: {
      shabbatSleepAddedMinutes: 0,
      shabbatStepsAdded: 0,
    },
  };
}

function sleepQualityLabel(entry: HealthEntryDoc): string {
  const totalSleep = entry.sleep ?? 0;
  const deep = entry.sleepDetail?.deepMinutes ?? 0;
  const rem = entry.sleepDetail?.remMinutes ?? 0;
  const awake = entry.sleepDetail?.awakeMinutes ?? 0;

  if (totalSleep <= 0) return "No sleep sample";
  const deepRatio = deep / totalSleep;
  const remRatio = rem / totalSleep;
  const awakeRatio = awake / totalSleep;

  if (totalSleep >= 450 && deepRatio >= 0.18 && remRatio >= 0.18 && awakeRatio <= 0.12) return "Excellent duration and sleep architecture";
  if (totalSleep >= 390 && deepRatio >= 0.14 && remRatio >= 0.15 && awakeRatio <= 0.16) return "Good structure with balanced deep and REM";
  if (totalSleep >= 330) return "Adequate total sleep, but quality can improve";
  return "Short or fragmented night, recovery likely reduced";
}

function buildReadinessTrend(entries: HealthEntryDoc[]): number[] {
  const sortedAsc = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return sortedAsc.map((entry, idx) => {
    const previous = idx > 0 ? sortedAsc[idx - 1] : null;
    return calcReadinessFromInput({
      currentHrvMax: entry.hrv?.max ?? null,
      yesterdaySleepMinutes: previous?.sleep ?? null,
    });
  });
}

function buildOverviewPoints(entries: HealthEntryDoc[]) {
  const sorted = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return {
    vo2: sorted.map((e) => ({ label: toLabel(e.date), value: e.cardioFitness })) as MetricPoint[],
    rhr: sorted.map((e) => ({ label: toLabel(e.date), value: e.restingHeartRate })) as MetricPoint[],
    hrv: sorted.map((e) => ({ label: toLabel(e.date), value: e.hrv?.max ?? null })) as MetricPoint[],
    sleep: sorted.map((e) => ({ label: toLabel(e.date), value: e.sleep })) as MetricPoint[],
    activeCalories: sorted.map((e) => ({ label: toLabel(e.date), value: e.activeCalories })) as MetricPoint[],
  };
}

function mapSessions(entries: HealthEntryDoc[], sport: string): SportSession[] {
  const normalized = sport.toLowerCase();

  return entries
    .filter((e) => {
      const sportType = normalizeSportKey(e.sportType);
      const workoutType = normalizeSportKey(e.workoutType);
      return sportType === normalized || workoutType === normalized || (normalized === "padel" && workoutType === "racketball");
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

function mapWorkoutSessions(workouts: DashboardWorkoutDoc[], entries: HealthEntryDoc[]) {
  function sanitizeDistanceKm(value: number | null | undefined): number | null {
    if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return null;
    if (value > 80) return null;
    return value;
  }

  function sanitizePace(value: number | undefined): number | undefined {
    if (value === undefined || !Number.isFinite(value) || value <= 0) return undefined;
    if (value < 2 || value > 20) return undefined;
    return value;
  }

  const dailyByDate = new Map<string, HealthEntryDoc>();
  for (const entry of entries) {
    dailyByDate.set(toLabel(entry.date), entry);
  }

  const bySport = new Map<string, SportSession[]>();
  for (const workout of workouts) {
    const sport = normalizeSportKey(workout.workoutType);
    if (!sport) continue;

    const dateKey = toLabel(workout.startDate);
    const daily = dailyByDate.get(dateKey);
    const s = workout.stats;

    const distanceKmXml = sanitizeDistanceKm(s?.distanceKm ?? null);
    const distanceKmGpx = sanitizeDistanceKm(
      workout.routeSummary?.distanceEstimateMeters !== null && workout.routeSummary?.distanceEstimateMeters !== undefined
        ? workout.routeSummary.distanceEstimateMeters / 1000
        : null
    );
    const distanceKmTotal = sanitizeDistanceKm(workout.totalDistance ?? null);
    const distanceKmFinal = distanceKmXml ?? distanceKmGpx ?? distanceKmTotal;

    const distanceMeters = distanceKmFinal !== null ? distanceKmFinal * 1000 : undefined;
    const durationMinutes = workout.durationMinutes ?? undefined;

    const avgSpeedKmh = s?.runningSpeedKmh?.avg ?? null;
    const paceFromSpeed = avgSpeedKmh && avgSpeedKmh > 0
      ? 60 / avgSpeedKmh
      : (distanceKmFinal && distanceKmFinal > 0 && durationMinutes)
        ? durationMinutes / distanceKmFinal
        : undefined;
    const paceMinPerKm = sanitizePace(paceFromSpeed);

    const calories = s?.activeCalories
      ?? workout.totalEnergyBurned
      ?? daily?.activeCalories
      ?? 0;

    const session: SportSession = {
      date: dateKey,
      startTime: new Date(workout.startDate).toISOString(),
      endTime: new Date(workout.endDate).toISOString(),
      peakHeartRate: s?.heartRate?.max ?? daily?.heartRate?.max ?? 0,
      avgHeartRate: s?.heartRate?.avg ?? undefined,
      minHeartRate: s?.heartRate?.min ?? undefined,
      calories,
      steps: s?.stepCount ?? daily?.steps ?? 0,
      durationMinutes,
      distanceKm: distanceKmFinal ?? undefined,
      distanceMeters,
      paceMinPerKm,
      avgSpeedKmh: avgSpeedKmh ?? undefined,
      maxSpeedKmh: s?.runningSpeedKmh?.max ?? undefined,
      avgStrideLengthM: s?.runningStrideM?.avg ?? undefined,
      avgGroundContactMs: s?.runningGroundContactMs?.avg ?? undefined,
      avgRunningPowerW: s?.runningPowerW?.avg ?? undefined,
      avgVerticalOscillationCm: s?.runningVerticalOscillationCm?.avg ?? undefined,
      elevationAscendedM: s?.elevationAscendedCm !== undefined && s?.elevationAscendedCm !== null
        ? s.elevationAscendedCm / 100
        : undefined,
      averageMETs: s?.averageMETs ?? undefined,
      kmSplits: workout.kmSplits ?? undefined,
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
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const [selectedSport, setSelectedSport] = useState<string>("all");
  const [showSleepDrilldown, setShowSleepDrilldown] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ range });
        if (showDateFilter && customStartDate) params.set("startDate", customStartDate);
        if (showDateFilter && customEndDate) params.set("endDate", customEndDate);

        const res = await fetch(`/api/dashboard/metrics?${params.toString()}`, { cache: "no-store" });
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
  }, [range, customStartDate, customEndDate, showDateFilter]);

  const appleHealthEntries = useMemo(() => metrics.entries.filter(isAppleHealthEntry), [metrics.entries]);
  const chartEntries = useMemo(() => {
    return appleHealthEntries
      .map((entry) => normalizeManualAdjustments(entry))
      .filter((entry): entry is HealthEntryDoc => entry !== null);
  }, [appleHealthEntries]);

  const earliestDate = useMemo(() => {
    if (chartEntries.length === 0) return "";
    const sorted = [...chartEntries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return toInputDate(sorted[0].date);
  }, [chartEntries]);

  const latestDate = useMemo(() => {
    if (chartEntries.length === 0) return "";
    const sorted = [...chartEntries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return toInputDate(sorted[sorted.length - 1].date);
  }, [chartEntries]);

  const workoutSessionsMap = useMemo(() => mapWorkoutSessions(metrics.workouts ?? [], chartEntries), [metrics.workouts, chartEntries]);

  const availableSports = useMemo(() => {
    const fromWorkouts = [...workoutSessionsMap.keys()];
    if (fromWorkouts.length > 0) {
      return fromWorkouts.sort((a, b) => a.localeCompare(b));
    }

    const fromEntries = new Set<string>();
    for (const entry of chartEntries) {
      const sport = normalizeSportKey(entry.sportType) ?? normalizeSportKey(entry.workoutType);
      if (sport) fromEntries.add(sport);
    }
    return [...fromEntries].sort((a, b) => a.localeCompare(b));
  }, [workoutSessionsMap, chartEntries]);

  useEffect(() => {
    if (availableSports.length === 0) {
      setSelectedSport("all");
      return;
    }

    if (selectedSport === "all") {
      setSelectedSport(availableSports.includes("running") ? "running" : availableSports[0]);
      return;
    }

    if (!availableSports.includes(selectedSport)) {
      setSelectedSport(availableSports.includes("running") ? "running" : availableSports[0]);
    }
  }, [availableSports, selectedSport]);

  const workoutCount = metrics.workouts?.length ?? 0;
  const appleHealthReadinessTrend = useMemo(() => buildReadinessTrend(chartEntries), [chartEntries]);
  const appleHealthReadiness = useMemo(() => {
    const sorted = [...chartEntries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const latest = sorted[0] ?? null;
    const previous = sorted.find((entry) => new Date(entry.date).getTime() < new Date(latest?.date ?? 0).getTime()) ?? null;

    return calcReadinessFromInput({
      currentHrvMax: latest?.hrv?.max ?? null,
      yesterdaySleepMinutes: previous?.sleep ?? null,
    });
  }, [chartEntries]);

  const overview = useMemo(() => buildOverviewPoints(chartEntries), [chartEntries]);
  const overviewAgg = useMemo(() => ({
    vo2: aggregateSeries(overview.vo2, granularity, mode),
    rhr: aggregateSeries(overview.rhr, granularity, mode),
    hrv: aggregateSeries(overview.hrv, granularity, mode),
    sleep: aggregateSeries(overview.sleep, granularity, mode),
    activeCalories: aggregateSeries(overview.activeCalories, granularity, mode),
    steps: aggregateSeries(chartEntries.map((e) => ({ label: toLabel(e.date), value: e.steps })), granularity, mode),
    readiness: aggregateSeries(
      appleHealthReadinessTrend.map((val, idx) => {
        const entriesAsc = [...chartEntries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        return {
          label: entriesAsc[idx] ? toLabel(entriesAsc[idx].date) : String(idx),
          value: val,
        };
      }),
      granularity,
      mode
    ),
  }), [overview, granularity, mode, chartEntries, appleHealthReadinessTrend]);

  const sportSections = useMemo(() => {
    if (workoutSessionsMap.size > 0) {
      const allSections = [...workoutSessionsMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([sport, sessions]) => ({
          key: sport,
          sport: sportLabel(sport),
          sessions: sessions.sort((a, b) => a.date.localeCompare(b.date)),
          isMock: false,
        }));

      if (selectedSport === "all") return allSections;
      return allSections.filter((section) => section.key === selectedSport);
    }

    if (availableSports.length === 0) {
      return [
        {
          key: "padel",
          sport: "Padel",
          sessions: getMockSportData("padel"),
          isMock: true,
        },
      ];
    }

    const mapped = availableSports.map((sport) => ({
      key: sport,
      sport: sportLabel(sport),
      sessions: mapSessions(chartEntries, sport),
      isMock: false,
    }));

    if (selectedSport === "all") return mapped;
    return mapped.filter((section) => section.key === selectedSport);
  }, [workoutSessionsMap, availableSports, selectedSport, chartEntries]);

  const dataCoverage = useMemo(() => {
    if (chartEntries.length === 0) {
      return "No Apple Health data imported yet";
    }
    const sorted = [...chartEntries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const first = toDisplayDate(sorted[0].date);
    const last = toDisplayDate(sorted[sorted.length - 1].date);
    return `${first} to ${last}`;
  }, [chartEntries]);

  const importSummary = useMemo(() => {
    return {
      workoutSessions: workoutCount,
      sportsCaptured: availableSports.length,
    };
  }, [workoutCount, availableSports.length]);

  const sleepDrilldownRows = useMemo(() => {
    return [...chartEntries]
      .filter((e) => e.sleepDetail || e.sleepHeartRate)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 60);
  }, [chartEntries]);

  const totalLowSleepHrAlerts = useMemo(() => {
    return sleepDrilldownRows.reduce((acc, row) => acc + (row.sleepHeartRate?.lowAlerts ?? 0), 0);
  }, [sleepDrilldownRows]);

  const readinessText = readinessInsight(appleHealthReadiness, appleHealthReadinessTrend, range);
  const vo2Text = vo2Insight(chartEntries, metrics.profile ?? null, range);
  const rhrText = rhrInsight(chartEntries, range);
  const hrvText = hrvInsight(chartEntries, range);
  const sleepText = sleepInsight(chartEntries, range);
  const stepsText = stepsInsight(chartEntries, range);
  const activeCaloriesText = activeCaloriesInsight(chartEntries, range);

  const chartInsights = [
    { title: "VO2 Max", chart: <MetricChart title="VO2 Max" tooltipKey="vo2Max" data={overviewAgg.vo2} unit="mL/min·kg" />, insight: vo2Text },
    { title: "Resting Heart Rate", chart: <MetricChart title="Resting Heart Rate" tooltipKey="rhr" data={overviewAgg.rhr} unit="bpm" />, insight: rhrText },
    { title: "HRV", chart: <MetricChart title="HRV" tooltipKey="hrv" data={overviewAgg.hrv} unit="ms" />, insight: hrvText },
    { title: "Sleep", chart: <MetricChart title="Sleep" tooltipKey="sleep" data={overviewAgg.sleep} unit="min" />, insight: sleepText },
    { title: "Active Calories", chart: <MetricChart title="Active Calories" tooltipKey="activeCalories" data={overviewAgg.activeCalories} unit="kcal" />, insight: activeCaloriesText },
    { title: "Steps", chart: <MetricChart title="Steps" tooltipKey="steps" data={overviewAgg.steps} unit="steps" />, insight: stepsText },
  ];

  function resetAllFilters() {
    setRange("all");
    setGranularity("day");
    setMode("average");
    setSelectedSport("all");
    setCustomStartDate("");
    setCustomEndDate("");
    setShowDateFilter(false);
  }

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
              <span className="rounded bg-blue-600 px-2 py-1 font-semibold text-white">V1</span>
            </div>
          </div>
          <p className="mt-1 text-sm text-gray-600">V1 shows Apple Health imports only and focuses on usable daily and workout insights.</p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <button
              type="button"
              onClick={() => setShowDateFilter((prev) => !prev)}
              className="rounded-lg border border-gray-200 bg-white p-3 text-left text-sm hover:bg-gray-50"
            >
              <p className="text-xs uppercase tracking-wide text-gray-500">Date Coverage</p>
              <p className="mt-1 font-semibold text-gray-900">{dataCoverage}</p>
            </button>
            <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
              <p className="text-xs uppercase tracking-wide text-gray-500">Workout Sessions</p>
              <p className="mt-1 font-semibold text-gray-900">{importSummary.workoutSessions}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
              <p className="text-xs uppercase tracking-wide text-gray-500">Sports Captured</p>
              <p className="mt-1 font-semibold text-gray-900">{importSummary.sportsCaptured}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
              <p className="text-xs uppercase tracking-wide text-gray-500">Current Readiness</p>
              <p className="mt-1 font-semibold text-gray-900">{appleHealthReadiness}</p>
            </div>
          </div>

          {showDateFilter && (
            <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3 text-sm">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-xs font-medium text-gray-600">
                  Start date
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                  />
                </label>
                <label className="text-xs font-medium text-gray-600">
                  End date
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                  />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => setCustomStartDate(earliestDate)} className="rounded border border-gray-300 bg-white px-2 py-1 text-xs">Use earliest start</button>
                <button type="button" onClick={() => setCustomEndDate(latestDate)} className="rounded border border-gray-300 bg-white px-2 py-1 text-xs">Use latest end</button>
                <button type="button" onClick={resetAllFilters} className="rounded bg-slate-900 px-2 py-1 text-xs text-white">Reset all data filters</button>
              </div>
            </div>
          )}

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
                <ReadinessGauge score={appleHealthReadiness} />
                <MetricConclusion title="Readiness Score" summary={readinessText.summary} trend={readinessText.trend} action={readinessText.action} />
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
                  Readiness Trend is calculated per day from HRV max and previous-night sleep, then aggregated by your selected granularity.
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-gray-900">Sleep Drilldown</p>
                  <p className="text-xs text-gray-500">Sleep stages, sleeping heart-rate range, and low-HR alerts from imported records.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSleepDrilldown((prev) => !prev)}
                  className="rounded border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700"
                >
                  {showSleepDrilldown ? "Hide details" : "Drill down"}
                </button>
              </div>

              {totalLowSleepHrAlerts > 0 && (
                <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
                  Low sleeping heart-rate alerts detected in imported data: {totalLowSleepHrAlerts}. Consider reviewing this with a clinician if this is new for you.
                </div>
              )}

              {showSleepDrilldown && (
                <div className="mt-3 overflow-x-auto rounded border border-slate-200">
                  <table className="min-w-full text-xs text-slate-900">
                    <thead className="bg-slate-100 text-slate-800">
                      <tr>
                        <th className="px-3 py-2 text-left">Date</th>
                        <th className="px-3 py-2 text-left">Total Sleep</th>
                        <th className="px-3 py-2 text-left">Sleep Quality</th>
                        <th className="px-3 py-2 text-left">REM</th>
                        <th className="px-3 py-2 text-left">Core</th>
                        <th className="px-3 py-2 text-left">Deep</th>
                        <th className="px-3 py-2 text-left">Awake</th>
                        <th className="px-3 py-2 text-left">Sleep HR (avg/min/max)</th>
                        <th className="px-3 py-2 text-left">Low HR alerts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sleepDrilldownRows.map((row) => (
                        <tr key={String(row._id)} className="border-t border-slate-100">
                          <td className="px-3 py-2 font-medium">{toDisplayDate(row.date)}</td>
                          <td className="px-3 py-2">{formatSleepDuration(row.sleep)}</td>
                          <td className="px-3 py-2">{sleepQualityLabel(row)}</td>
                          <td className="px-3 py-2">{Math.round(row.sleepDetail?.remMinutes ?? 0)}m</td>
                          <td className="px-3 py-2">{Math.round(row.sleepDetail?.coreMinutes ?? 0)}m</td>
                          <td className="px-3 py-2">{Math.round(row.sleepDetail?.deepMinutes ?? 0)}m</td>
                          <td className="px-3 py-2">{Math.round(row.sleepDetail?.awakeMinutes ?? 0)}m</td>
                          <td className="px-3 py-2">
                            {(row.sleepHeartRate?.avg ?? null) !== null
                              ? `${Math.round(row.sleepHeartRate?.avg ?? 0)} / ${Math.round(row.sleepHeartRate?.min ?? 0)} / ${Math.round(row.sleepHeartRate?.max ?? 0)} bpm`
                              : "—"}
                          </td>
                          <td className="px-3 py-2">{row.sleepHeartRate?.lowAlerts ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <SourceDataTable entries={chartEntries} hideSourceFilter title="Imported Raw Data (Apple Health)" />
          </section>
        )}

        {!loading && !error && tab === "sport" && (
          <section className="space-y-5" data-testid="sport-panel">
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 text-sm">
              <span className="font-medium text-gray-700">Sport:</span>
              <select
                value={selectedSport}
                onChange={(e) => setSelectedSport(e.target.value)}
                className="rounded border border-gray-300 bg-white px-2 py-1 text-slate-900"
              >
                <option value="all">All</option>
                {availableSports.map((sport) => (
                  <option key={sport} value={sport}>{sportLabel(sport)}</option>
                ))}
              </select>

              <span className="ml-2 font-medium text-gray-700">View by:</span>
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

            {sportSections.map((section) => (
              <SportSection
                key={section.key}
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

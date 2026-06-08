import MetricChart, { type MetricPoint } from "@/components/dashboard/MetricChart";
import { useMemo, useState } from "react";
import type { SportSession } from "@/lib/mockData";
import { aggregateSeries, type AggregationMode, type Granularity } from "@/lib/timeAggregation";

interface Props {
  sport: string;
  sessions: SportSession[];
  isMock: boolean;
  granularity: Granularity;
  mode: AggregationMode;
}

type SessionSortKey = "date" | "duration" | "distance" | "pace" | "peakHr" | "calories";
type SplitSortKey = "km" | "distance" | "pace" | "avgHr" | "maxHr";
type SessionFilterColumn = "duration" | "distance" | "pace" | "peakHr" | "calories";
type SessionFilterOperator = "contains" | "gt" | "lt" | "eq";

function sortArrow(active: boolean, dir: "asc" | "desc"): string {
  if (!active) return "";
  return dir === "asc" ? " ▲" : " ▼";
}

function rollingAverage(values: number[], windowSize = 3): number[] {
  return values.map((_, idx) => {
    const start = Math.max(0, idx - windowSize + 1);
    const window = values.slice(start, idx + 1);
    const sum = window.reduce((acc, v) => acc + v, 0);
    return Math.round(sum / window.length);
  });
}

function avg(values: (number | undefined)[]): number | null {
  const nums = values.filter((v): v is number => v !== undefined && v !== null && Number.isFinite(v));
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function fmtPace(minPerKm: number): string {
  if (!Number.isFinite(minPerKm) || minPerKm <= 0) return "-";
  const mins = Math.floor(minPerKm);
  const secs = Math.round((minPerKm - mins) * 60);
  return `${mins}:${String(secs).padStart(2, "0")} /km`;
}

function fmtKm(km: number): string {
  return `${km.toFixed(2)} km`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit",
  });
}

function dayName(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "short" });
}

function describeSession(session: SportSession, isRunning: boolean): string {
  const parts: string[] = [];

  if (isRunning) {
    if (session.distanceKm && session.distanceKm > 0) {
      parts.push(`Distance ${session.distanceKm.toFixed(2)} km`);
    }
    if (session.paceMinPerKm && session.paceMinPerKm > 0) {
      parts.push(`Pace ${fmtPace(session.paceMinPerKm)}`);
    }
    if (session.avgHeartRate && session.avgHeartRate > 0) {
      parts.push(`Avg HR ${Math.round(session.avgHeartRate)} bpm`);
    }
  } else {
    if (session.durationMinutes && session.durationMinutes > 0) {
      parts.push(`${Math.round(session.durationMinutes)} min session`);
    }
    if (session.avgSpeedKmh && session.avgSpeedKmh > 0) {
      parts.push(`Avg speed ${session.avgSpeedKmh.toFixed(1)} km/h`);
    }
    if (session.peakHeartRate && session.peakHeartRate > 0) {
      parts.push(`Peak HR ${Math.round(session.peakHeartRate)} bpm`);
    }
  }

  if (session.calories > 0) {
    parts.push(`${Math.round(session.calories)} kcal`);
  }

  return parts.length > 0 ? parts.join(" • ") : "No detailed metrics";
}

function describeSnowboardSession(session: SportSession): string {
  const parts: string[] = [];
  if (session.durationMinutes && session.durationMinutes > 0) parts.push(`${Math.round(session.durationMinutes)} min`);
  if (session.distanceKm && session.distanceKm > 0) parts.push(`${session.distanceKm.toFixed(2)} km`);
  if (session.avgSpeedKmh && session.avgSpeedKmh > 0) parts.push(`avg ${session.avgSpeedKmh.toFixed(1)} km/h`);
  if (session.maxSpeedKmh && session.maxSpeedKmh > 0) parts.push(`max ${session.maxSpeedKmh.toFixed(1)} km/h`);
  return parts.length > 0 ? parts.join(" • ") : "No segment details available";
}

function sanitizeDistanceKm(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return undefined;
  if (value > 80) return undefined;
  return value;
}

function sanitizePace(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return undefined;
  if (value < 2 || value > 20) return undefined;
  return value;
}

function StatCell({ value, suffix = "" }: { value: number | undefined | null; suffix?: string }) {
  if (value == null || !Number.isFinite(value)) return <span className="text-slate-400">-</span>;
  return <span>{Math.round(value * 10) / 10}{suffix}</span>;
}

export default function SportSection({ sport, sessions, isMock, granularity, mode }: Props) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SessionSortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showRunDrilldown, setShowRunDrilldown] = useState(false);
  const [selectedRunKey, setSelectedRunKey] = useState<string>("");
  const [splitFilter, setSplitFilter] = useState("");
  const [splitSortKey, setSplitSortKey] = useState<SplitSortKey>("km");
  const [splitSortDir, setSplitSortDir] = useState<"asc" | "desc">("asc");
  const [sessionMenuColumn, setSessionMenuColumn] = useState<SessionFilterColumn | null>(null);
  const [sessionFilter, setSessionFilter] = useState<{ column: SessionFilterColumn; operator: SessionFilterOperator; value: string } | null>(null);
  const [sessionFilterDraft, setSessionFilterDraft] = useState<{ operator: SessionFilterOperator; value: string }>({ operator: "contains", value: "" });

  const isRunning = sport.toLowerCase() === "running";
  const isSnowboarding = sport.toLowerCase() === "snowboarding";

  const normalizedSessions = useMemo(() => {
    return sessions.map((session) => {
      const distanceKm = sanitizeDistanceKm(session.distanceKm);
      const paceFromDuration =
        distanceKm && distanceKm > 0 && session.durationMinutes && session.durationMinutes > 0
          ? session.durationMinutes / distanceKm
          : undefined;
      const paceMinPerKm = sanitizePace(session.paceMinPerKm ?? paceFromDuration);

      return {
        ...session,
        distanceKm,
        paceMinPerKm,
      };
    });
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return normalizedSessions.filter((s) => {
      const haystack = [
        s.date,
        dayName(s.date),
        s.startTime ?? "",
        String(s.durationMinutes ?? ""),
        String(s.distanceKm ?? ""),
        String(s.paceMinPerKm ?? ""),
        String(s.peakHeartRate ?? ""),
        String(s.calories ?? ""),
        describeSession(s, isRunning),
      ].join(" ").toLowerCase();

      if (q && !haystack.includes(q)) {
        return false;
      }

      if (sessionFilter && sessionFilter.value.trim() !== "") {
        const filterValue = sessionFilter.value.trim().toLowerCase();
        const numericValue = Number(filterValue);
        const sourceValue =
          sessionFilter.column === "duration" ? (s.durationMinutes ?? null)
          : sessionFilter.column === "distance" ? (s.distanceKm ?? null)
          : sessionFilter.column === "pace" ? (s.paceMinPerKm ?? null)
          : sessionFilter.column === "peakHr" ? (s.peakHeartRate ?? null)
          : (s.calories ?? null);

        if (sessionFilter.operator === "contains") {
          if (!String(sourceValue ?? "").toLowerCase().includes(filterValue)) return false;
        } else {
          if (!Number.isFinite(numericValue) || sourceValue === null) return false;
          if (sessionFilter.operator === "gt" && !(sourceValue > numericValue)) return false;
          if (sessionFilter.operator === "lt" && !(sourceValue < numericValue)) return false;
          if (sessionFilter.operator === "eq" && !(sourceValue === numericValue)) return false;
        }
      }

      return true;
    });
  }, [normalizedSessions, query, isRunning, sessionFilter]);

  const sorted = useMemo(() => {
    const list = [...filteredSessions];
    const sign = sortDir === "asc" ? 1 : -1;

    list.sort((a, b) => {
      if (sortKey === "date") return sign * a.date.localeCompare(b.date);
      if (sortKey === "duration") return sign * ((a.durationMinutes ?? -1) - (b.durationMinutes ?? -1));
      if (sortKey === "distance") return sign * ((a.distanceKm ?? -1) - (b.distanceKm ?? -1));
      if (sortKey === "pace") return sign * ((a.paceMinPerKm ?? Number.MAX_SAFE_INTEGER) - (b.paceMinPerKm ?? Number.MAX_SAFE_INTEGER));
      if (sortKey === "peakHr") return sign * ((a.peakHeartRate ?? -1) - (b.peakHeartRate ?? -1));
      return sign * ((a.calories ?? -1) - (b.calories ?? -1));
    });

    return list;
  }, [filteredSessions, sortKey, sortDir]);

  function setSort(next: SessionSortKey) {
    if (sortKey === next) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(next);
    setSortDir(next === "date" ? "desc" : "asc");
  }

  const totalCalories = filteredSessions.reduce((acc, s) => acc + (s.calories ?? 0), 0);
  const totalDuration = filteredSessions.reduce((acc, s) => acc + (s.durationMinutes ?? 0), 0);
  const totalDistanceKm = filteredSessions.reduce((acc, s) => acc + (s.distanceKm ?? 0), 0);

  const sessionsWithDist = filteredSessions.filter((s) => s.distanceKm && s.distanceKm > 0);
  const sessionsWithPace = filteredSessions.filter((s) => s.paceMinPerKm && s.paceMinPerKm > 0);

  const averagePace = avg(sessionsWithPace.map((s) => s.paceMinPerKm));
  const bestPace = sessionsWithPace.length > 0
    ? Math.min(...sessionsWithPace.map((s) => s.paceMinPerKm!))
    : null;
  const averagePeakHr = avg(filteredSessions.filter((s) => s.peakHeartRate > 0).map((s) => s.peakHeartRate));
  const averageAvgHr = avg(filteredSessions.map((s) => s.avgHeartRate));
  const averageDuration = filteredSessions.length > 0 ? totalDuration / filteredSessions.length : null;
  const averageDistance = sessionsWithDist.length > 0 ? totalDistanceKm / sessionsWithDist.length : null;
  const averageStrideM = avg(filteredSessions.map((s) => s.avgStrideLengthM));
  const averageGroundContactMs = avg(filteredSessions.map((s) => s.avgGroundContactMs));
  const averagePowerW = avg(filteredSessions.map((s) => s.avgRunningPowerW));
  const averageOscCm = avg(filteredSessions.map((s) => s.avgVerticalOscillationCm));
  const totalElevationM = filteredSessions.reduce((acc, s) => acc + (s.elevationAscendedM ?? 0), 0);
  const avgSpeed = avg(filteredSessions.map((s) => s.avgSpeedKmh));
  const fastestSpeed = (() => {
    const vals = filteredSessions.map((s) => s.maxSpeedKmh).filter((v): v is number => !!v && Number.isFinite(v));
    return vals.length > 0 ? Math.max(...vals) : null;
  })();

  const peakPoints: MetricPoint[] = filteredSessions.map((s) => ({ label: s.date, value: s.peakHeartRate }));
  const rolling = rollingAverage(filteredSessions.map((s) => s.peakHeartRate));
  const trendPoints: MetricPoint[] = filteredSessions.map((s, i) => ({ label: s.date, value: rolling[i] }));
  const distancePoints: MetricPoint[] = sessionsWithDist.map((s) => ({ label: s.date, value: Math.round((s.distanceKm ?? 0) * 100) / 100 }));
  const pacePoints: MetricPoint[] = sessionsWithPace.map((s) => ({ label: s.date, value: Math.round((s.paceMinPerKm ?? 0) * 100) / 100 }));

  const peakAgg = aggregateSeries(peakPoints, granularity, mode);
  const distanceAgg = aggregateSeries(distancePoints, granularity, mode);
  const paceAgg = aggregateSeries(pacePoints, granularity, mode);
  const trendAgg = aggregateSeries(trendPoints, granularity, mode);
  const speedPoints: MetricPoint[] = filteredSessions
    .filter((s) => s.avgSpeedKmh && s.avgSpeedKmh > 0)
    .map((s) => ({ label: s.date, value: Math.round((s.avgSpeedKmh ?? 0) * 100) / 100 }));
  const speedAgg = aggregateSeries(speedPoints, granularity, mode);

  const hasRunningMetrics = isRunning && filteredSessions.some(
    (s) => s.avgStrideLengthM || s.avgGroundContactMs || s.avgRunningPowerW
  );

  const selectedRun = useMemo(() => {
    if (!selectedRunKey) return sorted[0] ?? null;
    return sorted.find((s) => `${s.date}-${s.startTime ?? ""}` === selectedRunKey) ?? sorted[0] ?? null;
  }, [selectedRunKey, sorted]);

  const filteredSplits = useMemo(() => {
    const splits = selectedRun?.kmSplits ?? [];
    const q = splitFilter.trim().toLowerCase();

    const scoped = q
      ? splits.filter((split) => {
          const txt = `${split.kmIndex} ${split.distanceKm} ${split.paceMinPerKm ?? ""} ${split.avgHeartRate ?? ""} ${split.maxHeartRate ?? ""}`;
          return txt.toLowerCase().includes(q);
        })
      : splits;

    const sign = splitSortDir === "asc" ? 1 : -1;
    return [...scoped].sort((a, b) => {
      if (splitSortKey === "km") return sign * (a.kmIndex - b.kmIndex);
      if (splitSortKey === "distance") return sign * (a.distanceKm - b.distanceKm);
      if (splitSortKey === "pace") return sign * ((a.paceMinPerKm ?? Number.MAX_SAFE_INTEGER) - (b.paceMinPerKm ?? Number.MAX_SAFE_INTEGER));
      if (splitSortKey === "avgHr") return sign * ((a.avgHeartRate ?? -1) - (b.avgHeartRate ?? -1));
      return sign * ((a.maxHeartRate ?? -1) - (b.maxHeartRate ?? -1));
    });
  }, [selectedRun, splitFilter, splitSortKey, splitSortDir]);

  function setSplitSort(next: SplitSortKey) {
    if (splitSortKey === next) {
      setSplitSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSplitSortKey(next);
    setSplitSortDir("asc");
  }

  function openSessionMenu(column: SessionFilterColumn) {
    setSessionMenuColumn((prev) => (prev === column ? null : column));
    setSessionFilterDraft({ operator: "contains", value: "" });
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" data-testid={`sport-section-${sport.toLowerCase()}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-900">{sport}</h3>
          <p className="text-sm text-slate-600">{filteredSessions.length} session{filteredSessions.length !== 1 ? "s" : ""}</p>
        </div>
        {isMock && (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800" data-testid="sample-data-badge">
            Sample Data
          </span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {isRunning || isSnowboarding ? (
          <div className="rounded-lg bg-sky-50 p-3">
            <p className="text-xs uppercase tracking-wide text-sky-700">Total Distance</p>
            <p className="mt-1 text-xl font-bold text-sky-900">{totalDistanceKm > 0 ? fmtKm(totalDistanceKm) : "-"}</p>
          </div>
        ) : (
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-600">Total Calories</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{totalCalories > 0 ? Math.round(totalCalories).toLocaleString() : "-"}</p>
          </div>
        )}
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-600">Avg Duration</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{averageDuration != null ? `${Math.round(averageDuration)} min` : "-"}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-600">{isRunning ? "Avg Pace" : "Avg Peak HR"}</p>
          <p className="mt-1 text-xl font-bold text-slate-900">
            {isRunning ? (averagePace ? fmtPace(averagePace) : "-") : (averagePeakHr ? `${Math.round(averagePeakHr)} bpm` : "-")}
          </p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-600">{isRunning ? "Best Pace" : "Total Calories"}</p>
          <p className="mt-1 text-xl font-bold text-slate-900">
            {isRunning ? (bestPace ? fmtPace(bestPace) : "-") : (totalCalories > 0 ? Math.round(totalCalories).toLocaleString() : "-")}
          </p>
        </div>
      </div>

      {isSnowboarding && (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-cyan-50 p-3">
            <p className="text-xs uppercase tracking-wide text-cyan-700">Avg Speed</p>
            <p className="mt-1 text-lg font-semibold text-cyan-900">{avgSpeed ? `${avgSpeed.toFixed(1)} km/h` : "-"}</p>
          </div>
          <div className="rounded-lg bg-cyan-50 p-3">
            <p className="text-xs uppercase tracking-wide text-cyan-700">Fastest Speed</p>
            <p className="mt-1 text-lg font-semibold text-cyan-900">{fastestSpeed ? `${fastestSpeed.toFixed(1)} km/h` : "-"}</p>
          </div>
          <div className="rounded-lg bg-cyan-50 p-3">
            <p className="text-xs uppercase tracking-wide text-cyan-700">Avg Distance</p>
            <p className="mt-1 text-lg font-semibold text-cyan-900">{averageDistance ? fmtKm(averageDistance) : "-"}</p>
          </div>
        </div>
      )}

      {hasRunningMetrics && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-600">Avg HR</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{averageAvgHr ? `${Math.round(averageAvgHr)} bpm` : "-"}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-600">Avg Stride</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{averageStrideM ? `${(averageStrideM * 100).toFixed(0)} cm` : "-"}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-600">Ground Contact</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{averageGroundContactMs ? `${Math.round(averageGroundContactMs)} ms` : "-"}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-600">Running Power</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{averagePowerW ? `${Math.round(averagePowerW)} W` : "-"}</p>
          </div>
          {averageOscCm && (
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-600">Vertical Oscillation</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{averageOscCm.toFixed(1)} cm</p>
            </div>
          )}
          {totalElevationM > 0 && (
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-600">Total Elevation</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{Math.round(totalElevationM)} m</p>
            </div>
          )}
          {averageDistance && (
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-600">Avg Distance</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{fmtKm(averageDistance)}</p>
            </div>
          )}
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-600">Runs with distance</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{sessionsWithDist.length} / {filteredSessions.length}</p>
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {(isRunning || isSnowboarding) && distancePoints.length > 0 ? (
          <MetricChart title={isSnowboarding ? "Distance per Session" : "Distance per Run"} tooltipKey="runningPeak" data={distanceAgg} unit="km" variant="bar" />
        ) : (
          <MetricChart title={`${sport} Peak HR`} tooltipKey="padelPeak" data={peakAgg} unit="bpm" variant="bar" />
        )}
        {isRunning && pacePoints.length > 0 ? (
          <MetricChart title="Pace per Run (min/km)" tooltipKey="runningPeak" data={paceAgg} unit="min/km" variant="line" />
        ) : isSnowboarding && speedAgg.length > 0 ? (
          <MetricChart title="Speed per Session" tooltipKey="runningPeak" data={speedAgg} unit="km/h" variant="line" />
        ) : (
          <MetricChart title={`${sport} Peak Trend`} tooltipKey="padelPeak" data={trendAgg} unit="bpm" variant="line" />
        )}
      </div>

      {isRunning && selectedRun && (
        <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-slate-900">Run Drilldown by KM</h4>
            <button
              type="button"
              onClick={() => setShowRunDrilldown((prev) => !prev)}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800"
            >
              {showRunDrilldown ? "Hide details" : "Drill down"}
            </button>
          </div>

          {showRunDrilldown && (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                <label className="text-slate-700">
                  Run:
                  <select
                    value={selectedRunKey}
                    onChange={(e) => setSelectedRunKey(e.target.value)}
                    className="ml-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                  >
                    {sorted.map((s) => {
                      const key = `${s.date}-${s.startTime ?? ""}`;
                      return (
                        <option key={key} value={key}>{fmtDate(s.date)} {s.startTime ? fmtTime(s.startTime) : ""}</option>
                      );
                    })}
                  </select>
                </label>
                <input
                  value={splitFilter}
                  onChange={(e) => setSplitFilter(e.target.value)}
                  placeholder="Filter KM rows"
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                />
              </div>

              {filteredSplits.length > 0 ? (
                <div className="overflow-x-auto rounded border border-slate-200 bg-white">
                  <table className="min-w-full text-xs text-slate-900">
                    <thead className="bg-slate-100 text-slate-800">
                      <tr>
                        <th className="px-3 py-2 text-left"><button type="button" className="font-semibold" onClick={() => setSplitSort("km")}>KM</button></th>
                        <th className="px-3 py-2 text-left"><button type="button" className="font-semibold" onClick={() => setSplitSort("distance")}>Distance</button></th>
                        <th className="px-3 py-2 text-left"><button type="button" className="font-semibold" onClick={() => setSplitSort("pace")}>Pace</button></th>
                        <th className="px-3 py-2 text-left"><button type="button" className="font-semibold" onClick={() => setSplitSort("avgHr")}>Avg HR</button></th>
                        <th className="px-3 py-2 text-left"><button type="button" className="font-semibold" onClick={() => setSplitSort("maxHr")}>Max HR</button></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSplits.map((split) => (
                        <tr key={split.kmIndex} className="border-t border-slate-100">
                          <td className="px-3 py-2">{split.kmIndex}</td>
                          <td className="px-3 py-2">{split.distanceKm.toFixed(2)} km</td>
                          <td className="px-3 py-2">{split.paceMinPerKm ? fmtPace(split.paceMinPerKm) : "-"}</td>
                          <td className="px-3 py-2">{split.avgHeartRate ? Math.round(split.avgHeartRate) : "-"}</td>
                          <td className="px-3 py-2">{split.maxHeartRate ? Math.round(split.maxHeartRate) : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-slate-700">No per-km splits are available for this run.</p>
              )}
            </>
          )}
        </div>
      )}

      {filteredSessions.length > 0 && (
        <div className="mt-6">
          <h4 className="mb-2 text-sm font-semibold text-slate-900">Workout Imported Data</h4>
          {sessionMenuColumn && (
            <div className="mb-3 rounded border border-slate-200 bg-white p-2 text-xs text-slate-700">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-semibold text-slate-900">Filter column: {sessionMenuColumn}</span>
                <button type="button" className="rounded border border-slate-300 px-2 py-0.5" onClick={() => setSessionMenuColumn(null)}>Close</button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={sessionFilterDraft.operator}
                  onChange={(e) => setSessionFilterDraft((prev) => ({ ...prev, operator: e.target.value as SessionFilterOperator }))}
                  className="rounded border border-slate-300 px-2 py-1"
                >
                  <option value="contains">contains</option>
                  <option value="gt">greater than</option>
                  <option value="lt">less than</option>
                  <option value="eq">equal to</option>
                </select>
                <input
                  value={sessionFilterDraft.value}
                  onChange={(e) => setSessionFilterDraft((prev) => ({ ...prev, value: e.target.value }))}
                  placeholder="value"
                  className="rounded border border-slate-300 px-2 py-1"
                />
                <button
                  type="button"
                  className="rounded bg-slate-900 px-2 py-1 text-white"
                  onClick={() => setSessionFilter({ column: sessionMenuColumn, operator: sessionFilterDraft.operator, value: sessionFilterDraft.value })}
                >
                  Apply
                </button>
                <button
                  type="button"
                  className="rounded border border-slate-300 px-2 py-1"
                  onClick={() => setSessionFilter(null)}
                >
                  Clear
                </button>
              </div>
            </div>
          )}
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm text-slate-900" data-testid="sport-session-log">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-700">
                <tr>
                  <th className="px-3 py-2 text-left"><button type="button" className="font-semibold" onClick={() => setSort("date")}>Date{sortArrow(sortKey === "date", sortDir)}</button></th>
                  <th className="px-3 py-2 text-left font-semibold">Day</th>
                  <th className="px-3 py-2 text-left font-semibold">Time</th>
                  <th className="px-3 py-2 text-left"><button type="button" className="font-semibold" onClick={() => setSort("duration")}>Duration{sortArrow(sortKey === "duration", sortDir)}</button><button type="button" className="ml-1 rounded border border-slate-300 px-1" onClick={() => openSessionMenu("duration")}>▾</button></th>
                  {isRunning && <th className="px-3 py-2 text-left"><button type="button" className="font-semibold" onClick={() => setSort("distance")}>Distance{sortArrow(sortKey === "distance", sortDir)}</button><button type="button" className="ml-1 rounded border border-slate-300 px-1" onClick={() => openSessionMenu("distance")}>▾</button></th>}
                  {isRunning && <th className="px-3 py-2 text-left"><button type="button" className="font-semibold" onClick={() => setSort("pace")}>Pace{sortArrow(sortKey === "pace", sortDir)}</button><button type="button" className="ml-1 rounded border border-slate-300 px-1" onClick={() => openSessionMenu("pace")}>▾</button></th>}
                  <th className="px-3 py-2 text-left"><button type="button" className="font-semibold" onClick={() => setSort("peakHr")}>Avg HR{sortArrow(sortKey === "peakHr", sortDir)}</button><button type="button" className="ml-1 rounded border border-slate-300 px-1" onClick={() => openSessionMenu("peakHr")}>▾</button></th>
                  <th className="px-3 py-2 text-left font-semibold">Max HR</th>
                  <th className="px-3 py-2 text-left"><button type="button" className="font-semibold" onClick={() => setSort("calories")}>Calories{sortArrow(sortKey === "calories", sortDir)}</button><button type="button" className="ml-1 rounded border border-slate-300 px-1" onClick={() => openSessionMenu("calories")}>▾</button></th>
                  <th className="px-3 py-2 text-left font-semibold">Session Summary</th>
                  {isRunning && <th className="px-3 py-2 text-left font-semibold">Run</th>}
                  {hasRunningMetrics && <th className="px-3 py-2 text-left">Stride</th>}
                  {hasRunningMetrics && <th className="px-3 py-2 text-left">Ground Contact</th>}
                  {hasRunningMetrics && <th className="px-3 py-2 text-left">Power</th>}
                  {hasRunningMetrics && <th className="px-3 py-2 text-left">Elevation</th>}
                </tr>
                <tr>
                  <th colSpan={hasRunningMetrics ? (isRunning ? 15 : 11) : (isRunning ? 11 : 8)} className="px-3 py-2 text-left normal-case">
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Filter and search sessions from table header"
                      className="w-full rounded border border-slate-300 px-2 py-1 text-xs text-slate-900"
                    />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {sorted.map((s) => (
                  <tr key={`${s.date}-${s.startTime ?? ""}`} className="hover:bg-slate-50">
                    <td className="px-3 py-2 whitespace-nowrap font-medium">{fmtDate(s.date)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{dayName(s.date)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{s.startTime ? fmtTime(s.startTime) : "-"}</td>
                    <td className="px-3 py-2">{s.durationMinutes != null ? `${Math.round(s.durationMinutes)} min` : "-"}</td>
                    {isRunning && (
                      <td className="px-3 py-2">{s.distanceKm != null && s.distanceKm > 0 ? fmtKm(s.distanceKm) : "-"}</td>
                    )}
                    {isRunning && (
                      <td className="px-3 py-2">{s.paceMinPerKm ? fmtPace(s.paceMinPerKm) : "-"}</td>
                    )}
                    <td className="px-3 py-2">
                      {s.avgHeartRate ? `${Math.round(s.avgHeartRate)}` : "-"}
                      <span className="text-xs text-slate-500"> bpm</span>
                    </td>
                    <td className="px-3 py-2">{s.peakHeartRate > 0 ? s.peakHeartRate : "-"}</td>
                    <td className="px-3 py-2">{s.calories > 0 ? Math.round(s.calories) : "-"}</td>
                    <td className="px-3 py-2 text-xs text-slate-700">{isSnowboarding ? describeSnowboardSession(s) : describeSession(s, isRunning)}</td>
                    {isRunning && (
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedRunKey(`${s.date}-${s.startTime ?? ""}`);
                            setShowRunDrilldown(true);
                          }}
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                        >
                          Drill down
                        </button>
                      </td>
                    )}
                    {hasRunningMetrics && (
                      <td className="px-3 py-2"><StatCell value={s.avgStrideLengthM ? s.avgStrideLengthM * 100 : undefined} suffix=" cm" /></td>
                    )}
                    {hasRunningMetrics && (
                      <td className="px-3 py-2"><StatCell value={s.avgGroundContactMs} suffix=" ms" /></td>
                    )}
                    {hasRunningMetrics && (
                      <td className="px-3 py-2"><StatCell value={s.avgRunningPowerW} suffix=" W" /></td>
                    )}
                    {hasRunningMetrics && (
                      <td className="px-3 py-2"><StatCell value={s.elevationAscendedM} suffix=" m" /></td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

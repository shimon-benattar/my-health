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
  if (!Number.isFinite(minPerKm) || minPerKm <= 0) return "—";
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

function StatCell({ value, suffix = "" }: { value: number | undefined | null; suffix?: string }) {
  if (value == null || !Number.isFinite(value)) return <span className="text-gray-400">—</span>;
  return <span>{Math.round(value * 10) / 10}{suffix}</span>;
}

export default function SportSection({ sport, sessions, isMock, granularity, mode }: Props) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<"date" | "duration" | "distance" | "pace" | "peakHr" | "calories">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedRunKey, setSelectedRunKey] = useState<string>("");

  const isRunning = sport.toLowerCase() === "running";

  const filteredSessions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sessions;

    return sessions.filter((s) => {
      const haystack = [
        s.date,
        s.startTime ?? "",
        String(s.durationMinutes ?? ""),
        String(s.distanceKm ?? ""),
        String(s.paceMinPerKm ?? ""),
        String(s.peakHeartRate ?? ""),
        String(s.calories ?? ""),
      ].join(" ").toLowerCase();

      return haystack.includes(q);
    });
  }, [sessions, query]);

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

  function setSort(next: "date" | "duration" | "distance" | "pace" | "peakHr" | "calories") {
    if (sortKey === next) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(next);
    setSortDir(next === "date" ? "desc" : "asc");
  }

  // ---- aggregates ----
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

  // ---- charts ----
  const peakPoints: MetricPoint[] = filteredSessions.map((s) => ({ label: s.date, value: s.peakHeartRate }));
  const rolling = rollingAverage(filteredSessions.map((s) => s.peakHeartRate));
  const trendPoints: MetricPoint[] = filteredSessions.map((s, i) => ({ label: s.date, value: rolling[i] }));
  const distancePoints: MetricPoint[] = sessionsWithDist.map((s) => ({ label: s.date, value: Math.round((s.distanceKm ?? 0) * 100) / 100 }));
  const pacePoints: MetricPoint[] = sessionsWithPace.map((s) => ({ label: s.date, value: Math.round((s.paceMinPerKm ?? 0) * 100) / 100 }));

  const peakAgg = aggregateSeries(peakPoints, granularity, mode);
  const distanceAgg = aggregateSeries(distancePoints, granularity, "total");
  const paceAgg = aggregateSeries(pacePoints, granularity, mode);
  const trendAgg = aggregateSeries(trendPoints, granularity, mode);

  const hasRunningMetrics = isRunning && filteredSessions.some(
    (s) => s.avgStrideLengthM || s.avgGroundContactMs || s.avgRunningPowerW
  );

  const sportGifByName: Record<string, string> = {
    running: "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif",
    walking: "https://media.giphy.com/media/3o7aD2saalBwwftBIY/giphy.gif",
    snowboarding: "https://media.giphy.com/media/xT9IgzoKnwFNmISR8I/giphy.gif",
    cycling: "https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif",
    "padel (racketball source)": "https://media.giphy.com/media/3o7abB06u9bNzA8lu8/giphy.gif",
    padel: "https://media.giphy.com/media/3o7abB06u9bNzA8lu8/giphy.gif",
    racketball: "https://media.giphy.com/media/3o7abB06u9bNzA8lu8/giphy.gif",
    weightlifting: "https://media.giphy.com/media/l0MYu5a8z7x6q7QyQ/giphy.gif",
  };

  const sportKey = sport.toLowerCase();
  const sportGif = sportGifByName[sportKey] ?? "https://media.giphy.com/media/26BRuo6sLetdllPAQ/giphy.gif";

  const selectedRun = useMemo(() => {
    if (!selectedRunKey) return sorted[0] ?? null;
    return sorted.find((s) => `${s.date}-${s.startTime ?? ""}` === selectedRunKey) ?? sorted[0] ?? null;
  }, [selectedRunKey, sorted]);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm" data-testid={`sport-section-${sport.toLowerCase()}`}>
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-gray-900">{sport}</h3>
          <p className="text-sm text-gray-500">{filteredSessions.length} session{filteredSessions.length !== 1 ? "s" : ""}</p>
        </div>
        <img src={sportGif} alt={`${sport} action`} className="h-14 w-20 rounded-md object-cover shadow" loading="lazy" />
        {isMock && (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800" data-testid="sample-data-badge">
            Sample Data
          </span>
        )}
      </div>

      {/* Top-line overview */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {isRunning && totalDistanceKm > 0 ? (
          <div className="rounded-lg bg-blue-50 p-3">
            <p className="text-xs uppercase tracking-wide text-blue-600">Total Distance</p>
            <p className="mt-1 text-xl font-bold text-blue-900">{fmtKm(totalDistanceKm)}</p>
          </div>
        ) : (
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">Total Calories</p>
            <p className="mt-1 text-xl font-bold text-gray-900">{totalCalories > 0 ? Math.round(totalCalories).toLocaleString() : "—"}</p>
          </div>
        )}
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="text-xs uppercase tracking-wide text-gray-500">Avg Duration</p>
          <p className="mt-1 text-xl font-bold text-gray-900">{averageDuration != null ? `${Math.round(averageDuration)} min` : "—"}</p>
        </div>
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="text-xs uppercase tracking-wide text-gray-500">{isRunning ? "Avg Pace" : "Avg Peak HR"}</p>
          <p className="mt-1 text-xl font-bold text-gray-900">
            {isRunning ? (averagePace ? fmtPace(averagePace) : "—") : (averagePeakHr ? `${Math.round(averagePeakHr)} bpm` : "—")}
          </p>
        </div>
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="text-xs uppercase tracking-wide text-gray-500">{isRunning ? "Best Pace" : "Total Calories"}</p>
          <p className="mt-1 text-xl font-bold text-gray-900">
            {isRunning ? (bestPace ? fmtPace(bestPace) : "—") : (totalCalories > 0 ? Math.round(totalCalories).toLocaleString() : "—")}
          </p>
        </div>
      </div>

      {/* Running biomechanics averages */}
      {hasRunningMetrics && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">Avg HR</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{averageAvgHr ? `${Math.round(averageAvgHr)} bpm` : "—"}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">Avg Stride</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{averageStrideM ? `${(averageStrideM * 100).toFixed(0)} cm` : "—"}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">Ground Contact</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{averageGroundContactMs ? `${Math.round(averageGroundContactMs)} ms` : "—"}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">Running Power</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{averagePowerW ? `${Math.round(averagePowerW)} W` : "—"}</p>
          </div>
          {averageOscCm && (
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Vertical Oscillation</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">{averageOscCm.toFixed(1)} cm</p>
            </div>
          )}
          {totalElevationM > 0 && (
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Total Elevation ↑</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">{Math.round(totalElevationM)} m</p>
            </div>
          )}
          {averageDistance && (
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Avg Distance</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">{fmtKm(averageDistance)}</p>
            </div>
          )}
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">Runs w/ GPS</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{sessionsWithDist.length} / {filteredSessions.length}</p>
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {isRunning && distancePoints.length > 0 ? (
          <MetricChart title="Distance per Run" tooltipKey="runningPeak" data={distanceAgg} unit="km" variant="bar" />
        ) : (
          <MetricChart title={`${sport} Peak HR`} tooltipKey="padelPeak" data={peakAgg} unit="bpm" variant="bar" />
        )}
        {isRunning && pacePoints.length > 0 ? (
          <MetricChart title="Pace per Run (min/km)" tooltipKey="runningPeak" data={paceAgg} unit="min/km" variant="line" />
        ) : (
          <MetricChart title={`${sport} Peak Trend`} tooltipKey="padelPeak" data={trendAgg} unit="bpm" variant="line" />
        )}
      </div>

      {/* Per-session detail table */}
      {filteredSessions.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-gray-800">Session Log</h4>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter sessions..."
              className="rounded border border-gray-300 px-2 py-1 text-xs"
            />
          </div>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-sm" data-testid="sport-session-log">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-left"><button type="button" className="font-semibold" onClick={() => setSort("date")}>Date</button></th>
                  <th className="px-3 py-2 text-left">Time</th>
                  <th className="px-3 py-2 text-left"><button type="button" className="font-semibold" onClick={() => setSort("duration")}>Duration</button></th>
                  {isRunning && <th className="px-3 py-2 text-left"><button type="button" className="font-semibold" onClick={() => setSort("distance")}>Distance</button></th>}
                  {isRunning && <th className="px-3 py-2 text-left"><button type="button" className="font-semibold" onClick={() => setSort("pace")}>Pace</button></th>}
                  <th className="px-3 py-2 text-left"><button type="button" className="font-semibold" onClick={() => setSort("peakHr")}>HR avg/peak</button></th>
                  <th className="px-3 py-2 text-left"><button type="button" className="font-semibold" onClick={() => setSort("calories")}>Calories</button></th>
                  {hasRunningMetrics && <th className="px-3 py-2 text-left">Stride</th>}
                  {hasRunningMetrics && <th className="px-3 py-2 text-left">Gnd Contact</th>}
                  {hasRunningMetrics && <th className="px-3 py-2 text-left">Power</th>}
                  {hasRunningMetrics && <th className="px-3 py-2 text-left">Elev ↑</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {sorted.map((s) => (
                  <tr key={`${s.date}-${s.startTime ?? ""}`} className="hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap font-medium">{fmtDate(s.date)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-900">{s.startTime ? fmtTime(s.startTime) : "—"}</td>
                    <td className="px-3 py-2">{s.durationMinutes != null ? `${Math.round(s.durationMinutes)} min` : "—"}</td>
                    {isRunning && (
                      <td className="px-3 py-2">{s.distanceKm != null && s.distanceKm > 0 ? fmtKm(s.distanceKm) : "—"}</td>
                    )}
                    {isRunning && (
                      <td className="px-3 py-2">{s.paceMinPerKm ? fmtPace(s.paceMinPerKm) : "—"}</td>
                    )}
                    <td className="px-3 py-2">
                      {s.avgHeartRate ? `${Math.round(s.avgHeartRate)}` : "—"}
                      {s.peakHeartRate > 0 ? ` / ${s.peakHeartRate}` : ""}{" "}
                      <span className="text-xs text-gray-500">bpm</span>
                    </td>
                    <td className="px-3 py-2">{s.calories > 0 ? Math.round(s.calories) : "—"}</td>
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

      {isRunning && selectedRun && (
        <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-blue-900">Run Drilldown by KM</h4>
            <select
              value={selectedRunKey}
              onChange={(e) => setSelectedRunKey(e.target.value)}
              className="rounded border border-blue-300 bg-white px-2 py-1 text-xs"
            >
              {sorted.map((s) => {
                const key = `${s.date}-${s.startTime ?? ""}`;
                return (
                  <option key={key} value={key}>{fmtDate(s.date)} {s.startTime ? fmtTime(s.startTime) : ""}</option>
                );
              })}
            </select>
          </div>

          {(selectedRun.kmSplits ?? []).length > 0 ? (
            <div className="overflow-x-auto rounded border border-blue-100 bg-white">
              <table className="min-w-full text-xs">
                <thead className="bg-blue-50 text-blue-900">
                  <tr>
                    <th className="px-3 py-2 text-left">KM</th>
                    <th className="px-3 py-2 text-left">Distance</th>
                    <th className="px-3 py-2 text-left">Pace</th>
                    <th className="px-3 py-2 text-left">Avg HR</th>
                    <th className="px-3 py-2 text-left">Max HR</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedRun.kmSplits?.map((split) => (
                    <tr key={split.kmIndex} className="border-t border-blue-50">
                      <td className="px-3 py-2">{split.kmIndex}</td>
                      <td className="px-3 py-2">{split.distanceKm.toFixed(2)} km</td>
                      <td className="px-3 py-2">{split.paceMinPerKm ? fmtPace(split.paceMinPerKm) : "—"}</td>
                      <td className="px-3 py-2">{split.avgHeartRate ? Math.round(split.avgHeartRate) : "—"}</td>
                      <td className="px-3 py-2">{split.maxHeartRate ? Math.round(split.maxHeartRate) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-blue-900">No per-km splits are available for this run.</p>
          )}
        </div>
      )}
    </section>
  );
}

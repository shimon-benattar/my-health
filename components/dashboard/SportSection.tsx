import MetricChart, { type MetricPoint } from "@/components/dashboard/MetricChart";
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
  const isRunning = sport.toLowerCase() === "running";
  const sorted = [...sessions].sort((a, b) => b.date.localeCompare(a.date));

  // ---- aggregates ----
  const totalCalories = sessions.reduce((acc, s) => acc + (s.calories ?? 0), 0);
  const totalDuration = sessions.reduce((acc, s) => acc + (s.durationMinutes ?? 0), 0);
  const totalDistanceKm = sessions.reduce((acc, s) => acc + (s.distanceKm ?? 0), 0);

  const sessionsWithDist = sessions.filter((s) => s.distanceKm && s.distanceKm > 0);
  const sessionsWithPace = sessions.filter((s) => s.paceMinPerKm && s.paceMinPerKm > 0);

  const averagePace = avg(sessionsWithPace.map((s) => s.paceMinPerKm));
  const bestPace = sessionsWithPace.length > 0
    ? Math.min(...sessionsWithPace.map((s) => s.paceMinPerKm!))
    : null;
  const averagePeakHr = avg(sessions.filter((s) => s.peakHeartRate > 0).map((s) => s.peakHeartRate));
  const averageAvgHr = avg(sessions.map((s) => s.avgHeartRate));
  const averageDuration = sessions.length > 0 ? totalDuration / sessions.length : null;
  const averageDistance = sessionsWithDist.length > 0 ? totalDistanceKm / sessionsWithDist.length : null;
  const averageStrideM = avg(sessions.map((s) => s.avgStrideLengthM));
  const averageGroundContactMs = avg(sessions.map((s) => s.avgGroundContactMs));
  const averagePowerW = avg(sessions.map((s) => s.avgRunningPowerW));
  const averageOscCm = avg(sessions.map((s) => s.avgVerticalOscillationCm));
  const totalElevationM = sessions.reduce((acc, s) => acc + (s.elevationAscendedM ?? 0), 0);

  // ---- charts ----
  const peakPoints: MetricPoint[] = sessions.map((s) => ({ label: s.date, value: s.peakHeartRate }));
  const rolling = rollingAverage(sessions.map((s) => s.peakHeartRate));
  const trendPoints: MetricPoint[] = sessions.map((s, i) => ({ label: s.date, value: rolling[i] }));
  const distancePoints: MetricPoint[] = sessionsWithDist.map((s) => ({ label: s.date, value: Math.round((s.distanceKm ?? 0) * 100) / 100 }));
  const pacePoints: MetricPoint[] = sessionsWithPace.map((s) => ({ label: s.date, value: Math.round((s.paceMinPerKm ?? 0) * 100) / 100 }));

  const peakAgg = aggregateSeries(peakPoints, granularity, mode);
  const distanceAgg = aggregateSeries(distancePoints, granularity, mode);
  const paceAgg = aggregateSeries(pacePoints, granularity, mode);
  const trendAgg = aggregateSeries(trendPoints, granularity, mode);

  const hasRunningMetrics = isRunning && sessions.some(
    (s) => s.avgStrideLengthM || s.avgGroundContactMs || s.avgRunningPowerW
  );

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm" data-testid={`sport-section-${sport.toLowerCase()}`}>
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-gray-900">{sport}</h3>
          <p className="text-sm text-gray-500">{sessions.length} session{sessions.length !== 1 ? "s" : ""}</p>
        </div>
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
            <p className="mt-1 text-lg font-semibold text-gray-900">{sessionsWithDist.length} / {sessions.length}</p>
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
      {sessions.length > 0 && (
        <div className="mt-6">
          <h4 className="mb-2 text-sm font-semibold text-gray-800">Session Log</h4>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-sm" data-testid="sport-session-log">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Time</th>
                  <th className="px-3 py-2 text-left">Duration</th>
                  {isRunning && <th className="px-3 py-2 text-left">Distance</th>}
                  {isRunning && <th className="px-3 py-2 text-left">Pace</th>}
                  <th className="px-3 py-2 text-left">HR avg/peak</th>
                  <th className="px-3 py-2 text-left">Calories</th>
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
                    <td className="px-3 py-2 whitespace-nowrap text-gray-500">{s.startTime ? fmtTime(s.startTime) : "—"}</td>
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
                      <span className="text-xs text-gray-400">bpm</span>
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
    </section>
  );
}

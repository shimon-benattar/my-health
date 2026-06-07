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

function fmtPace(minPerKm: number): string {
  const mins = Math.floor(minPerKm);
  const secs = Math.round((minPerKm - mins) * 60);
  return `${mins}:${String(secs).padStart(2, "0")} /km`;
}

function fmtDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters)} m`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function SportSection({ sport, sessions, isMock, granularity, mode }: Props) {
  const isRunning = sport.toLowerCase() === "running";

  const totalCalories = sessions.reduce((acc, s) => acc + s.calories, 0);
  const totalDuration = sessions.reduce((acc, s) => acc + (s.durationMinutes ?? 0), 0);
  const totalDistanceMeters = sessions.reduce((acc, s) => acc + (s.distanceMeters ?? 0), 0);

  const loadLabel = isRunning ? "Aerobic Endurance" : "Mixed Sport Load";
  const averagePeak = sessions.length > 0
    ? Math.round(sessions.reduce((acc, s) => acc + s.peakHeartRate, 0) / sessions.length)
    : null;
  const averageDuration = sessions.length > 0 ? Math.round(totalDuration / sessions.length) : null;

  const sessionsWithDistance = sessions.filter((s) => s.distanceMeters && s.distanceMeters > 0);
  const avgPace = sessionsWithDistance.length > 0
    ? sessionsWithDistance.reduce((acc, s) => acc + (s.paceMinPerKm ?? 0), 0) / sessionsWithDistance.length
    : null;
  const bestPace = sessionsWithDistance.length > 0
    ? Math.min(...sessionsWithDistance.map((s) => s.paceMinPerKm ?? Infinity))
    : null;

  const peakPoints: MetricPoint[] = sessions.map((s) => ({ label: s.date, value: s.peakHeartRate }));
  const rolling = rollingAverage(sessions.map((s) => s.peakHeartRate));
  const trendPoints: MetricPoint[] = sessions.map((s, i) => ({ label: s.date, value: rolling[i] }));
  const peakAgg = aggregateSeries(peakPoints, granularity, mode);
  const trendAgg = aggregateSeries(trendPoints, granularity, mode);

  // Distance chart for running
  const distancePoints: MetricPoint[] = sessionsWithDistance.map((s) => ({
    label: s.date,
    value: Math.round((s.distanceMeters ?? 0) / 100) / 10, // km with 1 dp
  }));
  const distanceAgg = aggregateSeries(distancePoints, granularity, mode);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm" data-testid={`sport-section-${sport.toLowerCase()}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-gray-900">{sport}</h3>
          <p className="text-sm text-gray-600">Load type: {loadLabel} · {sessions.length} session{sessions.length !== 1 ? "s" : ""}</p>
        </div>
        {isMock && (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800" data-testid="sample-data-badge">
            Sample Data
          </span>
        )}
      </div>

      {/* Overview stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="text-xs uppercase tracking-wide text-gray-500">Total Calories</p>
          <p className="mt-1 text-xl font-semibold text-gray-900">{totalCalories > 0 ? totalCalories.toLocaleString("en-US") : "—"}</p>
        </div>
        {isRunning && totalDistanceMeters > 0 ? (
          <div className="rounded-lg bg-blue-50 p-3">
            <p className="text-xs uppercase tracking-wide text-blue-700">Total Distance</p>
            <p className="mt-1 text-xl font-semibold text-blue-900">{fmtDistance(totalDistanceMeters)}</p>
          </div>
        ) : (
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">Sessions</p>
            <p className="mt-1 text-xl font-semibold text-gray-900">{sessions.length}</p>
          </div>
        )}
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="text-xs uppercase tracking-wide text-gray-500">Avg Duration</p>
          <p className="mt-1 text-xl font-semibold text-gray-900">{averageDuration != null ? `${averageDuration} min` : "—"}</p>
        </div>
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="text-xs uppercase tracking-wide text-gray-500">{isRunning ? "Avg Pace" : "Avg Peak HR"}</p>
          <p className="mt-1 text-xl font-semibold text-gray-900">
            {isRunning ? (avgPace != null ? fmtPace(avgPace) : "—") : (averagePeak != null ? `${averagePeak} bpm` : "—")}
          </p>
        </div>
      </div>

      {/* Running extra stats row */}
      {isRunning && (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">Best Pace</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{bestPace != null && bestPace < Infinity ? fmtPace(bestPace) : "—"}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">Avg Peak HR</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{averagePeak != null ? `${averagePeak} bpm` : "—"}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">Runs with GPS</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{sessionsWithDistance.length} / {sessions.length}</p>
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {isRunning && distancePoints.length > 0 ? (
          <MetricChart
            title="Distance per Run"
            tooltipKey="runningPeak"
            data={distanceAgg}
            unit="km"
            variant="bar"
          />
        ) : (
          <MetricChart
            title={`${sport} Peak Intensity`}
            tooltipKey={sport.toLowerCase() === "running" ? "runningPeak" : "padelPeak"}
            data={peakAgg}
            unit="bpm"
            variant="bar"
          />
        )}
        <MetricChart
          title={isRunning ? "Peak HR per Run" : `${sport} Peak Trend`}
          tooltipKey={sport.toLowerCase() === "running" ? "runningPeak" : "padelPeak"}
          data={isRunning ? peakAgg : trendAgg}
          unit="bpm"
          variant="line"
        />
      </div>

      {/* Per-run detail table */}
      {sessions.length > 0 && (
        <div className="mt-5">
          <h4 className="mb-2 text-sm font-semibold text-gray-800">Session Log</h4>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Date</th>
                  <th className="px-3 py-2 text-left font-semibold">Duration</th>
                  {isRunning && <th className="px-3 py-2 text-left font-semibold">Distance</th>}
                  {isRunning && <th className="px-3 py-2 text-left font-semibold">Pace</th>}
                  <th className="px-3 py-2 text-left font-semibold">Peak HR</th>
                  <th className="px-3 py-2 text-left font-semibold">Calories</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {[...sessions].sort((a, b) => b.date.localeCompare(a.date)).map((session) => (
                  <tr key={session.date} className="hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDate(session.date)}</td>
                    <td className="px-3 py-2">{session.durationMinutes != null ? `${Math.round(session.durationMinutes)} min` : "—"}</td>
                    {isRunning && (
                      <td className="px-3 py-2">
                        {session.distanceMeters && session.distanceMeters > 0 ? fmtDistance(session.distanceMeters) : "—"}
                      </td>
                    )}
                    {isRunning && (
                      <td className="px-3 py-2">
                        {session.paceMinPerKm ? fmtPace(session.paceMinPerKm) : "—"}
                      </td>
                    )}
                    <td className="px-3 py-2">{session.peakHeartRate > 0 ? `${session.peakHeartRate} bpm` : "—"}</td>
                    <td className="px-3 py-2">{session.calories > 0 ? Math.round(session.calories) : "—"}</td>
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

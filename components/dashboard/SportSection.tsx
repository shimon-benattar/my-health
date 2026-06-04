import MetricChart, { type MetricPoint } from "@/components/dashboard/MetricChart";
import type { SportSession } from "@/lib/mockData";
import { aggregateSeries, type AggregationMode, type Granularity } from "@/lib/timeAggregation";

interface Props {
  sport: "Running" | "Padel";
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

export default function SportSection({ sport, sessions, isMock, granularity, mode }: Props) {
  const totalCalories = sessions.reduce((acc, s) => acc + s.calories, 0);
  const totalSteps = sessions.reduce((acc, s) => acc + s.steps, 0);
  const loadLabel = sport === "Running" ? "Aerobic Endurance" : "Explosive Interval";
  const averagePeak = sessions.length > 0
    ? Math.round(sessions.reduce((acc, s) => acc + s.peakHeartRate, 0) / sessions.length)
    : null;

  const peakPoints: MetricPoint[] = sessions.map((s) => ({ label: s.date, value: s.peakHeartRate }));
  const rolling = rollingAverage(sessions.map((s) => s.peakHeartRate));
  const trendPoints: MetricPoint[] = sessions.map((s, i) => ({ label: s.date, value: rolling[i] }));
  const peakAgg = aggregateSeries(peakPoints, granularity, mode);
  const trendAgg = aggregateSeries(trendPoints, granularity, mode);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm" data-testid={`sport-section-${sport.toLowerCase()}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-gray-900">{sport}</h3>
          <p className="text-sm text-gray-600">Load type: {loadLabel}</p>
        </div>
        {isMock && (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800" data-testid="sample-data-badge">
            Sample Data
          </span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="text-xs uppercase tracking-wide text-gray-500">Total Calories</p>
          <p className="mt-1 text-xl font-semibold text-gray-900">{totalCalories.toLocaleString("en-US")}</p>
        </div>
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="text-xs uppercase tracking-wide text-gray-500">Total Steps</p>
          <p className="mt-1 text-xl font-semibold text-gray-900">{totalSteps.toLocaleString("en-US")}</p>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900" data-testid="sport-summary-text">
        {sport === "Running" ? (
          <p>
            Running sessions: {sessions.length}. Average peak HR: {averagePeak ?? "-"} bpm.
            This reflects your aerobic load profile. Speed/pace cannot be derived from current CSV because distance data is not exported in this file.
          </p>
        ) : (
          <p>
            {sport} sessions: {sessions.length}. Average peak HR: {averagePeak ?? "-"} bpm.
            This view emphasizes interval-style intensity and session frequency.
          </p>
        )}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <MetricChart
          title={`${sport} Peak Intensity`}
          tooltipKey={sport === "Running" ? "runningPeak" : "padelPeak"}
          data={peakAgg}
          unit="bpm"
          variant="bar"
        />
        <MetricChart
          title={`${sport} Peak Trend`}
          tooltipKey={sport === "Running" ? "runningPeak" : "padelPeak"}
          data={trendAgg}
          unit="bpm"
          variant="line"
        />
      </div>
    </section>
  );
}

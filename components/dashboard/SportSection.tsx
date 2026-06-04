import MetricChart, { type MetricPoint } from "@/components/dashboard/MetricChart";
import type { SportSession } from "@/lib/mockData";

interface Props {
  sport: "Running" | "Padel";
  sessions: SportSession[];
  isMock: boolean;
}

function rollingAverage(values: number[], windowSize = 3): number[] {
  return values.map((_, idx) => {
    const start = Math.max(0, idx - windowSize + 1);
    const window = values.slice(start, idx + 1);
    const sum = window.reduce((acc, v) => acc + v, 0);
    return Math.round(sum / window.length);
  });
}

export default function SportSection({ sport, sessions, isMock }: Props) {
  const totalCalories = sessions.reduce((acc, s) => acc + s.calories, 0);
  const totalSteps = sessions.reduce((acc, s) => acc + s.steps, 0);
  const loadLabel = sport === "Running" ? "Aerobic Endurance" : "Explosive Interval";

  const peakPoints: MetricPoint[] = sessions.map((s) => ({ label: s.date.slice(5), value: s.peakHeartRate }));
  const rolling = rollingAverage(sessions.map((s) => s.peakHeartRate));
  const trendPoints: MetricPoint[] = sessions.map((s, i) => ({ label: s.date.slice(5), value: rolling[i] }));

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

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <MetricChart
          title={`${sport} Peak Intensity`}
          tooltipKey={sport === "Running" ? "runningPeak" : "padelPeak"}
          data={peakPoints}
          unit="bpm"
          variant="bar"
        />
        <MetricChart
          title={`${sport} Peak Trend`}
          tooltipKey={sport === "Running" ? "runningPeak" : "padelPeak"}
          data={trendPoints}
          unit="bpm"
          variant="line"
        />
      </div>
    </section>
  );
}

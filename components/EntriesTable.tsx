import type { HealthEntryDoc } from "@/types/health";

interface Props {
  entries: HealthEntryDoc[];
}

function fmt(val: number | null, decimals = 0): string {
  if (val === null) return "—";
  return val.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

function fmtSleep(minutes: number | null): string {
  if (minutes === null) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function fmtRange(r: { min: number; max: number } | null): string {
  if (!r) return "—";
  const min = r.min % 1 !== 0 ? r.min.toFixed(1) : String(r.min);
  const max = r.max % 1 !== 0 ? r.max.toFixed(1) : String(r.max);
  return min === max ? min : `${min}–${max}`;
}

function fmtDate(d: Date): string {
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function EntriesTable({ entries }: Props) {
  if (entries.length === 0) {
    return (
      <div
        data-testid="entries-empty"
        className="rounded-lg border border-dashed border-gray-300 p-12 text-center text-sm text-gray-400"
      >
        No health entries yet. Import a CSV to get started.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
      <table className="min-w-full divide-y divide-gray-200 text-sm" data-testid="entries-table">
        <thead className="bg-gray-50">
          <tr>
            {["Date", "Steps", "Calories", "Sleep", "Heart Rate", "Resting HR", "HRV", "Cardio"].map(
              (h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500"
                >
                  {h}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {entries.map((e) => (
            <tr
              key={String(e._id)}
              className="hover:bg-blue-50 transition-colors"
              data-testid="entry-row"
            >
              <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">
                {fmtDate(e.date)}
              </td>
              <td className="px-4 py-3 text-gray-700">{fmt(e.steps)}</td>
              <td className="px-4 py-3 text-gray-700">{fmt(e.activeCalories)}</td>
              <td className="px-4 py-3 text-gray-700">{fmtSleep(e.sleep)}</td>
              <td className="px-4 py-3 text-gray-700">{fmtRange(e.heartRate)}</td>
              <td className="px-4 py-3 text-gray-700">{fmt(e.restingHeartRate)}</td>
              <td className="px-4 py-3 text-gray-700">{fmtRange(e.hrv)}</td>
              <td className="px-4 py-3 text-gray-700">{fmt(e.cardioFitness, 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

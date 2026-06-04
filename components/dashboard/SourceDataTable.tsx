"use client";

import { useMemo, useState } from "react";
import type { HealthEntryDoc } from "@/types/health";

type SortKey = "date" | "steps" | "activeCalories" | "sleep" | "restingHeartRate" | "cardioFitness";
type SortDir = "asc" | "desc";

interface Props {
  entries: HealthEntryDoc[];
}

function asNumber(val: number | null | undefined): number {
  return val ?? Number.NEGATIVE_INFINITY;
}

function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
}

function fmtSleep(minutes: number | null): string {
  if (minutes === null) return "-";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

export default function SourceDataTable({ entries }: Props) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();

    const filtered = entries.filter((entry) => {
      if (!q) return true;

      const haystack = [
        fmtDate(entry.date),
        String(entry.steps ?? ""),
        String(entry.activeCalories ?? ""),
        String(entry.restingHeartRate ?? ""),
        String(entry.cardioFitness ?? ""),
        String(entry.workoutType ?? ""),
        String(entry.sportType ?? ""),
      ].join(" ").toLowerCase();

      return haystack.includes(q);
    });

    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "date") {
        cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
      } else {
        cmp = asNumber(a[sortKey]) - asNumber(b[sortKey]);
      }

      return sortDir === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [entries, query, sortKey, sortDir]);

  function toggleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDir(nextKey === "date" ? "desc" : "asc");
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm" data-testid="source-data-section">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Source Data</h3>
        <input
          data-testid="source-filter"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Smart filter (date, steps, workout...)"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm sm:w-80"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm" data-testid="source-data-table">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left"><button type="button" onClick={() => toggleSort("date")}>Date</button></th>
              <th className="px-3 py-2 text-left"><button type="button" onClick={() => toggleSort("steps")}>Steps</button></th>
              <th className="px-3 py-2 text-left"><button type="button" onClick={() => toggleSort("activeCalories")}>Calories</button></th>
              <th className="px-3 py-2 text-left"><button type="button" onClick={() => toggleSort("sleep")}>Sleep</button></th>
              <th className="px-3 py-2 text-left"><button type="button" onClick={() => toggleSort("restingHeartRate")}>RHR</button></th>
              <th className="px-3 py-2 text-left"><button type="button" onClick={() => toggleSort("cardioFitness")}>VO2</button></th>
              <th className="px-3 py-2 text-left">Workout</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((entry) => (
              <tr key={String(entry._id)} className="border-t border-gray-100">
                <td className="px-3 py-2">{fmtDate(entry.date)}</td>
                <td className="px-3 py-2">{entry.steps ?? "-"}</td>
                <td className="px-3 py-2">{entry.activeCalories ?? "-"}</td>
                <td className="px-3 py-2">{fmtSleep(entry.sleep)}</td>
                <td className="px-3 py-2">{entry.restingHeartRate ?? "-"}</td>
                <td className="px-3 py-2">{entry.cardioFitness ?? "-"}</td>
                <td className="px-3 py-2">{entry.workoutType ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

"use client";

import { useMemo, useState } from "react";
import type { HealthEntryDoc } from "@/types/health";

type SortKey = "date" | "steps" | "activeCalories" | "sleep" | "restingHeartRate" | "cardioFitness";
type SortDir = "asc" | "desc";
type NumericFilterOperator = "gt" | "lt" | "eq";
type NumericFilterColumn = Exclude<SortKey, "date">;

interface Props {
  entries: HealthEntryDoc[];
}

interface ColumnFilter {
  column: NumericFilterColumn;
  operator: NumericFilterOperator;
  value: string;
}

function asNumber(val: number | null | undefined): number | null {
  return val ?? null;
}

function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

function fmtSleep(minutes: number | null): string {
  if (minutes === null) return "-";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

function compareNumeric(actual: number | null, expected: number, operator: NumericFilterOperator): boolean {
  if (actual === null) return false;
  if (operator === "gt") return actual > expected;
  if (operator === "lt") return actual < expected;
  return actual === expected;
}

function cellText(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return String(value);
}

export default function SourceDataTable({ entries }: Props) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [activeFilter, setActiveFilter] = useState<ColumnFilter | null>(null);
  const [draftFilter, setDraftFilter] = useState<ColumnFilter>({ column: "steps", operator: "gt", value: "" });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();

    const filtered = entries.filter((entry) => {
      if (q) {
        const haystack = [
          fmtDate(entry.date),
          String(entry.steps ?? ""),
          String(entry.activeCalories ?? ""),
          String(entry.restingHeartRate ?? ""),
          String(entry.cardioFitness ?? ""),
          String(entry.workoutType ?? ""),
          String(entry.sportType ?? ""),
        ].join(" ").toLowerCase();

        if (!haystack.includes(q)) {
          return false;
        }
      }

      if (activeFilter && activeFilter.value.trim() !== "") {
        const numericValue = Number(activeFilter.value);
        if (!Number.isFinite(numericValue)) {
          return false;
        }
        const actual = asNumber(entry[activeFilter.column]);
        if (!compareNumeric(actual, numericValue, activeFilter.operator)) {
          return false;
        }
      }

      return true;
    });

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "date") {
        cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
      } else {
        cmp = (asNumber(a[sortKey]) ?? Number.NEGATIVE_INFINITY) - (asNumber(b[sortKey]) ?? Number.NEGATIVE_INFINITY);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [entries, query, sortKey, sortDir, activeFilter]);

  function toggleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDir(nextKey === "date" ? "desc" : "asc");
  }

  function activateColumn(column: NumericFilterColumn) {
    setDraftFilter((prev) => ({ ...prev, column }));
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="source-data-section">
      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Source Data</h3>
          <p className="text-xs text-slate-500">Click a column, then filter with greater than, less than, or equal like a spreadsheet.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <input
            data-testid="source-filter"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Smart search: date, workout, steps..."
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400"
          />
          <select
            aria-label="filter column"
            value={draftFilter.column}
            onChange={(e) => setDraftFilter((prev) => ({ ...prev, column: e.target.value as NumericFilterColumn }))}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm"
          >
            <option value="steps">Steps</option>
            <option value="activeCalories">Calories</option>
            <option value="sleep">Sleep minutes</option>
            <option value="restingHeartRate">Resting HR</option>
            <option value="cardioFitness">VO2 Max</option>
          </select>
          <select
            aria-label="filter operator"
            value={draftFilter.operator}
            onChange={(e) => setDraftFilter((prev) => ({ ...prev, operator: e.target.value as NumericFilterOperator }))}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm"
          >
            <option value="gt">greater than</option>
            <option value="lt">less than</option>
            <option value="eq">equal to</option>
          </select>
          <input
            aria-label="filter value"
            inputMode="decimal"
            value={draftFilter.value}
            onChange={(e) => setDraftFilter((prev) => ({ ...prev, value: e.target.value }))}
            placeholder="Value"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm"
          />
          <button
            type="button"
            onClick={() => setActiveFilter(draftFilter)}
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm"
          >
            Apply filter
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveFilter(null);
              setDraftFilter({ column: "steps", operator: "gt", value: "" });
              setQuery("");
            }}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm"
          >
            Clear
          </button>
        </div>
      </div>

      {activeFilter && activeFilter.value.trim() !== "" && (
        <div className="mb-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700" data-testid="active-filter-summary">
          Filtering {activeFilter.column} {activeFilter.operator === "gt" ? ">" : activeFilter.operator === "lt" ? "<" : "="} {activeFilter.value}
          .
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm" data-testid="source-data-table">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left">
                <button type="button" className="font-semibold" onClick={() => toggleSort("date")}>
                  Date
                </button>
              </th>
              <th className="px-3 py-2 text-left">
                <button type="button" className="font-semibold" onClick={() => { toggleSort("steps"); activateColumn("steps"); }}>Steps</button>
              </th>
              <th className="px-3 py-2 text-left">
                <button type="button" className="font-semibold" onClick={() => { toggleSort("activeCalories"); activateColumn("activeCalories"); }}>Calories</button>
              </th>
              <th className="px-3 py-2 text-left">
                <button type="button" className="font-semibold" onClick={() => { toggleSort("sleep"); activateColumn("sleep"); }}>Sleep</button>
              </th>
              <th className="px-3 py-2 text-left">
                <button type="button" className="font-semibold" onClick={() => { toggleSort("restingHeartRate"); activateColumn("restingHeartRate"); }}>RHR</button>
              </th>
              <th className="px-3 py-2 text-left">
                <button type="button" className="font-semibold" onClick={() => { toggleSort("cardioFitness"); activateColumn("cardioFitness"); }}>VO2</button>
              </th>
              <th className="px-3 py-2 text-left font-semibold">Workout</th>
              <th className="px-3 py-2 text-left font-semibold">Sport</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white text-slate-900">
            {rows.map((entry) => (
              <tr key={String(entry._id)} className="hover:bg-slate-50">
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(entry.date)}</td>
                <td className="px-3 py-2">{cellText(entry.steps)}</td>
                <td className="px-3 py-2">{cellText(entry.activeCalories)}</td>
                <td className="px-3 py-2">{fmtSleep(entry.sleep)}</td>
                <td className="px-3 py-2">{cellText(entry.restingHeartRate)}</td>
                <td className="px-3 py-2">{cellText(entry.cardioFitness)}</td>
                <td className="px-3 py-2">{entry.workoutType ?? "-"}</td>
                <td className="px-3 py-2">{entry.sportType ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

import Papa from "papaparse";
import type { HealthEntryInput, RangeValue } from "@/types/health";

// ---------------------------------------------------------------------------
// Field sanitisers
// ---------------------------------------------------------------------------

function isEmpty(raw: string): boolean {
  return !raw || raw.trim() === "" || raw.trim() === "-";
}

/**
 * "02/05/2026" → Date(UTC 2026-05-02T00:00:00Z)
 * Uses Date.UTC to avoid local-timezone shifts when the server is not in UTC.
 */
function parseDate(raw: string): Date {
  const [day, month, year] = raw.split("/").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** "1,109" → 1109  |  "-" → null */
function parseNumber(raw: string): number | null {
  if (isEmpty(raw)) return null;
  const n = parseFloat(raw.replace(/,/g, ""));
  return isNaN(n) ? null : n;
}

/**
 * "50-89"      → { min: 50,    max: 89    }
 * "46.22-130"  → { min: 46.22, max: 130   }  (decimal on one side)
 * "58.51"      → { min: 58.51, max: 58.51 }  (single value, symmetric)
 * "-"          → null
 *
 * Splits only on the LAST hyphen to handle negative numbers and
 * decimals like "46.22-130" without ambiguity.
 */
function parseRange(raw: string): RangeValue | null {
  if (isEmpty(raw)) return null;

  const lastHyphen = raw.lastIndexOf("-");
  // A hyphen at position 0 (negative number with no range) means single value
  if (lastHyphen <= 0) {
    const val = parseFloat(raw);
    return isNaN(val) ? null : { min: val, max: val };
  }

  const left = raw.slice(0, lastHyphen);
  const right = raw.slice(lastHyphen + 1);
  const minVal = parseFloat(left);
  const maxVal = parseFloat(right);

  if (isNaN(minVal) || isNaN(maxVal)) return null;
  return { min: minVal, max: maxVal };
}

/**
 * "3h 19m" → 199   "6h 1m" → 361   "45m" → 45   "2h" → 120
 * "-"       → null
 */
function parseSleep(raw: string): number | null {
  if (isEmpty(raw)) return null;

  const hoursMatch = raw.match(/(\d+)h/);
  const minutesMatch = raw.match(/(\d+)m/);

  const hours = hoursMatch ? parseInt(hoursMatch[1], 10) : 0;
  const minutes = minutesMatch ? parseInt(minutesMatch[1], 10) : 0;
  const total = hours * 60 + minutes;

  return total > 0 ? total : null;
}

// ---------------------------------------------------------------------------
// Row transformer
// ---------------------------------------------------------------------------

type RawRow = Record<string, string>;

function parseRow(row: RawRow): HealthEntryInput {
  return {
    date: parseDate(row["Date"]),
    activeCalories: parseNumber(row["Active Calories (kcal)"] ?? ""),
    cardioFitness: parseNumber(row["Cardio Fitness (mL/min·kg)"] ?? ""),
    heartRate: parseRange(row["Heart Rate (bpm)"] ?? ""),
    hrv: parseRange(row["Heart Rate Variability (ms)"] ?? ""),
    restingHeartRate: parseNumber(row["Resting Heart Rate (bpm)"] ?? ""),
    sleep: parseSleep(row["Sleep"] ?? ""),
    steps: parseNumber(row["Steps (steps)"] ?? ""),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function parseCSV(csvText: string): { entries: HealthEntryInput[]; skipped: number } {
  // The Apple Health CSV export uses decorative quotes inside column header names
  // (e.g. "Active Calories" (kcal)) which papaparse misreads as CSV field quoting,
  // causing the entire header to collapse into one field and consuming the first
  // data row. Fix: strip all quote characters from the header line only.
  const lines = csvText.split(/\r?\n/);
  const cleanedHeader = lines[0].replace(/"/g, "");
  const cleanedCsv = [cleanedHeader, ...lines.slice(1)].join("\n");

  const result = Papa.parse<RawRow>(cleanedCsv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });

  const allRows = result.data.map((row) => parseRow(row));
  const entries = allRows.filter((entry) => !isNaN(entry.date.getTime()));
  return { entries, skipped: allRows.length - entries.length };
}

import { describe, it, expect } from "vitest";
import { parseCSV } from "@/lib/parsers/csvParser";

// ---------------------------------------------------------------------------
// Minimal Apple Health–style CSV fixture
// The header intentionally uses decorative quotes to mirror the real export.
// ---------------------------------------------------------------------------
const HEADER = `"Date","Active Calories" (kcal),"Cardio Fitness" (mL/min·kg),"Heart Rate" (bpm),"Heart Rate Variability" (ms),"Resting Heart Rate" (bpm),"Sleep","Steps" (steps)`;

function makeRow(
  date: string,
  cal: string,
  cardio: string,
  hr: string,
  hrv: string,
  rhr: string,
  sleep: string,
  steps: string
) {
  return `${date},${cal},${cardio},${hr},${hrv},${rhr},${sleep},${steps}`;
}

function csv(...rows: string[]) {
  return [HEADER, ...rows].join("\n");
}

// ---------------------------------------------------------------------------
// parseCSV
// ---------------------------------------------------------------------------
describe("parseCSV", () => {
  it("parses a single complete row correctly", () => {
    const { entries } = parseCSV(
      csv(makeRow("02/05/2026", "449", "-", "46-105", "21.55-64.63", "52", "5h 8m", "6313"))
    );
    expect(entries).toHaveLength(1);
    const row = entries[0];
    expect(row.date).toEqual(new Date(Date.UTC(2026, 4, 2)));
    expect(row.activeCalories).toBe(449);
    expect(row.cardioFitness).toBeNull();
    expect(row.heartRate).toEqual({ min: 46, max: 105 });
    expect(row.hrv).toEqual({ min: 21.55, max: 64.63 });
    expect(row.restingHeartRate).toBe(52);
    expect(row.sleep).toBe(308);
    expect(row.steps).toBe(6313);
  });

  it("strips decorative quotes from the header so all columns are parsed", () => {
    // If header parsing fails, every field would be null
    const { entries } = parseCSV(
      csv(makeRow("02/05/2026", "100", "-", "50-90", "20-60", "55", "6h", "5000"))
    );
    expect(entries[0].activeCalories).toBe(100);
    expect(entries[0].steps).toBe(5000);
  });

  it("returns multiple rows in order", () => {
    const { entries } = parseCSV(
      csv(
        makeRow("02/05/2026", "100", "-", "50-90", "20-60", "55", "6h", "5000"),
        makeRow("03/05/2026", "200", "-", "48-95", "22-65", "50", "7h", "7000")
      )
    );
    expect(entries).toHaveLength(2);
    expect(entries[0].date).toEqual(new Date(Date.UTC(2026, 4, 2)));
    expect(entries[1].date).toEqual(new Date(Date.UTC(2026, 4, 3)));
  });

  it("filters out rows with an invalid date and counts them as skipped", () => {
    const { entries, skipped } = parseCSV(csv(makeRow("not-a-date", "100", "-", "-", "-", "-", "-", "-")));
    expect(entries).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  it("returns skipped=0 for a fully valid CSV", () => {
    const { entries, skipped } = parseCSV(
      csv(makeRow("02/05/2026", "100", "-", "50-90", "20-60", "55", "6h", "5000"))
    );
    expect(entries).toHaveLength(1);
    expect(skipped).toBe(0);
  });

  it("returns empty entries for empty CSV body", () => {
    const { entries } = parseCSV(HEADER);
    expect(entries).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Date parsing — timezone safety
// ---------------------------------------------------------------------------
describe("parseCSV date parsing", () => {
  it("stores dates as midnight UTC regardless of server timezone", () => {
    const { entries } = parseCSV(
      csv(makeRow("01/01/2026", "-", "-", "-", "-", "-", "-", "-"))
    );
    const d = entries[0].date;
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(0);
    expect(d.getUTCDate()).toBe(1);
    expect(d.getUTCHours()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Range parsing edge cases
// ---------------------------------------------------------------------------
describe("parseCSV range fields", () => {
  it("handles decimal min value — '46.22-130'", () => {
    const { entries } = parseCSV(
      csv(makeRow("02/05/2026", "-", "-", "46.22-130", "-", "-", "-", "-"))
    );
    expect(entries[0].heartRate).toEqual({ min: 46.22, max: 130 });
  });

  it("treats single value as symmetric range — '58.51'", () => {
    const { entries } = parseCSV(
      csv(makeRow("09/05/2026", "-", "-", "-", "58.51", "-", "-", "-"))
    );
    expect(entries[0].hrv).toEqual({ min: 58.51, max: 58.51 });
  });

  it("returns null for dash range field", () => {
    const { entries } = parseCSV(
      csv(makeRow("02/05/2026", "-", "-", "-", "-", "-", "-", "-"))
    );
    expect(entries[0].heartRate).toBeNull();
    expect(entries[0].hrv).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Sleep parsing
// ---------------------------------------------------------------------------
describe("parseCSV sleep parsing", () => {
  it("parses hours and minutes — '3h 19m' → 199", () => {
    const { entries } = parseCSV(
      csv(makeRow("02/05/2026", "-", "-", "-", "-", "-", "3h 19m", "-"))
    );
    expect(entries[0].sleep).toBe(199);
  });

  it("parses hours only — '2h' → 120", () => {
    const { entries } = parseCSV(
      csv(makeRow("02/05/2026", "-", "-", "-", "-", "-", "2h", "-"))
    );
    expect(entries[0].sleep).toBe(120);
  });

  it("parses minutes only — '45m' → 45", () => {
    const { entries } = parseCSV(
      csv(makeRow("02/05/2026", "-", "-", "-", "-", "-", "45m", "-"))
    );
    expect(entries[0].sleep).toBe(45);
  });

  it("returns null for dash sleep", () => {
    const { entries } = parseCSV(
      csv(makeRow("02/05/2026", "-", "-", "-", "-", "-", "-", "-"))
    );
    expect(entries[0].sleep).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// All-dash row — the "null island" record
// ---------------------------------------------------------------------------
describe("parseCSV all-null row", () => {
  it("sets every optional field to null when all values are '-'", () => {
    const { entries } = parseCSV(
      csv(makeRow("22/05/2026", "-", "-", "-", "-", "-", "-", "-"))
    );
    expect(entries).toHaveLength(1);
    const row = entries[0];
    expect(row.activeCalories).toBeNull();
    expect(row.cardioFitness).toBeNull();
    expect(row.heartRate).toBeNull();
    expect(row.hrv).toBeNull();
    expect(row.restingHeartRate).toBeNull();
    expect(row.sleep).toBeNull();
    expect(row.steps).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Number parsing
// ---------------------------------------------------------------------------
describe("parseCSV number parsing", () => {
  it("strips commas — '1,109' → 1109 (value must be quoted in CSV)", () => {
    // In CSV, a bare 1,109 splits into two columns; the value must be quoted.
    const rowWithQuotedSteps = `02/05/2026,-,-,-,-,-,-,"1,109"`;
    const { entries } = parseCSV([HEADER, rowWithQuotedSteps].join("\n"));
    expect(entries[0].steps).toBe(1109);
  });

  it("parses float cardio fitness", () => {
    const { entries } = parseCSV(
      csv(makeRow("04/05/2026", "-", "41.38", "-", "-", "-", "-", "-"))
    );
    expect(entries[0].cardioFitness).toBe(41.38);
  });
});

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import EntriesTable from "@/components/EntriesTable";
import type { HealthEntryDoc } from "@/types/health";

const ENTRY: HealthEntryDoc = {
  _id: "507f1f77bcf86cd799439011",
  date: new Date("2026-05-02T00:00:00Z"),
  activeCalories: 487,
  cardioFitness: 41.4,
  heartRate: { min: 52, max: 89 },
  hrv: { min: 21.6, max: 64.6 },
  restingHeartRate: 52,
  sleep: 443, // 7h 23m
  steps: 9243,
};

describe("EntriesTable", () => {
  it("shows empty state when no entries", () => {
    render(<EntriesTable entries={[]} />);
    expect(screen.getByTestId("entries-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("entries-table")).not.toBeInTheDocument();
  });

  it("renders a table when entries are provided", () => {
    render(<EntriesTable entries={[ENTRY]} />);
    expect(screen.getByTestId("entries-table")).toBeInTheDocument();
    expect(screen.queryByTestId("entries-empty")).not.toBeInTheDocument();
  });

  it("renders one row per entry", () => {
    const e2: HealthEntryDoc = { ...ENTRY, _id: "2", date: new Date("2026-05-03T00:00:00Z") };
    render(<EntriesTable entries={[ENTRY, e2]} />);
    expect(screen.getAllByTestId("entry-row")).toHaveLength(2);
  });

  it("formats steps with thousands separator", () => {
    render(<EntriesTable entries={[ENTRY]} />);
    expect(screen.getByTestId("entries-table")).toHaveTextContent("9,243");
  });

  it("formats sleep as hours and minutes", () => {
    render(<EntriesTable entries={[ENTRY]} />);
    expect(screen.getByTestId("entries-table")).toHaveTextContent("7h 23m");
  });

  it("formats heart rate range as min–max", () => {
    render(<EntriesTable entries={[ENTRY]} />);
    expect(screen.getByTestId("entries-table")).toHaveTextContent("52–89");
  });

  it("shows — for null fields", () => {
    const nullEntry: HealthEntryDoc = { ...ENTRY, steps: null, sleep: null, heartRate: null };
    render(<EntriesTable entries={[nullEntry]} />);
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(3);
  });

  it("formats symmetric HRV range as single value", () => {
    const e: HealthEntryDoc = { ...ENTRY, hrv: { min: 58.5, max: 58.5 } };
    render(<EntriesTable entries={[e]} />);
    expect(screen.getByTestId("entries-table")).toHaveTextContent("58.5");
  });

  it("formats the date in en-GB locale (UTC)", () => {
    render(<EntriesTable entries={[ENTRY]} />);
    // 2026-05-02 UTC → "2 May 2026"
    expect(screen.getByTestId("entries-table")).toHaveTextContent("2 May 2026");
  });
});

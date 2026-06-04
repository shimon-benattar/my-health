import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SourceDataTable from "@/components/dashboard/SourceDataTable";
import type { HealthEntryDoc } from "@/types/health";

const ENTRIES: HealthEntryDoc[] = [
  {
    _id: "1",
    date: new Date("2026-06-03"),
    sportType: null,
    workoutType: null,
    workoutDurationMinutes: null,
    activeCalories: 700,
    cardioFitness: 42,
    heartRate: { min: 50, max: 100 },
    hrv: { min: 20, max: 60 },
    restingHeartRate: 52,
    sleep: 420,
    steps: 12000,
  },
  {
    _id: "2",
    date: new Date("2026-06-02"),
    sportType: null,
    workoutType: null,
    workoutDurationMinutes: null,
    activeCalories: 450,
    cardioFitness: 41,
    heartRate: { min: 48, max: 96 },
    hrv: { min: 18, max: 55 },
    restingHeartRate: 54,
    sleep: 390,
    steps: 6000,
  },
];

describe("SourceDataTable", () => {
  it("filters rows using spreadsheet-style numeric filter", async () => {
    render(<SourceDataTable entries={ENTRIES} />);

    await userEvent.click(screen.getAllByRole("button", { name: "Steps" })[0]);
    await userEvent.selectOptions(screen.getByLabelText("filter operator"), "gt");
    await userEvent.clear(screen.getByLabelText("filter value"));
    await userEvent.type(screen.getByLabelText("filter value"), "10000");
    await userEvent.click(screen.getByRole("button", { name: /apply filter/i }));

    expect(screen.getAllByRole("row")).toHaveLength(2);
  });
});

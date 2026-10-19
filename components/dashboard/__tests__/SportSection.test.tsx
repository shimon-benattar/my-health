import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SportSection from "@/components/dashboard/SportSection";

vi.mock("@/components/dashboard/MetricChart", () => ({
  default: () => <div data-testid="metric-chart-mock" />,
}));

const sessions = [
  {
    date: "2026-06-01",
    startTime: "2026-06-01T08:00:00.000Z",
    peakHeartRate: 170,
    avgHeartRate: 155,
    calories: 600,
    steps: 12000,
    durationMinutes: 30,
    distanceKm: 5,
    paceMinPerKm: 6,
    avgRunningCadenceSpm: 172,
    avgStrideLengthM: 1.02,
    avgGroundContactMs: 281,
    avgRunningPowerW: 250,
    workoutEffortScore: 8,
    estimatedWorkoutEffortScore: 7,
    heartRateRecoveryOneMinute: 29,
    splits: [{ kilometer: 1, durationSeconds: 350, averageHeartRate: 150, paceMinutesPerKm: 5.8 }],
  },
  {
    date: "2026-06-02",
    startTime: "2026-06-02T09:15:00.000Z",
    peakHeartRate: 172,
    calories: 620,
    steps: 12500,
    durationMinutes: 34,
    distanceKm: 5.3,
    paceMinPerKm: 6.2,
    avgRunningCadenceSpm: 170,
    avgStrideLengthM: 1.01,
    avgGroundContactMs: 284,
    avgRunningPowerW: 248,
    splits: [],
    kmSplits: [{ kmIndex: 2, distanceKm: 1, paceMinPerKm: 6.1, avgHeartRate: 156, maxHeartRate: 168 }],
  },
];

describe("SportSection", () => {
  it("shows Sample Data badge when using mock data", () => {
    render(<SportSection sport="Padel" sessions={sessions} isMock={true} granularity="week" mode="average" />);
    expect(screen.getByTestId("sample-data-badge")).toBeInTheDocument();
  });

  it("hides Sample Data badge when using real data", () => {
    render(<SportSection sport="Running" sessions={sessions} isMock={false} granularity="week" mode="average" />);
    expect(screen.queryByTestId("sample-data-badge")).not.toBeInTheDocument();
  });

  it("shows cadence and workout load details for running sessions", () => {
    render(<SportSection sport="Running" sessions={sessions} isMock={false} granularity="week" mode="average" />);
    expect(screen.getByText("Running Cadence")).toBeInTheDocument();
    expect(screen.getByText("Workout Load & Recovery")).toBeInTheDocument();
    expect(screen.getByText("Effort Score")).toBeInTheDocument();
  });

  it("falls back to km splits when a selected run has no detailed split events", async () => {
    render(<SportSection sport="Running" sessions={sessions} isMock={false} granularity="week" mode="average" />);

    const runRow = screen.getAllByText("02 Jun 2026")
      .map((node) => node.closest("tr"))
      .find((row) => row?.querySelector("button"));
    expect(runRow).not.toBeNull();

    await userEvent.click(within(runRow as HTMLTableRowElement).getByRole("button", { name: "Drill down" }));

    expect(screen.getByRole("combobox")).toHaveValue("2026-06-02-2026-06-02T09:15:00.000Z");
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("156")).toBeInTheDocument();
    expect(screen.queryByText("No per-km splits are available for this run.")).not.toBeInTheDocument();
  });
});

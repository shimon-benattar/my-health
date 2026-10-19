import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import DashboardClient, { mergeSaturdayStepsIntoFriday } from "@/components/dashboard/DashboardClient";
import type { HealthEntryDoc } from "@/types/health";

vi.mock("@/components/dashboard/MetricChart", () => ({
  default: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock("@/components/dashboard/MetricConclusion", () => ({
  default: ({ title, summary }: { title: string; summary: string }) => <div>{title}: {summary}</div>,
}));

vi.mock("@/components/dashboard/ReadinessGauge", () => ({
  default: ({ score }: { score: number | null }) => <div data-testid="readiness-gauge-mock">{score ?? "N/A"}</div>,
}));

vi.mock("@/components/dashboard/SourceDataTable", () => ({
  default: () => <div>Source Data Table</div>,
}));

vi.mock("@/components/dashboard/SportSection", () => ({
  default: () => <div>Sport Section</div>,
}));

const responseBody = {
  entries: [
    {
      _id: "1",
      date: "2026-06-01T00:00:00.000Z",
      sourceType: "apple-health",
      activeCalories: 500,
      cardioFitness: 41,
      heartRate: { min: 52, max: 120 },
      hrv: { min: 42, max: 52 },
      restingHeartRate: 54,
      sleep: 450,
      steps: 11000,
      sleepHeartRate: { avg: 39, min: 37, max: 42, lowAlerts: 2 },
      recoveryMetrics: {
        respiratoryRate: { avg: 14.6, min: 14, max: 15 },
        hrvRmssd: { avg: 41, min: 39, max: 43 },
        walkingHeartRateAverage: 88,
        sleepingWristTemperature: 35.6,
        heartRateRecoveryOneMinute: 30,
      },
      vitalityMetrics: {
        timeInDaylightMinutes: 24,
        physicalEffortAvg: 1.8,
        physicalEffortMax: 2.3,
      },
    },
    {
      _id: "2",
      date: "2026-06-02T00:00:00.000Z",
      sourceType: "apple-health",
      activeCalories: 520,
      cardioFitness: null,
      heartRate: { min: 50, max: 118 },
      hrv: { min: 40, max: 50 },
      restingHeartRate: 53,
      sleep: null,
      steps: 10000,
      sleepHeartRate: null,
      recoveryMetrics: {
        respiratoryRate: { avg: 15.1, min: 14.7, max: 15.4 },
        hrvRmssd: { avg: 44, min: 42, max: 45 },
        walkingHeartRateAverage: 86,
        sleepingWristTemperature: 35.7,
        heartRateRecoveryOneMinute: 31,
      },
      vitalityMetrics: {
        timeInDaylightMinutes: 28,
        physicalEffortAvg: 1.9,
        physicalEffortMax: 2.5,
      },
    },
  ],
  workouts: [],
  readiness: 0,
  readinessTrend: [],
  recentWatchMetricsAvailability: {
    sleepingWristTemperature: { firstDate: "2026-06-01", sampleDays: 2 },
    hrvRmssd: { firstDate: "2026-06-01", sampleDays: 2 },
    workoutEffortScore: { firstDate: null, sampleCount: 0 },
    timeInDaylightMinutes: { firstDate: "2026-06-01", sampleDays: 2 },
  },
  profile: {
    name: "Shimon",
    birthdate: "21/04/1979",
    weightKg: 85,
    heightCm: 177,
  },
};

describe("DashboardClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(responseBody),
    }) as unknown as typeof fetch;
  });

  it("defaults chart grouping to week and explains that missing measurements are excluded", async () => {
    render(<DashboardClient initialTab="overview" />);

    expect(await screen.findByTestId("overview-panel")).toBeInTheDocument();
    expect(screen.getByLabelText("overview view by")).toHaveValue("week");
    expect(screen.getByTestId("measurement-coverage-note")).toHaveTextContent("excluded from charts, averages, and AI summaries");
    expect(screen.getByTestId("sleep-step-labeling-note")).toHaveTextContent("Friday and Saturday steps are merged into Friday");
  });

  it("clarifies low sleeping heart-rate messages and uses the latest measured readiness", async () => {
    render(<DashboardClient initialTab="overview" />);

    await waitFor(() => expect(screen.getByText("Latest Measured Readiness")).toBeInTheDocument());
    expect(screen.getByText(/sleeping heart-rate samples below 40 bpm/i)).toBeInTheDocument();
    expect(screen.getByTestId("readiness-gauge-mock")).toHaveTextContent("58");
  });

  it("renders the recovery and vitals section when new-watch metrics exist", async () => {
    render(<DashboardClient initialTab="overview" />);

    const section = await screen.findByTestId("recovery-vitals-section");
    expect(section).toBeInTheDocument();
    expect(screen.getAllByText("Respiratory Rate").length).toBeGreaterThan(0);
    expect(screen.getAllByText("HRV RMSSD").length).toBeGreaterThan(0);
    expect(screen.getByText(/available from your newer watch starting/i)).toBeInTheDocument();
  });

  it("requests fresh dashboard metrics by bypassing the API cache", async () => {
    render(<DashboardClient initialTab="overview" />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/dashboard/metrics?range=all&refresh=1",
      { cache: "no-store" }
    );
  });

  it("shows the database connectivity reason when only a stale snapshot is available", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        ...responseBody,
        stale: true,
        staleCode: "database_unavailable",
        staleReason: "Database is unavailable. Check MongoDB Atlas connectivity or IP allowlist and try again.",
      }),
    }) as unknown as typeof fetch;

    render(<DashboardClient initialTab="overview" />);

    expect(await screen.findByText(/MongoDB Atlas connectivity or IP allowlist/i)).toBeInTheDocument();
    expect(screen.getByText(/saved dashboard snapshot/i)).toBeInTheDocument();
  });

  it("merges Saturday steps into Friday and removes Saturday from step averages", () => {
    const entries: HealthEntryDoc[] = [
      {
        _id: "fri",
        date: new Date("2026-09-11T00:00:00.000Z"),
        activeCalories: null,
        cardioFitness: null,
        heartRate: null,
        hrv: null,
        restingHeartRate: null,
        sleep: null,
        steps: 4000,
      },
      {
        _id: "sat",
        date: new Date("2026-09-12T00:00:00.000Z"),
        activeCalories: null,
        cardioFitness: null,
        heartRate: null,
        hrv: null,
        restingHeartRate: null,
        sleep: null,
        steps: 3000,
      },
    ];

    const adjusted = mergeSaturdayStepsIntoFriday(entries);

    expect(adjusted).toHaveLength(2);
    expect(adjusted[0].steps).toBe(7000);
    expect(adjusted[1].steps).toBeNull();
  });
});

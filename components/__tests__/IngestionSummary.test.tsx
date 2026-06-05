import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import IngestionSummary from "@/components/IngestionSummary";
import type { AppleHealthImportResult, IngestionResult } from "@/types/health";

const BASE: IngestionResult = {
  inserted: 30,
  updated: 2,
  unchanged: 1,
  skipped: 0,
  dateRange: { from: "2026-05-02", to: "2026-06-02" },
  pulled: [
    {
      date: "2026-05-02T00:00:00.000Z",
      action: "inserted",
      pulledAt: "2026-06-04T10:00:00.000Z",
      sourceType: "csv",
      sourceFile: "export.csv",
    },
  ],
};

const APPLE_BASE: AppleHealthImportResult = {
  requestId: "req-1",
  status: "ok",
  counts: {
    recordsProcessed: 120,
    workoutsProcessed: 8,
    routesFound: 7,
    routesMatched: 6,
    unmatchedWorkouts: 2,
    skipped: 3,
    inserted: 10,
    updated: 5,
  },
  warnings: ["Ignored export_cda.xml"],
  sampleUnmatchedWorkouts: [
    {
      workoutType: "HKWorkoutActivityTypeRunning",
      startDate: "2026-06-01T08:00:00.000Z",
      endDate: "2026-06-01T08:30:00.000Z",
      reason: "No GPX candidates found in tolerance window",
    },
  ],
};

describe("IngestionSummary", () => {
  it("renders with role=status", () => {
    render(<IngestionSummary result={BASE} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows total records as inserted + updated", () => {
    render(<IngestionSummary result={BASE} />);
    expect(screen.getByTestId("total-count")).toHaveTextContent("32");
    expect(screen.getByTestId("inserted-count")).toHaveTextContent("30");
    expect(screen.getByTestId("updated-count")).toHaveTextContent("2");
    expect(screen.getByTestId("unchanged-count")).toHaveTextContent("1");
  });

  it("formats and displays the date range", () => {
    render(<IngestionSummary result={BASE} />);
    expect(screen.getByTestId("date-range")).toHaveTextContent("2 May 2026");
    expect(screen.getByTestId("date-range")).toHaveTextContent("2 Jun 2026");
  });

  it("hides skipped row when skipped = 0", () => {
    render(<IngestionSummary result={BASE} />);
    expect(screen.queryByTestId("skipped-count")).not.toBeInTheDocument();
  });

  it("shows skipped count when skipped > 0", () => {
    render(<IngestionSummary result={{ ...BASE, skipped: 3 }} />);
    expect(screen.getByTestId("skipped-count")).toHaveTextContent("3");
  });

  it("renders Go to Dashboard link pointing to /dashboard", () => {
    render(<IngestionSummary result={BASE} />);
    const link = screen.getByTestId("dashboard-link");
    expect(link).toHaveAttribute("href", "/dashboard");
    expect(link).toHaveTextContent(/go to dashboard/i);
  });

  it("hides date range when dateRange is null", () => {
    render(<IngestionSummary result={{ ...BASE, dateRange: null }} />);
    expect(screen.queryByTestId("date-range")).not.toBeInTheDocument();
  });

  it("shows pulled delta list", () => {
    render(<IngestionSummary result={BASE} />);
    expect(screen.getByTestId("pulled-list")).toBeInTheDocument();
    expect(screen.getByTestId("pulled-list")).toHaveTextContent(/inserted/i);
  });

  it("renders Apple Health summary counts", () => {
    render(<IngestionSummary result={APPLE_BASE} />);
    expect(screen.getByTestId("total-count")).toHaveTextContent("120");
    expect(screen.getByText(/workouts processed: 8/i)).toBeInTheDocument();
    expect(screen.getByText(/routes matched: 6/i)).toBeInTheDocument();
  });

  it("renders Apple Health warnings and unmatched sample", () => {
    render(<IngestionSummary result={APPLE_BASE} />);
    expect(screen.getByText(/ignored export_cda.xml/i)).toBeInTheDocument();
    expect(screen.getByTestId("pulled-list")).toHaveTextContent(/no gpx candidates found/i);
  });
});

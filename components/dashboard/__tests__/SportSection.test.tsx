import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SportSection from "@/components/dashboard/SportSection";

vi.mock("@/components/dashboard/MetricChart", () => ({
  default: () => <div data-testid="metric-chart-mock" />,
}));

const sessions = [
  { date: "2026-06-01", peakHeartRate: 170, calories: 600, steps: 12000 },
  { date: "2026-06-02", peakHeartRate: 172, calories: 620, steps: 12500 },
];

describe("SportSection", () => {
  it("shows Sample Data badge when using mock data", () => {
    render(<SportSection sport="Padel" sessions={sessions} isMock={true} />);
    expect(screen.getByTestId("sample-data-badge")).toBeInTheDocument();
  });

  it("hides Sample Data badge when using real data", () => {
    render(<SportSection sport="Running" sessions={sessions} isMock={false} />);
    expect(screen.queryByTestId("sample-data-badge")).not.toBeInTheDocument();
  });
});

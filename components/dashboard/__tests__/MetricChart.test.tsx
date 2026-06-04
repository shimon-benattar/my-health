import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import MetricChart from "@/components/dashboard/MetricChart";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Line: () => <div data-testid="line-element" />, 
  CartesianGrid: () => <div />, 
  XAxis: () => <div />, 
  YAxis: () => <div />, 
  Tooltip: () => <div />, 
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar: () => <div data-testid="bar-element" />, 
}));

describe("MetricChart", () => {
  it("renders empty state when all values are null", () => {
    render(
      <MetricChart
        title="HRV"
        tooltipKey="hrv"
        data={[{ label: "01/06", value: null }]}
      />
    );

    expect(screen.getByTestId("metric-chart-empty")).toBeInTheDocument();
  });

  it("renders chart when data contains numeric values", () => {
    render(
      <MetricChart
        title="RHR"
        tooltipKey="rhr"
        data={[{ label: "01/06", value: 54 }]}
      />
    );

    expect(screen.getByTestId("metric-chart-rendered")).toBeInTheDocument();
    expect(screen.getByTestId("line-element")).toBeInTheDocument();
  });
});

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import IngestionSummary from "@/components/IngestionSummary";
import type { IngestionResult } from "@/types/health";

const BASE: IngestionResult = {
  inserted: 30,
  updated: 2,
  skipped: 0,
  dateRange: { from: "2026-05-02", to: "2026-06-02" },
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

  it("renders Go to Dashboard link pointing to /", () => {
    render(<IngestionSummary result={BASE} />);
    const link = screen.getByTestId("dashboard-link");
    expect(link).toHaveAttribute("href", "/");
    expect(link).toHaveTextContent(/go to dashboard/i);
  });

  it("hides date range when dateRange is null", () => {
    render(<IngestionSummary result={{ ...BASE, dateRange: null }} />);
    expect(screen.queryByTestId("date-range")).not.toBeInTheDocument();
  });
});

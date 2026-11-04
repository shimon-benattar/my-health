import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ReadinessGauge from "@/components/dashboard/ReadinessGauge";

describe("ReadinessGauge", () => {
  it("shows red band at 39", () => {
    render(<ReadinessGauge score={39} />);
    expect(screen.getByTestId("readiness-value")).toHaveClass("text-red-600");
  });

  it("shows amber band at 40", () => {
    render(<ReadinessGauge score={40} />);
    expect(screen.getByTestId("readiness-value")).toHaveClass("text-amber-600");
  });

  it("shows amber band at 69", () => {
    render(<ReadinessGauge score={69} />);
    expect(screen.getByTestId("readiness-value")).toHaveClass("text-amber-600");
  });

  it("shows green band at 70", () => {
    render(<ReadinessGauge score={70} />);
    expect(screen.getByTestId("readiness-value")).toHaveClass("text-green-600");
  });

  it("shows N/A when a complete readiness measurement is unavailable", () => {
    render(<ReadinessGauge score={null} />);
    expect(screen.getByTestId("readiness-value")).toHaveTextContent("N/A");
  });
});

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Home from "@/app/page";

describe("Landing page", () => {
  it("renders the my-health heading", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { name: /my-health/i })).toBeInTheDocument();
  });

  it("renders a View Dashboard link pointing to /dashboard", () => {
    render(<Home />);
    const link = screen.getByTestId("view-dashboard-link");
    expect(link).toHaveAttribute("href", "/dashboard");
    expect(link).toHaveTextContent(/view dashboard/i);
  });

  it("renders an Import Health Data link pointing to /dashboard", () => {
    render(<Home />);
    const link = screen.getByTestId("import-data-link");
    expect(link).toHaveAttribute("href", "#import-data");
    expect(link).toHaveTextContent(/import zip data/i);
  });

  it("renders the UploadForm on the landing page", () => {
    render(<Home />);
    expect(screen.getByTestId("file-input")).toBeInTheDocument();
  });
});

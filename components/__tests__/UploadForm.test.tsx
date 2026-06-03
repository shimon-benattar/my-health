import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UploadForm from "@/components/UploadForm";

// ---------------------------------------------------------------------------
// Mock global fetch
// ---------------------------------------------------------------------------
function mockFetch(body: object, status = 200) {
  global.fetch = vi.fn().mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
describe("UploadForm rendering", () => {
  it("renders the Browse button, file name placeholder, and Upload CSV button", () => {
    render(<UploadForm />);
    expect(screen.getByRole("button", { name: /upload csv/i })).toBeInTheDocument();
    expect(screen.getByText(/no file chosen/i)).toBeInTheDocument();
    expect(screen.getByText(/browse/i)).toBeInTheDocument();
  });

  it("Upload CSV button is disabled when no file is selected", () => {
    render(<UploadForm />);
    expect(screen.getByRole("button", { name: /upload csv/i })).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// File selection
// ---------------------------------------------------------------------------
describe("UploadForm file selection", () => {
  it("shows the filename after a file is chosen", async () => {
    render(<UploadForm />);
    const input = screen.getByTestId("file-input");
    const file = new File(["date,steps"], "export.csv", { type: "text/csv" });
    await userEvent.upload(input, file);
    expect(screen.getByTestId("file-name")).toHaveTextContent("export.csv");
  });

  it("enables Upload CSV button once a file is selected", async () => {
    render(<UploadForm />);
    const input = screen.getByTestId("file-input");
    const file = new File(["date,steps"], "export.csv", { type: "text/csv" });
    await userEvent.upload(input, file);
    expect(screen.getByRole("button", { name: /upload csv/i })).toBeEnabled();
  });
});

// ---------------------------------------------------------------------------
// Successful upload
// ---------------------------------------------------------------------------
describe("UploadForm successful upload", () => {
  it("shows ingestion summary on success", async () => {
    mockFetch({ inserted: 32, updated: 0, skipped: 0, dateRange: { from: "2026-05-02", to: "2026-06-02" } });
    render(<UploadForm />);

    const input = screen.getByTestId("file-input");
    await userEvent.upload(input, new File(["data"], "health.csv", { type: "text/csv" }));
    await userEvent.click(screen.getByRole("button", { name: /upload csv/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
    expect(screen.getByTestId("total-count")).toHaveTextContent("32");
    expect(screen.getByTestId("date-range")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-link")).toBeInTheDocument();
  });

  it("resets filename after successful upload", async () => {
    mockFetch({ inserted: 1, updated: 0, skipped: 0, dateRange: { from: "2026-05-02", to: "2026-05-02" } });
    render(<UploadForm />);

    const input = screen.getByTestId("file-input");
    await userEvent.upload(input, new File(["data"], "health.csv", { type: "text/csv" }));
    await userEvent.click(screen.getByRole("button", { name: /upload csv/i }));

    await waitFor(() => screen.getByRole("status"));
    expect(screen.getByTestId("file-name")).toHaveTextContent("No file chosen");
  });

  it("calls POST /api/health/upload with multipart form data", async () => {
    mockFetch({ inserted: 1, updated: 0, skipped: 0, dateRange: { from: "2026-05-02", to: "2026-05-02" } });
    render(<UploadForm />);

    const input = screen.getByTestId("file-input");
    await userEvent.upload(input, new File(["data"], "health.csv", { type: "text/csv" }));
    await userEvent.click(screen.getByRole("button", { name: /upload csv/i }));

    await waitFor(() => screen.getByRole("status"));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/health/upload",
      expect.objectContaining({ method: "POST" })
    );
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------
describe("UploadForm error handling", () => {
  it("shows error message when server returns non-ok status", async () => {
    mockFetch({ error: "No valid rows found in CSV" }, 422);
    render(<UploadForm />);

    const input = screen.getByTestId("file-input");
    await userEvent.upload(input, new File(["bad"], "bad.csv", { type: "text/csv" }));
    await userEvent.click(screen.getByRole("button", { name: /upload csv/i }));

    await waitFor(() => screen.getByRole("alert"));
    expect(screen.getByTestId("error-message")).toHaveTextContent(
      "No valid rows found in CSV"
    );
  });

  it("shows generic error when fetch rejects (network error)", async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error("Network failure"));
    render(<UploadForm />);

    const input = screen.getByTestId("file-input");
    await userEvent.upload(input, new File(["data"], "health.csv", { type: "text/csv" }));
    await userEvent.click(screen.getByRole("button", { name: /upload csv/i }));

    await waitFor(() => screen.getByRole("alert"));
    expect(screen.getByTestId("error-message")).toHaveTextContent("Network failure");
  });
});

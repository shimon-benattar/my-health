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
  it("renders the Browse button, file name placeholder, and Upload ZIP button", () => {
    render(<UploadForm />);
    expect(screen.getByRole("button", { name: /upload zip/i })).toBeInTheDocument();
    expect(screen.getByText(/no file chosen/i)).toBeInTheDocument();
    expect(screen.getByText(/browse/i)).toBeInTheDocument();
    expect(screen.getByTestId("weight-input")).toBeInTheDocument();
  });

  it("Upload ZIP button is disabled when no file is selected", () => {
    render(<UploadForm />);
    expect(screen.getByRole("button", { name: /upload zip/i })).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// File selection
// ---------------------------------------------------------------------------
describe("UploadForm file selection", () => {
  it("shows the filename after a file is chosen", async () => {
    render(<UploadForm />);
    const input = screen.getByTestId("file-input");
    const file = new File(["zip-bytes"], "export.zip", { type: "application/zip" });
    await userEvent.upload(input, file);
    expect(screen.getByTestId("file-name")).toHaveTextContent("export.zip");
  });

  it("enables Upload ZIP button once a file is selected", async () => {
    render(<UploadForm />);
    const input = screen.getByTestId("file-input");
    const file = new File(["zip-bytes"], "export.zip", { type: "application/zip" });
    await userEvent.upload(input, file);
    expect(screen.getByRole("button", { name: /upload zip/i })).toBeEnabled();
  });
});

// ---------------------------------------------------------------------------
// Successful upload
// ---------------------------------------------------------------------------
describe("UploadForm successful upload", () => {
  it("shows ingestion summary on success", async () => {
    mockFetch({ inserted: 32, updated: 0, unchanged: 0, skipped: 0, dateRange: { from: "2026-05-02", to: "2026-06-02" }, pulled: [] });
    render(<UploadForm />);

    const input = screen.getByTestId("file-input");
    await userEvent.upload(input, new File(["data"], "health.zip", { type: "application/zip" }));
    await userEvent.click(screen.getByRole("button", { name: /upload zip/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
    expect(screen.getByTestId("total-count")).toHaveTextContent("32");
    expect(screen.getByTestId("date-range")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-link")).toBeInTheDocument();
  });

  it("resets filename after successful upload", async () => {
    mockFetch({ inserted: 1, updated: 0, unchanged: 0, skipped: 0, dateRange: { from: "2026-05-02", to: "2026-05-02" }, pulled: [] });
    render(<UploadForm />);

    const input = screen.getByTestId("file-input");
    await userEvent.upload(input, new File(["data"], "health.zip", { type: "application/zip" }));
    await userEvent.click(screen.getByRole("button", { name: /upload zip/i }));

    await waitFor(() => screen.getByRole("status"));
    expect(screen.getByTestId("file-name")).toHaveTextContent("No file chosen");
  });

  it("calls POST /api/health/upload with multipart form data", async () => {
    mockFetch({ inserted: 1, updated: 0, unchanged: 0, skipped: 0, dateRange: { from: "2026-05-02", to: "2026-05-02" }, pulled: [] });
    render(<UploadForm />);

    const input = screen.getByTestId("file-input");
    await userEvent.upload(input, new File(["data"], "health.zip", { type: "application/zip" }));
    await userEvent.click(screen.getByRole("button", { name: /upload zip/i }));

    await waitFor(() => screen.getByRole("status"));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/health/upload",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("falls back to Apple Health endpoint when export.xml is detected", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: async () => ({ error: "ZIP includes Apple export.xml but this endpoint currently supports CSV packaged in ZIP" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          requestId: "req-1",
          status: "ok",
          counts: {
            recordsProcessed: 100,
            workoutsProcessed: 4,
            routesFound: 3,
            routesMatched: 2,
            unmatchedWorkouts: 2,
            skipped: 1,
            inserted: 10,
            updated: 5,
          },
          warnings: ["Ignored export_cda.xml"],
          sampleUnmatchedWorkouts: [],
        }),
      } as Response);

    render(<UploadForm />);
    const input = screen.getByTestId("file-input");
    await userEvent.upload(input, new File(["data"], "apple.zip", { type: "application/zip" }));
    await userEvent.click(screen.getByRole("button", { name: /upload zip/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      "/api/health/upload",
      expect.objectContaining({ method: "POST" })
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "/api/health/import/apple-health",
      expect.objectContaining({ method: "POST" })
    );
    expect(screen.getByText(/apple health import complete/i)).toBeInTheDocument();
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
    await userEvent.upload(input, new File(["bad"], "bad.zip", { type: "application/zip" }));
    await userEvent.click(screen.getByRole("button", { name: /upload zip/i }));

    await waitFor(() => screen.getByRole("alert"));
    expect(screen.getByTestId("error-message")).toHaveTextContent(
      "No valid rows found in CSV"
    );
  });

  it("shows generic error when fetch rejects (network error)", async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error("Network failure"));
    render(<UploadForm />);

    const input = screen.getByTestId("file-input");
    await userEvent.upload(input, new File(["data"], "health.zip", { type: "application/zip" }));
    await userEvent.click(screen.getByRole("button", { name: /upload zip/i }));

    await waitFor(() => screen.getByRole("alert"));
    expect(screen.getByTestId("error-message")).toHaveTextContent("Network failure");
  });
});

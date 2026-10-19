import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { upload } from "@vercel/blob/client";
import JSZip from "jszip";
import UploadForm from "@/components/UploadForm";

vi.mock("@vercel/blob/client", () => ({
  upload: vi.fn(),
}));

const mockBlobUpload = vi.mocked(upload);

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
  mockBlobUpload.mockReset();
  window.sessionStorage.clear();
});

async function makeZipFile(
  files: Array<{ name: string; content: string | Uint8Array }>,
  fileName = "export.zip"
) {
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.name, file.content);
  }
  const zipBytes = await zip.generateAsync({ type: "uint8array" });
  return new File([zipBytes], fileName, { type: "application/zip" });
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
describe("UploadForm rendering", () => {
  it("renders the choose button, file placeholder, and Start Import button", () => {
    render(<UploadForm />);
    expect(screen.getByRole("button", { name: /start import/i })).toBeInTheDocument();
    expect(screen.getByText(/no file chosen/i)).toBeInTheDocument();
    expect(screen.getByText(/choose zip/i)).toBeInTheDocument();
  });

  it("shows export instructions when the tooltip button is clicked", async () => {
    render(<UploadForm />);

    await userEvent.click(
      screen.getByRole("button", { name: /how to export apple health zip on iphone/i })
    );

    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    expect(screen.getByText(/open the health app on your iphone/i)).toBeInTheDocument();
    expect(screen.getByText(/export all health data/i)).toBeInTheDocument();
    expect(screen.getByText(/save or share the zip to files, airdrop, or your computer/i)).toBeInTheDocument();
  });

  it("Start Import button is disabled when no file is selected", () => {
    render(<UploadForm />);
    expect(screen.getByRole("button", { name: /start import/i })).toBeDisabled();
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
    expect(screen.getByRole("button", { name: /start import/i })).toBeEnabled();
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
    await userEvent.click(screen.getByRole("button", { name: /start import/i }));

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
    await userEvent.click(screen.getByRole("button", { name: /start import/i }));

    await waitFor(() => screen.getByRole("status"));
    expect(screen.getByTestId("file-name")).toHaveTextContent("No file chosen");
  });

  it("calls POST /api/health/upload with multipart form data", async () => {
    mockFetch({ inserted: 1, updated: 0, unchanged: 0, skipped: 0, dateRange: { from: "2026-05-02", to: "2026-05-02" }, pulled: [] });
    render(<UploadForm />);

    const input = screen.getByTestId("file-input");
    await userEvent.upload(input, new File(["data"], "health.zip", { type: "application/zip" }));
    await userEvent.click(screen.getByRole("button", { name: /start import/i }));

    await waitFor(() => screen.getByRole("status"));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/health/upload",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("routes Apple Health ZIPs directly to the Apple Health import endpoint", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
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
    await userEvent.upload(
      input,
      await makeZipFile([{ name: "export.xml", content: "<HealthData />" }], "apple.zip")
    );
    await userEvent.click(screen.getByRole("button", { name: /start import/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      "/api/health/import/apple-health",
      expect.objectContaining({ method: "POST" })
    );
    expect(screen.getByText(/apple health import complete/i)).toBeInTheDocument();
  });

  it("clears cached dashboard payloads after a successful import", async () => {
    window.sessionStorage.setItem("dashboard-metrics:range=all", JSON.stringify({ stale: true }));
    window.sessionStorage.setItem("dashboard-metrics:range=30d", JSON.stringify({ stale: true }));
    window.sessionStorage.setItem("unrelated-key", "keep");

    mockFetch({ inserted: 1, updated: 0, unchanged: 0, skipped: 0, dateRange: { from: "2026-05-02", to: "2026-05-02" }, pulled: [] });
    render(<UploadForm />);

    const input = screen.getByTestId("file-input");
    await userEvent.upload(input, new File(["data"], "health.zip", { type: "application/zip" }));
    await userEvent.click(screen.getByRole("button", { name: /start import/i }));

    await waitFor(() => screen.getByRole("status"));
    expect(window.sessionStorage.getItem("dashboard-metrics:range=all")).toBeNull();
    expect(window.sessionStorage.getItem("dashboard-metrics:range=30d")).toBeNull();
    expect(window.sessionStorage.getItem("unrelated-key")).toBe("keep");
  });

  it("uploads large files to Blob first, then imports using blobUrl", async () => {
    mockBlobUpload.mockResolvedValue({
      url: "https://example.public.blob.vercel-storage.com/upload.zip",
      pathname: "upload.zip",
      contentType: "application/zip",
      contentDisposition: "attachment",
      downloadUrl: "https://example.public.blob.vercel-storage.com/upload.zip?download=1",
      etag: "etag-1",
    });

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status: "ok",
          missing: [],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          type: "blob.generate-client-token",
          clientToken: "client-token-1",
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          requestId: "req-blob",
          status: "ok",
          counts: {
            recordsProcessed: 1,
            workoutsProcessed: 0,
            routesFound: 0,
            routesMatched: 0,
            unmatchedWorkouts: 0,
            skipped: 0,
            inserted: 1,
            updated: 0,
          },
          warnings: [],
          sampleUnmatchedWorkouts: [],
        }),
      } as Response);

    render(<UploadForm />);
    const input = screen.getByTestId("file-input");
    const largeFile = await makeZipFile(
      [
        { name: "export.xml", content: "<HealthData />" },
        { name: "payload.bin", content: new Uint8Array(4 * 1024 * 1024 + 16) },
      ],
      "large-apple.zip"
    );

    await userEvent.upload(input, largeFile);
    await userEvent.click(screen.getByRole("button", { name: /start import/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    expect(mockBlobUpload).toHaveBeenCalledWith(
      "large-apple.zip",
      largeFile,
      expect.objectContaining({
        access: "private",
        handleUploadUrl: "/api/health/import/upload-url",
      })
    );

    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      "/api/health/checkpoint",
      { cache: "no-store" }
    );

    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "/api/health/import/upload-url",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
      })
    );

    expect(global.fetch).toHaveBeenNthCalledWith(
      3,
      "/api/health/import/apple-health",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
    );

    const fetchCall = vi.mocked(global.fetch).mock.calls[2];
    const body = JSON.parse((fetchCall[1] as RequestInit).body as string) as {
      blobUrl?: string;
    };

    expect(body.blobUrl).toBe("https://example.public.blob.vercel-storage.com/upload.zip");
  });

  it("shows token preflight error details for large file uploads", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: "ok", missing: [] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({
          error:
            "BLOB_READ_WRITE_TOKEN format looks invalid. Expected a Vercel Blob read-write token starting with 'vercel_blob_rw_'.",
        }),
      } as Response);

    render(<UploadForm />);
    const input = screen.getByTestId("file-input");
    const largeFile = await makeZipFile(
      [
        { name: "export.xml", content: "<HealthData />" },
        { name: "payload.bin", content: new Uint8Array(4 * 1024 * 1024 + 16) },
      ],
      "large-apple.zip"
    );

    await userEvent.upload(input, largeFile);
    await userEvent.click(screen.getByRole("button", { name: /start import/i }));

    await waitFor(() => screen.getByRole("alert"));
    expect(screen.getByTestId("error-message")).toHaveTextContent("Blob token preflight failed");
    expect(screen.getByTestId("error-message")).toHaveTextContent("vercel_blob_rw_");
    expect(mockBlobUpload).not.toHaveBeenCalled();
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
    await userEvent.click(screen.getByRole("button", { name: /start import/i }));

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
    await userEvent.click(screen.getByRole("button", { name: /start import/i }));

    await waitFor(() => screen.getByRole("alert"));
    expect(screen.getByTestId("error-message")).toHaveTextContent("Network failure");
  });
});

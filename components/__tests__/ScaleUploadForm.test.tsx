import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ScaleUploadForm from "@/components/ScaleUploadForm";

beforeEach(() => vi.unstubAllGlobals());

function pick(name = "scale.xlsx") {
  const input = screen.getByTestId("scale-file-input");
  return userEvent.upload(input, new File(["x"], name));
}

describe("ScaleUploadForm", () => {
  it("disables import until a file is chosen", () => {
    render(<ScaleUploadForm />);
    expect(screen.getByRole("button", { name: /import scale data/i })).toBeDisabled();
  });

  it("posts the file and links to the body tab on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ total: 4, inserted: 4, updated: 0, warnings: [] }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<ScaleUploadForm />);
    await pick();
    await userEvent.click(screen.getByRole("button", { name: /import scale data/i }));
    expect(await screen.findByRole("status")).toHaveTextContent("Imported 4 readings (4 new, 0 updated)");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/body/import");
    expect(screen.getByTestId("scale-view-link")).toHaveAttribute("href", "/dashboard?tab=body");
  });

  it("shows the server error message on failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Only .xlsx files are accepted" }) }));
    render(<ScaleUploadForm />);
    await pick("broken.xlsx");
    await userEvent.click(screen.getByRole("button", { name: /import scale data/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Only .xlsx files are accepted"));
  });

  it("shows a network error message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<ScaleUploadForm />);
    await pick();
    await userEvent.click(screen.getByRole("button", { name: /import scale data/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/import failed/i);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleUpload } from "@vercel/blob/client";

vi.mock("@vercel/blob/client", () => ({
  handleUpload: vi.fn(),
}));

const mockedHandleUpload = vi.mocked(handleUpload);

const { POST } = await import("@/app/api/health/import/upload-url/route");

describe("POST /api/health/import/upload-url", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test_token";
  });

  it("returns 500 when BLOB_READ_WRITE_TOKEN is missing", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;

    const request = new Request("http://localhost/api/health/import/upload-url", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(request);

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/BLOB_READ_WRITE_TOKEN/i);
    expect(mockedHandleUpload).not.toHaveBeenCalled();
  });

  it("returns 400 when request body is invalid JSON", async () => {
    const request = new Request("http://localhost/api/health/import/upload-url", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{bad-json",
    });

    const res = await POST(request);

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid request body");
    expect(mockedHandleUpload).not.toHaveBeenCalled();
  });

  it("passes token into handleUpload and returns JSON response", async () => {
    mockedHandleUpload.mockResolvedValueOnce({
      type: "blob.generate-client-token",
      clientToken: "client-token-123",
    });

    const request = new Request("http://localhost/api/health/import/upload-url", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "blob.generate-client-token",
        payload: {
          pathname: "large-apple.zip",
          callbackUrl: "https://example.com/api/health/import/upload-url",
          multipart: true,
        },
      }),
    });

    const res = await POST(request);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { type: string; clientToken: string };
    expect(body.type).toBe("blob.generate-client-token");
    expect(body.clientToken).toBe("client-token-123");

    expect(mockedHandleUpload).toHaveBeenCalledTimes(1);
    expect(mockedHandleUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "vercel_blob_rw_test_token",
      })
    );
  });

  it("returns 400 when handleUpload throws", async () => {
    mockedHandleUpload.mockRejectedValueOnce(new Error("Blob auth failed"));

    const request = new Request("http://localhost/api/health/import/upload-url", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "blob.generate-client-token", payload: { pathname: "x.zip" } }),
    });

    const res = await POST(request);

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Blob auth failed");
  });
});

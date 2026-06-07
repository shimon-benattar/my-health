import { describe, it, expect, beforeEach } from "vitest";

const { GET } = await import("@/app/api/health/checkpoint/route");

const REQUIRED_KEYS = [
  "BLOB_READ_WRITE_TOKEN",
  "BLOB_STORE_ID",
  "BLOB_WEBHOOK_PUBLIC_KEY",
] as const;

beforeEach(() => {
  for (const key of REQUIRED_KEYS) {
    delete process.env[key];
  }
  delete process.env.VERCEL_ENV;
  delete process.env.VERCEL_REGION;
});

describe("GET /api/health/checkpoint", () => {
  it("returns 200 when all Blob environment variables are present", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "token";
    process.env.BLOB_STORE_ID = "store_123";
    process.env.BLOB_WEBHOOK_PUBLIC_KEY = "public_key";
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_REGION = "iad1";

    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");

    const body = (await res.json()) as {
      status: string;
      missing: string[];
      checks: Record<string, boolean>;
      runtime: { vercelEnv: string; vercelRegion: string | null };
    };

    expect(body.status).toBe("ok");
    expect(body.missing).toEqual([]);
    expect(body.checks.BLOB_READ_WRITE_TOKEN).toBe(true);
    expect(body.checks.BLOB_STORE_ID).toBe(true);
    expect(body.checks.BLOB_WEBHOOK_PUBLIC_KEY).toBe(true);
    expect(body.runtime).toEqual({ vercelEnv: "production", vercelRegion: "iad1" });
  });

  it("returns 503 and missing keys when Blob environment is incomplete", async () => {
    process.env.BLOB_STORE_ID = "store_123";

    const res = await GET();
    expect(res.status).toBe(503);

    const body = (await res.json()) as {
      status: string;
      missing: string[];
      checks: Record<string, boolean>;
      runtime: { vercelEnv: string; vercelRegion: string | null };
    };

    expect(body.status).toBe("degraded");
    expect(body.missing).toEqual(["BLOB_READ_WRITE_TOKEN", "BLOB_WEBHOOK_PUBLIC_KEY"]);
    expect(body.checks.BLOB_READ_WRITE_TOKEN).toBe(false);
    expect(body.checks.BLOB_STORE_ID).toBe(true);
    expect(body.checks.BLOB_WEBHOOK_PUBLIC_KEY).toBe(false);
    expect(body.runtime).toEqual({ vercelEnv: "local", vercelRegion: null });
  });
});

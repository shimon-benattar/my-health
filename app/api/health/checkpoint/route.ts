import { NextResponse } from "next/server";

const REQUIRED_BLOB_ENV_KEYS = [
  "BLOB_READ_WRITE_TOKEN",
  "BLOB_STORE_ID",
  "BLOB_WEBHOOK_PUBLIC_KEY",
] as const;

export const dynamic = "force-dynamic";

export async function GET() {
  const checks = REQUIRED_BLOB_ENV_KEYS.reduce<Record<string, boolean>>((acc, key) => {
    acc[key] = Boolean(process.env[key]);
    return acc;
  }, {});

  const missing = REQUIRED_BLOB_ENV_KEYS.filter((key) => !process.env[key]);
  const isReady = missing.length === 0;

  const payload = {
    status: isReady ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    checks,
    missing,
    runtime: {
      vercelEnv: process.env.VERCEL_ENV ?? "local",
      vercelRegion: process.env.VERCEL_REGION ?? null,
    },
  };

  return NextResponse.json(payload, {
    status: isReady ? 200 : 503,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

type CachedPayload = unknown;

const dashboardPayloadCache = new Map<string, CachedPayload>();
const CACHE_PATH = path.join(process.cwd(), ".cache", "dashboard-metrics-cache.json");

export function getDashboardMetricsCache(key: string): CachedPayload | undefined {
  return dashboardPayloadCache.get(key);
}

export function setDashboardMetricsCache(key: string, value: CachedPayload): void {
  dashboardPayloadCache.set(key, value);
}

export async function readDashboardMetricsCacheFromDisk(key: string): Promise<CachedPayload | undefined> {
  try {
    const raw = await readFile(CACHE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Record<string, CachedPayload>;
    return parsed[key];
  } catch {
    return undefined;
  }
}

export async function writeDashboardMetricsCacheToDisk(key: string, value: CachedPayload): Promise<void> {
  let parsed: Record<string, CachedPayload> = {};

  try {
    const raw = await readFile(CACHE_PATH, "utf8");
    parsed = JSON.parse(raw) as Record<string, CachedPayload>;
  } catch {
    parsed = {};
  }

  parsed[key] = value;
  await mkdir(path.dirname(CACHE_PATH), { recursive: true });
  await writeFile(CACHE_PATH, JSON.stringify(parsed), "utf8");
}

export async function clearDashboardMetricsCache(): Promise<void> {
  dashboardPayloadCache.clear();
  await rm(CACHE_PATH, { force: true }).catch(() => undefined);
}

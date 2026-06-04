import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import HealthEntry from "@/lib/models/HealthEntry";
import UserProfile from "@/lib/models/UserProfile";
import { calcReadinessFromInput } from "@/lib/readiness";
import type { HealthEntryDoc } from "@/types/health";

export const dynamic = "force-dynamic";

type RangeParam = "7d" | "30d" | "90d" | "all";

interface SportAggregate {
  sessions: number;
  totalCalories: number;
  totalSteps: number;
  peakHeartRateMax: number | null;
}

function getStartDate(range: RangeParam): Date | null {
  const now = new Date();

  if (range === "all") {
    return null;
  }

  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);
  return start;
}

function parseRange(raw: string | null): RangeParam {
  if (raw === "7d" || raw === "30d" || raw === "90d" || raw === "all") {
    return raw;
  }
  return "30d";
}

function toDateSafe(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function buildReadinessTrend(entries: HealthEntryDoc[]): number[] {
  const sortedAsc = [...entries].sort((a, b) => toDateSafe(a.date).getTime() - toDateSafe(b.date).getTime());

  return sortedAsc.map((entry, idx) => {
    const previous = idx > 0 ? sortedAsc[idx - 1] : null;
    return calcReadinessFromInput({
      currentHrvMax: entry.hrv?.max ?? null,
      yesterdaySleepMinutes: previous?.sleep ?? null,
    });
  });
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const range = parseRange(params.get("range"));
    const sportType = params.get("sportType")?.trim() || null;
    const startDate = getStartDate(range);

    await connectDB();

    const filter: Record<string, unknown> = {};
    if (startDate) {
      filter.date = { $gte: startDate };
    }
    if (sportType) {
      filter.sportType = sportType;
    }

    const entries = (await HealthEntry.find(filter).sort({ date: -1 }).lean()) as unknown as HealthEntryDoc[];

    const sportSummary = entries.reduce<Record<string, SportAggregate>>((acc, entry) => {
      const sport = entry.sportType?.trim().toLowerCase();
      if (!sport) {
        return acc;
      }

      const existing = acc[sport] ?? {
        sessions: 0,
        totalCalories: 0,
        totalSteps: 0,
        peakHeartRateMax: null,
      };

      const peak = entry.heartRate?.max ?? null;
      const nextPeak =
        peak === null
          ? existing.peakHeartRateMax
          : existing.peakHeartRateMax === null
            ? peak
            : Math.max(existing.peakHeartRateMax, peak);

      acc[sport] = {
        sessions: existing.sessions + 1,
        totalCalories: existing.totalCalories + (entry.activeCalories ?? 0),
        totalSteps: existing.totalSteps + (entry.steps ?? 0),
        peakHeartRateMax: nextPeak,
      };

      return acc;
    }, {});

    const latest = entries[0] ?? null;
    const latestDate = latest ? toDateSafe(latest.date).getTime() : null;
    const previous =
      latestDate === null
        ? null
        : entries.find((entry) => toDateSafe(entry.date).getTime() < latestDate) ?? null;

    const readiness = calcReadinessFromInput({
      currentHrvMax: latest?.hrv?.max ?? null,
      yesterdaySleepMinutes: previous?.sleep ?? null,
    });

    const readinessTrend = buildReadinessTrend(entries);
    const profile = await UserProfile.findOneAndUpdate(
      { key: "primary" },
      {
        $setOnInsert: {
          key: "primary",
          name: "Shimon",
          birthdate: "21/04/1979",
          weightKg: 85,
          heightCm: 177,
        },
      },
      { upsert: true, returnDocument: "after", lean: true }
    );

    return NextResponse.json({ entries, readiness, readinessTrend, profile, sportSummary }, { status: 200 });
  } catch (err) {
    console.error("[dashboard/metrics] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

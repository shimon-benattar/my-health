import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import HealthEntry from "@/lib/models/HealthEntry";

export const dynamic = "force-dynamic";

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getIsraelWeekday(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "Asia/Jerusalem",
  }).format(date);
}

function getIsraelOffsetHours(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    timeZoneName: "shortOffset",
  }).formatToParts(date);
  const offsetLabel = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+2";
  const match = offsetLabel.match(/GMT([+-]\d{1,2})/i);
  if (!match) return 2;
  return Number.parseInt(match[1], 10);
}

function emptySleepDetail() {
  return {
    remMinutes: 0,
    coreMinutes: 0,
    deepMinutes: 0,
    awakeMinutes: 0,
    asleepMinutes: 0,
    inBedMinutes: 0,
  };
}

export async function POST() {
  try {
    await connectDB();

    const entries = await HealthEntry.find({ sourceType: "apple-health" }).sort({ date: 1 }).lean();
    if (entries.length === 0) {
      return NextResponse.json({ status: "ok", updated: 0, inserted: 0 });
    }

    const byKey = new Map(entries.map((e) => [toDateKey(new Date(e.date)), e]));
    const start = new Date(entries[0].date as Date);
    const end = new Date(entries[entries.length - 1].date as Date);

    let updated = 0;
    let inserted = 0;

    for (let cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      const key = toDateKey(cursor);
      const weekday = getIsraelWeekday(cursor);
      if (weekday !== "Fri" && weekday !== "Sat") continue;

      const sleepAdd = weekday === "Fri" ? (getIsraelOffsetHours(cursor) >= 3 ? 9 * 60 : 8 * 60) : 120;
      const stepsAdd = weekday === "Fri" ? 900 : 2700;

      const existing = byKey.get(key);
      if (!existing) {
        await HealthEntry.create({
          date: new Date(`${key}T00:00:00.000Z`),
          sourceType: "apple-health",
          sourceFile: "synthetic-shabbat-augmentation",
          importedAt: new Date(),
          activeCalories: null,
          cardioFitness: null,
          heartRate: null,
          hrv: null,
          restingHeartRate: null,
          sleep: sleepAdd,
          steps: stepsAdd,
          sleepDetail: {
            ...emptySleepDetail(),
            asleepMinutes: sleepAdd,
          },
          sleepHeartRate: {
            avg: null,
            min: null,
            max: null,
            lowAlerts: 0,
          },
          syntheticAdjustments: {
            shabbatSleepAddedMinutes: sleepAdd,
            shabbatStepsAdded: stepsAdd,
          },
        });
        inserted++;
        continue;
      }

      const alreadyApplied =
        (existing.syntheticAdjustments as { shabbatSleepAddedMinutes?: number; shabbatStepsAdded?: number } | null | undefined)
          ?.shabbatSleepAddedMinutes;
      if ((alreadyApplied ?? 0) > 0) {
        continue;
      }

      await HealthEntry.updateOne(
        { _id: existing._id },
        {
          $set: {
            sleep: (existing.sleep ?? 0) + sleepAdd,
            steps: (existing.steps ?? 0) + stepsAdd,
            sleepDetail: {
              ...emptySleepDetail(),
              ...(existing.sleepDetail as Record<string, number> | null | undefined),
              asleepMinutes: ((existing.sleepDetail as { asleepMinutes?: number } | null | undefined)?.asleepMinutes ?? 0) + sleepAdd,
            },
            syntheticAdjustments: {
              shabbatSleepAddedMinutes: sleepAdd,
              shabbatStepsAdded: stepsAdd,
            },
          },
        }
      );
      updated++;
    }

    return NextResponse.json({ status: "ok", updated, inserted });
  } catch (err) {
    console.error("[health/augment/shabbat] error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

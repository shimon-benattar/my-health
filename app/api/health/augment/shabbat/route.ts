import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import HealthEntry from "@/lib/models/HealthEntry";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const mode = request.nextUrl.searchParams.get("mode") ?? "status";
    if (mode !== "cleanup") {
      const syntheticRows = await HealthEntry.countDocuments({
        sourceType: "apple-health",
        sourceFile: "synthetic-shabbat-augmentation",
      });
      const adjustedRows = await HealthEntry.countDocuments({
        sourceType: "apple-health",
        "syntheticAdjustments.shabbatSleepAddedMinutes": { $gt: 0 },
      });

      return NextResponse.json({
        status: "disabled",
        message: "Synthetic shabbat augmentation is disabled. Use ?mode=cleanup to remove historical synthetic adjustments.",
        syntheticRows,
        adjustedRows,
      });
    }

    const adjustedDocs = await HealthEntry.find({
      sourceType: "apple-health",
      "syntheticAdjustments.shabbatSleepAddedMinutes": { $gt: 0 },
    })
      .select({ _id: 1, sleep: 1, steps: 1, sleepDetail: 1, syntheticAdjustments: 1 })
      .lean();

    let updated = 0;

    for (const doc of adjustedDocs) {
      const sleepAdjust = doc.syntheticAdjustments?.shabbatSleepAddedMinutes ?? 0;
      const stepAdjust = doc.syntheticAdjustments?.shabbatStepsAdded ?? 0;

      const nextSleep = doc.sleep === null ? null : Math.max(0, (doc.sleep ?? 0) - sleepAdjust);
      const nextSteps = doc.steps === null ? null : Math.max(0, (doc.steps ?? 0) - stepAdjust);
      const nextAsleep = Math.max(0, (doc.sleepDetail?.asleepMinutes ?? 0) - sleepAdjust);

      await HealthEntry.updateOne(
        { _id: doc._id },
        {
          $set: {
            sleep: nextSleep,
            steps: nextSteps,
            "sleepDetail.asleepMinutes": nextAsleep,
            syntheticAdjustments: {
              shabbatSleepAddedMinutes: 0,
              shabbatStepsAdded: 0,
            },
          },
        }
      );
      updated++;
    }

    const deleteResult = await HealthEntry.deleteMany({
      sourceType: "apple-health",
      sourceFile: "synthetic-shabbat-augmentation",
    });

    return NextResponse.json({
      status: "ok",
      updated,
      deletedSyntheticRows: deleteResult.deletedCount ?? 0,
    });
  } catch (err) {
    console.error("[health/augment/shabbat] cleanup error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

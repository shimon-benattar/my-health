import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { databaseUnavailablePayload, isDatabaseUnavailableError } from "@/lib/apiErrors";
import { connectDB } from "@/lib/db";
import BodyMeasurement from "@/lib/models/BodyMeasurement";
import { isEveningReading } from "@/lib/bodyCompositionInsights";
import { BODY_METRIC_KEYS, type BodyMeasurement as BodyMeasurementDoc } from "@/types/body";

export const dynamic = "force-dynamic";

const RANGE_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };

export async function GET(request: NextRequest) {
  const requestId = randomUUID();
  const range = request.nextUrl.searchParams.get("range") ?? "all";

  if (range !== "all" && !(range in RANGE_DAYS)) {
    return NextResponse.json(
      { error: "Invalid range. Use all, 90d, 30d or 7d.", code: "BODY_INVALID_RANGE", requestId },
      { status: 400 }
    );
  }

  try {
    await connectDB();

    const filter: Record<string, unknown> = {};
    if (range !== "all") {
      filter.measuredAt = { $gte: new Date(Date.now() - RANGE_DAYS[range] * 86400000) };
    }

    const docs = await BodyMeasurement.find(filter).sort({ measuredAt: 1 }).lean();
    const measurements: BodyMeasurementDoc[] = docs.map((doc) => {
      const row = { measuredAt: new Date(doc.measuredAt).toISOString(), sourceFile: doc.sourceFile ?? null } as BodyMeasurementDoc;
      for (const key of BODY_METRIC_KEYS) row[key] = (doc as unknown as Record<string, number | null>)[key] ?? null;
      row.isEvening = isEveningReading(row.measuredAt);
      return row;
    });

    const lastDoc = docs[docs.length - 1] as { scaleSex?: "male" | "female" | null; scaleHeightCm?: number | null } | undefined;
    const scaleProfile = { sex: lastDoc?.scaleSex ?? null, heightCm: lastDoc?.scaleHeightCm ?? null };

    return NextResponse.json({ measurements, scaleProfile }, { status: 200 });
  } catch (err) {
    console.error(`[body-measurements][${requestId}] failed:`, err instanceof Error ? err.message : "unknown error");
    if (isDatabaseUnavailableError(err)) {
      return NextResponse.json(databaseUnavailablePayload(requestId), { status: 503 });
    }
    return NextResponse.json({ error: "Internal server error", code: "BODY_FETCH_FAILED", requestId }, { status: 500 });
  }
}

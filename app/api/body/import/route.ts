import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { databaseUnavailablePayload, isDatabaseUnavailableError } from "@/lib/apiErrors";
import { connectDB } from "@/lib/db";
import BodyMeasurement from "@/lib/models/BodyMeasurement";
import { parseScaleXlsx, ScaleParseError } from "@/lib/parsers/scaleXlsxParser";

export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 4 * 1024 * 1024;

function errorJson(status: number, error: string, code: string, requestId: string) {
  return NextResponse.json({ error, code, requestId }, { status });
}

/**
 * Imports a smart-scale .xlsx export. Rows are merged by measurement time, so
 * re-importing the same or an overlapping file is idempotent and never deletes history.
 */
export async function POST(request: NextRequest) {
  const requestId = randomUUID();

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return errorJson(400, "No file provided", "BODY_NO_FILE", requestId);
    }
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return errorJson(400, "Only .xlsx files are accepted", "BODY_INVALID_TYPE", requestId);
    }
    if (file.size === 0) {
      return errorJson(400, "File is empty", "BODY_EMPTY_FILE", requestId);
    }
    if (file.size > MAX_FILE_BYTES) {
      return errorJson(413, "File is too large (max 4 MB)", "BODY_FILE_TOO_LARGE", requestId);
    }

    let parsed;
    try {
      parsed = await parseScaleXlsx(await file.arrayBuffer());
    } catch (err) {
      if (err instanceof ScaleParseError) {
        return errorJson(422, err.message, `BODY_${err.code.toUpperCase()}`, requestId);
      }
      throw err;
    }

    await connectDB();

    const importedAt = new Date();
    const result = await BodyMeasurement.bulkWrite(
      parsed.measurements.map(({ measuredAt, ...metrics }) => ({
        updateOne: {
          filter: { measuredAt },
          update: { $set: { ...metrics, sourceFile: file.name, scaleSex: parsed.meta.sex, scaleHeightCm: parsed.meta.heightCm, importedAt } },
          upsert: true,
        },
      }))
    );

    return NextResponse.json(
      {
        requestId,
        total: parsed.measurements.length,
        inserted: result.upsertedCount ?? 0,
        updated: result.modifiedCount ?? 0,
        from: parsed.measurements[0].measuredAt.toISOString(),
        to: parsed.measurements[parsed.measurements.length - 1].measuredAt.toISOString(),
        meta: parsed.meta,
        warnings: parsed.warnings,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error(`[body-import][${requestId}] failed:`, err instanceof Error ? err.message : "unknown error");
    if (isDatabaseUnavailableError(err)) {
      return NextResponse.json(databaseUnavailablePayload(requestId), { status: 503 });
    }
    return errorJson(500, "Internal server error", "BODY_IMPORT_FAILED", requestId);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import HealthEntry from "@/lib/models/HealthEntry";
import { parseCSV } from "@/lib/parsers/csvParser";
import type { IngestionResult } from "@/types/health";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const csvText = await file.text();
    const { entries, skipped } = parseCSV(csvText);

    if (entries.length === 0) {
      return NextResponse.json({ error: "No valid rows found in CSV" }, { status: 422 });
    }

    await connectDB();

    let inserted = 0;
    let updated = 0;

    for (const entry of entries) {
      const result = await HealthEntry.findOneAndUpdate(
        { date: entry.date },
        { $set: entry },
        { upsert: true, new: false, lean: true }
      );

      if (result === null) {
        inserted++;
      } else {
        updated++;
      }
    }

    const timestamps = entries.map((e) => e.date.getTime()).sort((a, b) => a - b);
    const dateRange: IngestionResult["dateRange"] = {
      from: new Date(timestamps[0]).toISOString().slice(0, 10),
      to: new Date(timestamps[timestamps.length - 1]).toISOString().slice(0, 10),
    };

    console.log(`[upload] inserted=${inserted} updated=${updated} skipped=${skipped} range=${dateRange.from}→${dateRange.to}`);
    return NextResponse.json({ inserted, updated, skipped, dateRange } satisfies IngestionResult, { status: 200 });
  } catch (err) {
    console.error("[upload] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

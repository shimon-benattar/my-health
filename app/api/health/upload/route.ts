import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/db";
import HealthEntry from "@/lib/models/HealthEntry";
import { parseCSV } from "@/lib/parsers/csvParser";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const csvText = await file.text();
    const entries = parseCSV(csvText);

    if (entries.length === 0) {
      return NextResponse.json({ error: "No valid rows found in CSV" }, { status: 422 });
    }

    await clientPromise;

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const entry of entries) {
      const result = await HealthEntry.findOneAndUpdate(
        { date: entry.date },
        { $set: entry },
        { upsert: true, new: false, lean: true }
      );

      if (result === null) {
        inserted++;
      } else {
        // Document existed — check if any field actually changed
        const changed =
          result.activeCalories !== entry.activeCalories ||
          result.cardioFitness !== entry.cardioFitness ||
          result.restingHeartRate !== entry.restingHeartRate ||
          result.sleep !== entry.sleep ||
          result.steps !== entry.steps;

        if (changed) {
          updated++;
        } else {
          skipped++;
        }
      }
    }

    return NextResponse.json({ inserted, updated, skipped }, { status: 200 });
  } catch (err) {
    console.error("[upload] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

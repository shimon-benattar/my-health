import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import { connectDB } from "@/lib/db";
import HealthEntry from "@/lib/models/HealthEntry";
import HealthEntryBackup from "@/lib/models/HealthEntryBackup";
import ImportLog from "@/lib/models/ImportLog";
import UserProfile from "@/lib/models/UserProfile";
import { parseCSV } from "@/lib/parsers/csvParser";
import type { HealthEntryInput, ImportedDataPoint, IngestionResult } from "@/types/health";

function comparableEntry(entry: HealthEntryInput): Record<string, unknown> {
  return {
    date: entry.date.toISOString(),
    sportType: entry.sportType ?? null,
    workoutType: entry.workoutType ?? null,
    workoutDurationMinutes: entry.workoutDurationMinutes ?? null,
    activeCalories: entry.activeCalories ?? null,
    cardioFitness: entry.cardioFitness ?? null,
    heartRate: entry.heartRate ?? null,
    hrv: entry.hrv ?? null,
    restingHeartRate: entry.restingHeartRate ?? null,
    sleep: entry.sleep ?? null,
    steps: entry.steps ?? null,
  };
}

function comparableExisting(doc: Record<string, unknown>): Record<string, unknown> {
  const date = doc.date instanceof Date ? doc.date : new Date(String(doc.date));
  return {
    date: date.toISOString(),
    sportType: (doc.sportType as string | null | undefined) ?? null,
    workoutType: (doc.workoutType as string | null | undefined) ?? null,
    workoutDurationMinutes: (doc.workoutDurationMinutes as number | null | undefined) ?? null,
    activeCalories: (doc.activeCalories as number | null | undefined) ?? null,
    cardioFitness: (doc.cardioFitness as number | null | undefined) ?? null,
    heartRate: (doc.heartRate as Record<string, unknown> | null | undefined) ?? null,
    hrv: (doc.hrv as Record<string, unknown> | null | undefined) ?? null,
    restingHeartRate: (doc.restingHeartRate as number | null | undefined) ?? null,
    sleep: (doc.sleep as number | null | undefined) ?? null,
    steps: (doc.steps as number | null | undefined) ?? null,
  };
}

function isDelta(existingDoc: Record<string, unknown>, incoming: HealthEntryInput): boolean {
  return JSON.stringify(comparableExisting(existingDoc)) !== JSON.stringify(comparableEntry(incoming));
}

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  const logSteps: Array<{ at: Date; level: "info" | "warn" | "error"; message: string; meta?: Record<string, unknown> }> = [];

  function addLog(level: "info" | "warn" | "error", message: string, meta?: Record<string, unknown>) {
    const at = new Date();
    logSteps.push({ at, level, message, meta });
    const prefix = `[upload][${requestId}]`;
    const details = meta ? ` ${JSON.stringify(meta)}` : "";
    if (level === "error") {
      console.error(`${prefix} ${message}${details}`);
      return;
    }
    if (level === "warn") {
      console.warn(`${prefix} ${message}${details}`);
      return;
    }
    console.log(`${prefix} ${message}${details}`);
  }

  let filename = "unknown";
  const sourceType: "csv" | "apple-health" = "csv";

  try {
    await connectDB();
    const formData = await request.formData();
    const file = formData.get("file");
    const weightKgRaw = formData.get("weightKg");

    if (!file || !(file instanceof File)) {
      addLog("warn", "No file provided");
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    filename = file.name;

    await ImportLog.create({
      requestId,
      filename,
      sourceType,
      status: "processing",
      startedAt: new Date(),
      steps: [],
    });
    addLog("info", "Import started", { filename });

    if (!file.name.toLowerCase().endsWith(".zip")) {
      addLog("warn", "Rejected non-zip upload", { filename: file.name });
      await ImportLog.updateOne(
        { requestId },
        { $set: { status: "error", finishedAt: new Date(), error: "Only ZIP files are accepted" }, $push: { steps: { $each: logSteps } } }
      );
      return NextResponse.json({ error: "Only ZIP files are accepted" }, { status: 400 });
    }

    const zipBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(zipBuffer);
    const csvEntries = Object.values(zip.files).filter((item) => !item.dir && item.name.toLowerCase().endsWith(".csv"));
    const hasAppleXml = Object.values(zip.files).some((item) => !item.dir && item.name.toLowerCase().endsWith("export.xml"));

    if (csvEntries.length === 0) {
      const message = hasAppleXml
        ? "ZIP includes Apple export.xml but this endpoint currently supports CSV packaged in ZIP"
        : "ZIP does not contain any CSV file";
      addLog("warn", message, { zipEntries: Object.keys(zip.files).length });
      await ImportLog.updateOne(
        { requestId },
        { $set: { status: "error", finishedAt: new Date(), error: message }, $push: { steps: { $each: logSteps } } }
      );
      return NextResponse.json({ error: message }, { status: 422 });
    }

    const csvFile = csvEntries[0];
    addLog("info", "CSV file discovered in zip", { csvPath: csvFile.name, candidates: csvEntries.length });
    const csvText = await csvFile.async("string");
    const { entries, skipped } = parseCSV(csvText);
    addLog("info", "CSV parsed", { entries: entries.length, skipped });

    if (entries.length === 0) {
      addLog("warn", "No valid rows found in CSV inside zip");
      await ImportLog.updateOne(
        { requestId },
        { $set: { status: "error", finishedAt: new Date(), error: "No valid rows found in CSV" }, $push: { steps: { $each: logSteps } } }
      );
      return NextResponse.json({ error: "No valid rows found in CSV" }, { status: 422 });
    }

    const pulledAt = new Date();

    if (typeof weightKgRaw === "string" && weightKgRaw.trim() !== "") {
      const weightKg = Number(weightKgRaw);
      if (Number.isFinite(weightKg) && weightKg > 0 && weightKg < 400) {
        await UserProfile.findOneAndUpdate(
          { key: "primary" },
          {
            $set: { weightKg },
            $setOnInsert: {
              key: "primary",
              name: "Shimon",
              birthdate: "21/04/1979",
              heightCm: 177,
            },
          },
          { upsert: true, returnDocument: "after", lean: true }
        );
      }
    }

    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    const pulled: ImportedDataPoint[] = [];

    for (const entry of entries) {
      const existing = (await HealthEntry.findOne({ date: entry.date }).lean()) as Record<string, unknown> | null;
      const nextEntry = {
        ...entry,
        sourceType: "csv" as const,
        sourceFile: file.name,
        importedAt: pulledAt,
      };

      if (existing === null) {
        await HealthEntry.create(nextEntry);
        inserted++;
      } else {
        if (!isDelta(existing, entry)) {
          unchanged++;
          continue;
        }

        const existingId = String(existing._id ?? "");
        const existingDate = existing.date instanceof Date ? existing.date : new Date(String(existing.date));
        await HealthEntryBackup.create({
          originalId: existingId,
          date: existingDate,
          backupAt: pulledAt,
          reason: "delta-import-replacement",
          payload: existing,
        });

        await HealthEntry.updateOne({ date: entry.date }, { $set: nextEntry });
        updated++;
      }

      pulled.push({
        date: entry.date.toISOString(),
        action: existing ? "updated" : "inserted",
        pulledAt: pulledAt.toISOString(),
        sourceType: "csv",
        sourceFile: file.name,
      });
    }

    const timestamps = pulled.map((item) => new Date(item.date).getTime()).sort((a, b) => a - b);
    const dateRange: IngestionResult["dateRange"] =
      timestamps.length > 0
        ? {
            from: new Date(timestamps[0]).toISOString().slice(0, 10),
            to: new Date(timestamps[timestamps.length - 1]).toISOString().slice(0, 10),
          }
        : null;

    const rangeText = dateRange ? `${dateRange.from}→${dateRange.to}` : "none";
    addLog("info", "Import completed", {
      inserted,
      updated,
      unchanged,
      skipped,
      pulled: pulled.length,
      range: rangeText,
    });

    await ImportLog.updateOne(
      { requestId },
      {
        $set: {
          status: "success",
          finishedAt: new Date(),
          filename,
          sourceType,
          result: { inserted, updated, unchanged, skipped, pulled: pulled.length },
        },
        $push: { steps: { $each: logSteps } },
      }
    );

    return NextResponse.json({ requestId, inserted, updated, unchanged, skipped, dateRange, pulled } satisfies IngestionResult, {
      status: 200,
    });
  } catch (err) {
    addLog("error", "Import failed", { message: err instanceof Error ? err.message : "Unknown error" });
    await ImportLog.updateOne(
      { requestId },
      {
        $set: {
          status: "error",
          finishedAt: new Date(),
          filename,
          sourceType,
          error: err instanceof Error ? err.message : "Internal server error",
        },
        $push: { steps: { $each: logSteps } },
      },
      { upsert: true }
    ).catch((updateErr) => {
      console.error(`[upload][${requestId}] failed to persist error log`, updateErr);
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

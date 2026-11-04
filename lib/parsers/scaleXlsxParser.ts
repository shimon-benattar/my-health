import JSZip from "jszip";
import sax from "sax";
import type { BodyMetricKey, BodyMetrics, ParsedScaleFile, ScaleFileMeta } from "@/types/body";
import { BODY_METRIC_KEYS } from "@/types/body";

export class ScaleParseError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "ScaleParseError";
  }
}

/** Normalised header text (lowercase, alphanumerics only) -> metric key. */
const HEADER_ALIASES: Record<string, BodyMetricKey> = {
  weightkg: "weightKg",
  bmi: "bmi",
  fat: "fatPct",
  bodyfatweightkg: "fatKg",
  skeletalmusclemasspercentage: "skeletalMusclePct",
  skeletalmuscleweightkg: "skeletalMuscleKg",
  musclepercent: "musclePct",
  muscleweightkg: "muscleKg",
  vfat: "visceralFat",
  water: "waterPct",
  weightofwaterkg: "waterKg",
  metabolismkcalday: "bmr",
  obesitydegree: "obesityDegreePct",
  bonemasskg: "boneMassKg",
  protein: "proteinPct",
  weightwithoutfatkg: "leanMassKg",
  bodyage: "bodyAge",
};

const MAX_ZIP_ENTRY_BYTES = 10 * 1024 * 1024;

type RawRow = Record<number, string>;

function normalizeHeader(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function columnIndex(ref: string): number {
  const letters = ref.replace(/[^A-Z]/gi, "").toUpperCase();
  let index = 0;
  for (const ch of letters) index = index * 26 + (ch.charCodeAt(0) - 64);
  return index - 1;
}

function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  const parser = sax.parser(true);
  let inSi = false;
  let inT = false;
  let current = "";
  parser.onopentag = (node) => {
    if (node.name === "si") {
      inSi = true;
      current = "";
    } else if (node.name === "t" && inSi) {
      inT = true;
    }
  };
  parser.ontext = (text) => {
    if (inT) current += text;
  };
  parser.onclosetag = (name) => {
    if (name === "t") inT = false;
    if (name === "si") {
      inSi = false;
      strings.push(current);
    }
  };
  parser.write(xml).close();
  return strings;
}

function parseSheetRows(xml: string, shared: string[]): RawRow[] {
  const rows: RawRow[] = [];
  const parser = sax.parser(true);
  let row: RawRow | null = null;
  let cellCol = -1;
  let cellType = "";
  let capture: "v" | "t" | null = null;
  let buffer = "";
  parser.onopentag = (node) => {
    if (node.name === "row") {
      row = {};
    } else if (node.name === "c") {
      cellCol = columnIndex(String(node.attributes.r ?? ""));
      cellType = String(node.attributes.t ?? "");
      buffer = "";
    } else if (node.name === "v" || (node.name === "t" && cellType === "inlineStr")) {
      capture = node.name === "v" ? "v" : "t";
    }
  };
  parser.ontext = (text) => {
    if (capture) buffer += text;
  };
  parser.onclosetag = (name) => {
    if (name === "v" || name === "t") {
      capture = null;
    } else if (name === "c" && row && cellCol >= 0) {
      const raw = buffer.trim();
      if (raw !== "") {
        row[cellCol] = cellType === "s" ? (shared[Number(raw)] ?? "") : raw;
      }
      buffer = "";
    } else if (name === "row" && row) {
      rows.push(row);
      row = null;
    }
  };
  parser.write(xml).close();
  return rows;
}

function toNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

/** Wall-clock date/time -> Date.UTC with the same digits (the app displays dates in UTC). */
function parseMeasuredAt(dateText: string | undefined, timeText: string | undefined): Date | null {
  if (!dateText) return null;
  let year: number;
  let month: number;
  let day: number;
  const us = dateText.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) {
    month = Number(us[1]);
    day = Number(us[2]);
    year = Number(us[3]);
  } else if (/^\d+(\.\d+)?$/.test(dateText.trim())) {
    // Excel serial date
    const serial = Number(dateText);
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
    year = d.getUTCFullYear();
    month = d.getUTCMonth() + 1;
    day = d.getUTCDate();
  } else {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  let hours = 0;
  let minutes = 0;
  const timeMatch = timeText?.trim().match(/^(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    hours = Number(timeMatch[1]);
    minutes = Number(timeMatch[2]);
  } else if (timeText && /^0?\.\d+$/.test(timeText.trim())) {
    const totalMinutes = Math.round(Number(timeText) * 1440);
    hours = Math.floor(totalMinutes / 60) % 24;
    minutes = totalMinutes % 60;
  }
  if (hours > 23 || minutes > 59) return null;

  const result = new Date(Date.UTC(year, month - 1, day, hours, minutes));
  // Reject overflow like 02/31
  return result.getUTCMonth() === month - 1 ? result : null;
}

function parseMeta(rows: RawRow[]): ScaleFileMeta {
  const text = rows.flatMap((r) => Object.values(r)).join(" | ");
  const sexMatch = text.match(/gender[^a-z]*([a-z]+)/i);
  const ageMatch = text.match(/\bage[^0-9]*(\d{1,3})/i);
  const heightMatch = text.match(/height[^0-9]*(\d{2,3}(?:\.\d+)?)/i);
  const sexText = sexMatch?.[1]?.toLowerCase();
  return {
    sex: sexText === "male" ? "male" : sexText === "female" ? "female" : null,
    age: ageMatch ? Number(ageMatch[1]) : null,
    heightCm: heightMatch ? Number(heightMatch[1]) : null,
  };
}

function consistencyWarnings(label: string, m: BodyMetrics): string[] {
  const out: string[] = [];
  const check = (name: string, expected: number | null, actual: number | null, tolerance: number) => {
    if (expected === null || actual === null) return;
    if (Math.abs(expected - actual) > tolerance) {
      out.push(`${label}: ${name} looks inconsistent (expected ≈ ${expected.toFixed(1)}, got ${actual}).`);
    }
  };
  if (m.weightKg !== null && m.fatPct !== null) check("Body fat kg", (m.weightKg * m.fatPct) / 100, m.fatKg, 0.4);
  if (m.weightKg !== null && m.fatKg !== null) check("Weight without fat", m.weightKg - m.fatKg, m.leanMassKg, 0.4);
  if (m.weightKg !== null && m.waterPct !== null) check("Water kg", (m.weightKg * m.waterPct) / 100, m.waterKg, 0.4);
  return out;
}

export async function parseScaleXlsx(input: ArrayBuffer | Uint8Array | Buffer): Promise<ParsedScaleFile> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(input);
  } catch {
    throw new ScaleParseError("File is not a valid .xlsx workbook.", "invalid_xlsx");
  }

  const sheetName =
    (zip.file("xl/worksheets/sheet1.xml") && "xl/worksheets/sheet1.xml") ??
    Object.keys(zip.files).find((n) => /^xl\/worksheets\/[^/]+\.xml$/.test(n));
  if (!sheetName) throw new ScaleParseError("Workbook has no worksheet.", "invalid_xlsx");

  const sheetXml = await zip.file(sheetName)!.async("string");
  const sharedFile = zip.file("xl/sharedStrings.xml");
  const sharedXml = sharedFile ? await sharedFile.async("string") : "";
  if (sheetXml.length > MAX_ZIP_ENTRY_BYTES || sharedXml.length > MAX_ZIP_ENTRY_BYTES) {
    throw new ScaleParseError("Workbook content is too large.", "file_too_large");
  }

  let rows: RawRow[];
  try {
    rows = parseSheetRows(sheetXml, sharedXml ? parseSharedStrings(sharedXml) : []);
  } catch {
    throw new ScaleParseError("Worksheet XML could not be read.", "invalid_xlsx");
  }

  const headerIdx = rows.findIndex((r) => {
    const norm = Object.values(r).map(normalizeHeader);
    return norm.includes("date") && norm.includes("weightkg");
  });
  if (headerIdx === -1) {
    throw new ScaleParseError("Could not find a header row with Date and Weight(Kg) columns.", "missing_header");
  }

  const header = rows[headerIdx];
  const dateCol = Object.entries(header).find(([, v]) => normalizeHeader(v) === "date")?.[0];
  const timeCol = Object.entries(header).find(([, v]) => normalizeHeader(v) === "time")?.[0];
  const metricCols: Array<[number, BodyMetricKey]> = [];
  for (const [col, text] of Object.entries(header)) {
    const key = HEADER_ALIASES[normalizeHeader(text)];
    if (key) metricCols.push([Number(col), key]);
  }

  const warnings: string[] = [];
  const found = new Set(metricCols.map(([, k]) => k));
  const missing = BODY_METRIC_KEYS.filter((k) => !found.has(k));
  if (missing.length > 0) warnings.push(`Columns not found in file: ${missing.join(", ")}.`);

  const measurements: ParsedScaleFile["measurements"] = [];
  for (const row of rows.slice(headerIdx + 1)) {
    const dateText = dateCol !== undefined ? row[Number(dateCol)] : undefined;
    if (!dateText) continue;
    const timeText = timeCol !== undefined ? row[Number(timeCol)] : undefined;
    const measuredAt = parseMeasuredAt(dateText, timeText);
    if (!measuredAt) {
      warnings.push(`Skipped row with unreadable date "${dateText}".`);
      continue;
    }
    const metrics = Object.fromEntries(BODY_METRIC_KEYS.map((k) => [k, null])) as BodyMetrics;
    for (const [col, key] of metricCols) metrics[key] = toNumber(row[col]);
    if (metrics.weightKg === null) {
      warnings.push(`Skipped ${measuredAt.toISOString().slice(0, 16)} because it has no weight.`);
      continue;
    }
    warnings.push(...consistencyWarnings(measuredAt.toISOString().slice(0, 16).replace("T", " "), metrics));
    measurements.push({ measuredAt, ...metrics });
  }

  if (measurements.length === 0) {
    throw new ScaleParseError("No measurement rows found in file.", "no_measurements");
  }

  measurements.sort((a, b) => a.measuredAt.getTime() - b.measuredAt.getTime());
  return { meta: parseMeta(rows.slice(0, headerIdx)), measurements, warnings };
}

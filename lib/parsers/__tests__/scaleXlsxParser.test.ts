import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { parseScaleXlsx, ScaleParseError } from "@/lib/parsers/scaleXlsxParser";

const SAMPLE = path.join(process.cwd(), "data", "weight_shimonb_1793831127.xlsx");

async function buildXlsx(rows: string[][], shared: string[] = []): Promise<Uint8Array> {
  // Build a minimal workbook using inline strings, so tests need no sample file.
  const cell = (v: string, c: number, r: number) => {
    const ref = `${String.fromCharCode(65 + c)}${r}`;
    return `<c r="${ref}" t="inlineStr"><is><t>${v}</t></is></c>`;
  };
  const xml = `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows
    .map((row, r) => `<row r="${r + 1}">${row.map((v, c) => cell(v, c, r + 1)).join("")}</row>`)
    .join("")}</sheetData></worksheet>`;
  const zip = new JSZip();
  zip.file("xl/worksheets/sheet1.xml", xml);
  if (shared.length) zip.file("xl/sharedStrings.xml", `<sst>${shared.map((s) => `<si><t>${s}</t></si>`).join("")}</sst>`);
  return zip.generateAsync({ type: "uint8array" });
}

describe("parseScaleXlsx (real sample file)", () => {
  it("reads 4 readings, metadata and every metric", async () => {
    const result = await parseScaleXlsx(readFileSync(SAMPLE));
    expect(result.measurements).toHaveLength(4);
    expect(result.meta).toEqual({ sex: "male", age: 47, heightCm: 177 });

    const latest = result.measurements[result.measurements.length - 1];
    expect(latest.measuredAt.toISOString()).toBe("2026-11-01T07:13:00.000Z");
    expect(latest.weightKg).toBe(85.1);
    expect(latest.fatPct).toBe(25.7);
    expect(latest.visceralFat).toBe(15);
    expect(latest.bmr).toBe(1757);
    expect(latest.leanMassKg).toBe(63.2);
    expect(latest.bodyAge).toBe(45);
    expect(result.warnings).toEqual([]);
  });

  it("sorts ascending and keeps the evening reading's time", async () => {
    const result = await parseScaleXlsx(readFileSync(SAMPLE));
    expect(result.measurements[0].measuredAt.toISOString()).toBe("2026-10-15T19:55:00.000Z");
  });
});

describe("parseScaleXlsx (synthetic files)", () => {
  const header = ["Date", "Time", "Weight(Kg)", "Fat(%)", "Body fat weight(Kg)", "Weight Without Fat(Kg)"];

  it("rejects a non-xlsx buffer", async () => {
    await expect(parseScaleXlsx(new TextEncoder().encode("not a zip"))).rejects.toMatchObject({ code: "invalid_xlsx" });
  });

  it("rejects a workbook without the expected header", async () => {
    const file = await buildXlsx([["Foo", "Bar"], ["1", "2"]]);
    await expect(parseScaleXlsx(file)).rejects.toBeInstanceOf(ScaleParseError);
    await expect(parseScaleXlsx(file)).rejects.toMatchObject({ code: "missing_header" });
  });

  it("rejects a file with a header but no rows", async () => {
    const file = await buildXlsx([header]);
    await expect(parseScaleXlsx(file)).rejects.toMatchObject({ code: "no_measurements" });
  });

  it("skips unreadable dates and rows without weight, and reports missing columns", async () => {
    const file = await buildXlsx([
      header,
      ["13/45/2026", "07:00", "80", "20", "16", "64"],
      ["02/31/2026", "07:00", "80", "20", "16", "64"],
      ["11/01/2026", "07:00", "", "20", "16", "64"],
      ["11/02/2026", "07:00", "80", "20", "16", "64"],
    ]);
    const result = await parseScaleXlsx(file);
    expect(result.measurements).toHaveLength(1);
    expect(result.measurements[0].bmi).toBeNull();
    expect(result.warnings.some((w) => w.startsWith("Columns not found"))).toBe(true);
    expect(result.warnings.filter((w) => w.startsWith("Skipped")).length).toBe(3);
  });

  it("warns when derived values are inconsistent", async () => {
    const file = await buildXlsx([header, ["11/02/2026", "07:00", "80", "20", "30", "50"]]);
    const result = await parseScaleXlsx(file);
    expect(result.warnings.some((w) => /Body fat kg looks inconsistent/.test(w))).toBe(true);
  });
});

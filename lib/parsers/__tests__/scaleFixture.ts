import JSZip from "jszip";

/**
 * Builds a minimal .xlsx that mirrors the structure of a real smart-scale export
 * (3 metadata rows, a header row, newest-first readings) with synthetic values,
 * so tests never depend on a personal data file.
 */
export const SCALE_HEADER = [
  "Date", "Time", "Weight(Kg)", "BMI", "Fat(%)", "Body fat weight(Kg)",
  "Skeletal muscle mass percentage(%)", "Skeletal muscle weight(Kg)", "Muscle Percent(%)", "Muscle weight(Kg)",
  "V-fat", "Water(%)", "Weight of water(Kg)", "Metabolism(kcal/day)", "Obesity Degree(%)",
  "Bone Mass(Kg)", "Protein(%)", "Weight Without Fat(Kg)", "Body age",
];

/** Newest first, like the real export. 10/15 is an evening reading. */
export const SCALE_ROWS: string[][] = [
  ["11/01/2026", "07:13", "85.10", "27.2", "25.7", "21.9", "39.2", "33.3", "70.5", "60.0", "15.0", "53.0", "45.1", "1757.0", "25.3", "3.2", "17.6", "63.2", "45"],
  ["10/25/2026", "07:18", "84.50", "27.0", "25.5", "21.5", "39.3", "33.2", "70.8", "59.8", "15.0", "53.1", "44.9", "1749.0", "24.4", "3.2", "17.7", "63.0", "44"],
  ["10/18/2026", "07:13", "84.35", "26.9", "25.4", "21.4", "39.4", "33.2", "70.8", "59.7", "15.0", "53.1", "44.8", "1747.0", "24.2", "3.1", "17.7", "62.9", "44"],
  ["10/15/2026", "19:55", "85.00", "27.1", "25.7", "21.8", "39.2", "33.3", "70.6", "60.0", "15.0", "53.0", "45.1", "1756.0", "25.2", "3.2", "17.6", "63.2", "45"],
];

export async function buildSampleScaleXlsx(): Promise<Uint8Array> {
  const rows: string[][] = [
    ["synthetic - Measurement Data"],
    ["Gender：Male", "", "", "", "", "", "", "Age：47Years", "", "", "", "", "", "", "Height：177cm"],
    ["10/15/2026 - 11/01/2026   (18days)"],
    SCALE_HEADER,
    ...SCALE_ROWS,
  ];
  const col = (c: number) => String.fromCharCode(65 + c);
  const xml = `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows
    .map(
      (row, r) =>
        `<row r="${r + 1}">${row
          .map((v, c) => (v === "" ? "" : `<c r="${col(c)}${r + 1}" t="inlineStr"><is><t>${v}</t></is></c>`))
          .join("")}</row>`
    )
    .join("")}</sheetData></worksheet>`;
  const zip = new JSZip();
  zip.file("xl/worksheets/sheet1.xml", xml);
  return zip.generateAsync({ type: "uint8array" });
}

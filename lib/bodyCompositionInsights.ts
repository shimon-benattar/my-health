import { BODY_METRIC_BY_KEY, findRange, type ReferenceRange } from "@/lib/bodyCompositionKnowledge";
import type { BodyMeasurement, BodyMetricKey } from "@/types/body";

export interface BodyProfile {
  age: number | null;
  sex: "male" | "female" | null;
  heightCm: number | null;
}

export type TrendDirection = "up" | "down" | "flat" | "insufficient";
export type MetricStatus = "in-range" | "above" | "below" | "ungraded";

export interface MetricTrend {
  direction: TrendDirection;
  n: number;
  /** latest − previous reading */
  deltaPrev: number | null;
  /** latest − first reading */
  deltaFirst: number | null;
  /** least-squares slope per week; only with >= 5 readings */
  slopePerWeek: number | null;
}

export interface MetricAssessment {
  key: BodyMetricKey;
  latest: number | null;
  trend: MetricTrend;
  status: MetricStatus;
  range: ReferenceRange | null;
  rangeText: string;
  forMe: string;
}

export interface InsightBlock {
  title: string;
  summary: string;
  trend: string;
  action: string;
}

/** Changes smaller than this are inside scale noise (daily weight/water swings are 1+ kg). */
const NOISE: Partial<Record<BodyMetricKey, number>> = {
  weightKg: 1,
  bmi: 0.3,
  fatPct: 0.5,
  fatKg: 0.8,
  skeletalMusclePct: 0.5,
  skeletalMuscleKg: 0.4,
  musclePct: 0.5,
  muscleKg: 0.5,
  visceralFat: 1,
  waterPct: 1,
  waterKg: 1,
  bmr: 15,
  obesityDegreePct: 1,
  boneMassKg: 0.2,
  proteinPct: 0.4,
  leanMassKg: 1,
  bodyAge: 2,
};

const WEEK_MS = 7 * 86400000;

/** Readings taken from noon onwards are treated as non-comparable with morning weigh-ins. */
export function isEveningReading(measuredAtIso: string): boolean {
  return new Date(measuredAtIso).getUTCHours() >= 12;
}

/** Drops evening readings unless that would leave nothing to analyse. */
export function selectComparable(measurements: BodyMeasurement[], includeEvening = false): BodyMeasurement[] {
  const sorted = [...measurements].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
  if (includeEvening) return sorted;
  const morning = sorted.filter((m) => !isEveningReading(m.measuredAt));
  return morning.length > 0 ? morning : sorted;
}

export function computeTrend(readings: BodyMeasurement[], key: BodyMetricKey): MetricTrend {
  const points = readings
    .map((m) => ({ t: new Date(m.measuredAt).getTime(), v: m[key] }))
    .filter((p): p is { t: number; v: number } => p.v !== null && p.v !== undefined);
  const n = points.length;
  if (n === 0) return { direction: "insufficient", n, deltaPrev: null, deltaFirst: null, slopePerWeek: null };

  const latest = points[n - 1].v;
  const deltaPrev = n >= 2 ? latest - points[n - 2].v : null;
  const deltaFirst = n >= 2 ? latest - points[0].v : null;

  let slopePerWeek: number | null = null;
  if (n >= 5) {
    const meanT = points.reduce((s, p) => s + p.t, 0) / n;
    const meanV = points.reduce((s, p) => s + p.v, 0) / n;
    const num = points.reduce((s, p) => s + (p.t - meanT) * (p.v - meanV), 0);
    const den = points.reduce((s, p) => s + (p.t - meanT) ** 2, 0);
    slopePerWeek = den === 0 ? null : (num / den) * WEEK_MS;
  }

  if (n < 3 || deltaFirst === null) {
    return { direction: "insufficient", n, deltaPrev, deltaFirst, slopePerWeek };
  }
  const threshold = NOISE[key] ?? 0.5;
  const direction: TrendDirection = Math.abs(deltaFirst) < threshold ? "flat" : deltaFirst > 0 ? "up" : "down";
  return { direction, n, deltaPrev, deltaFirst, slopePerWeek };
}

function fmt(value: number, decimals: number): string {
  return value.toFixed(decimals);
}

function describeRange(range: ReferenceRange | null, unit: string): string {
  if (!range) return "No reliable range";
  const u = unit === "%" ? "%" : unit ? ` ${unit}` : "";
  const band =
    range.low !== null && range.high !== null
      ? `${range.low}–${range.high}${u}`
      : range.high !== null
        ? `≤ ${range.high}${u}`
        : `≥ ${range.low}${u}`;
  const tag = range.confidence === "guideline" ? "guideline" : range.confidence === "reference-table" ? "reference table" : "scale-specific";
  return `${band} (${tag})`;
}

function statusFor(value: number | null, range: ReferenceRange | null): MetricStatus {
  if (value === null || !range) return "ungraded";
  if (range.high !== null && value > range.high) return "above";
  if (range.low !== null && value < range.low) return "below";
  return "in-range";
}

/** Mifflin-St Jeor and Katch-McArdle cross-check for the scale's BMR. */
export function bmrCrossCheck(latest: BodyMeasurement, profile: BodyProfile) {
  const { weightKg, bmr, leanMassKg } = latest;
  const mifflin =
    weightKg !== null && profile.heightCm !== null && profile.age !== null && profile.sex !== null
      ? 10 * weightKg + 6.25 * profile.heightCm - 5 * profile.age + (profile.sex === "male" ? 5 : -161)
      : null;
  const katch = leanMassKg !== null ? 370 + 21.6 * leanMassKg : null;
  const diffPct = bmr !== null && mifflin !== null ? ((bmr - mifflin) / mifflin) * 100 : null;
  return { mifflin, katch, diffPct };
}

export function recomposition(readings: BodyMeasurement[]) {
  if (readings.length < 2) return null;
  const first = readings[0];
  const last = readings[readings.length - 1];
  const d = (k: BodyMetricKey) => (first[k] !== null && last[k] !== null ? (last[k] as number) - (first[k] as number) : null);
  return { dWeight: d("weightKg"), dFat: d("fatKg"), dLean: d("leanMassKg") };
}

function trendPhrase(trend: MetricTrend, unit: string, decimals: number): string {
  const u = unit === "%" ? " pts" : unit ? ` ${unit}` : "";
  if (trend.n < 2) return "Only one reading, so there is no trend yet.";
  if (trend.n < 3) {
    return `Two readings (${(trend.deltaFirst ?? 0) >= 0 ? "+" : ""}${fmt(trend.deltaFirst ?? 0, decimals)}${u}); at least 3 are needed to call a trend.`;
  }
  const d = `${(trend.deltaFirst ?? 0) >= 0 ? "+" : ""}${fmt(trend.deltaFirst ?? 0, decimals)}${u}`;
  if (trend.direction === "flat") return `Stable across ${trend.n} readings (${d}), which is within scale noise.`;
  return `${trend.direction === "up" ? "Rising" : "Falling"} across ${trend.n} readings (${d}).`;
}

function forMeText(key: BodyMetricKey, latest: number | null, status: MetricStatus, trend: MetricTrend, profile: BodyProfile): string {
  if (latest === null) return "No value in this export.";
  const k = BODY_METRIC_BY_KEY[key];
  const value = `${fmt(latest, k.decimals)}${k.unit === "%" ? "%" : k.unit ? ` ${k.unit}` : ""}`;
  const improving =
    k.goodDirection !== null && (trend.direction === (k.goodDirection === "down" ? "down" : "up"));
  const worsening =
    k.goodDirection !== null && (trend.direction === (k.goodDirection === "down" ? "up" : "down"));
  const trendNote = improving ? " Trend is moving in the favourable direction." : worsening ? " Trend is moving the wrong way." : "";

  switch (key) {
    case "bmi":
      return status === "above"
        ? `${value} is in the overweight band, but BMI ignores muscle. Fat % and visceral fat decide whether it matters for you.${trendNote}`
        : `${value} is in the healthy band.${trendNote}`;
    case "fatPct":
      return status === "above"
        ? `${value} is above the typical band for men your age. This is the main lever to improve; the scale's absolute value is approximate, so follow the trend.${trendNote}`
        : status === "below"
          ? `${value} is below the typical band; check that you are not under-fuelling.${trendNote}`
          : `${value} is within the typical band for your age and sex.${trendNote}`;
    case "visceralFat":
      return status === "above"
        ? `${value} is above the healthy band on common scale conventions. This is the metric most worth acting on: it is linked to metabolic and cardiovascular risk. Confirm with waist circumference and ask your doctor about blood glucose and lipids.${trendNote}`
        : `${value} is within the healthy band.${trendNote}`;
    case "skeletalMuscleKg":
    case "skeletalMusclePct":
      return `${value}. Protecting this during fat loss matters most for strength and metabolism at ${profile.age ?? "your"} years old. No grade is given because scale muscle ranges differ by brand.${trendNote}`;
    case "waterPct":
      return status === "in-range"
        ? `${value} is in the usual band. Water is the main source of day-to-day noise in your fat % reading.${trendNote}`
        : `${value} is outside the usual band; a hydration difference may be distorting other readings.${trendNote}`;
    case "bmr":
      return `${value} is a formula estimate of your resting burn. Use it as a planning baseline, not as a measurement.`;
    case "bodyAge":
      return profile.age !== null
        ? `The scale says ${value}, ${latest < profile.age ? `${profile.age - latest} year(s) younger` : latest > profile.age ? `${latest - profile.age} year(s) older` : "the same as"} than your age of ${profile.age}. Treat it as a headline, not a diagnosis.`
        : `The scale says ${value}. Treat it as a headline, not a diagnosis.`;
    default:
      return `${value}. ${k.goodDirection === null ? "Context-dependent, so read it alongside fat and muscle." : `Generally ${k.goodDirection === "down" ? "lower" : "higher"} is favourable.`}${trendNote}`;
  }
}

export function assessMetric(readings: BodyMeasurement[], key: BodyMetricKey, profile: BodyProfile): MetricAssessment {
  const trend = computeTrend(readings, key);
  const latest = [...readings].reverse().find((m) => m[key] !== null)?.[key] ?? null;
  const range = findRange(key, profile.sex, profile.age);
  const status = statusFor(latest, range);
  return {
    key,
    latest,
    trend,
    status,
    range,
    rangeText: describeRange(range, BODY_METRIC_BY_KEY[key].unit),
    forMe: forMeText(key, latest, status, trend, profile),
  };
}

export function buildBodyInsights(readings: BodyMeasurement[], profile: BodyProfile, totalCount = readings.length): InsightBlock[] {
  if (readings.length === 0) return [];
  const latest = readings[readings.length - 1];
  const blocks: InsightBlock[] = [];

  const weight = computeTrend(readings, "weightKg");
  const fat = computeTrend(readings, "fatKg");
  const lean = computeTrend(readings, "leanMassKg");
  const recomp = recomposition(readings);
  const dateSpan = `${readings[0].measuredAt.slice(0, 10)} to ${latest.measuredAt.slice(0, 10)}`;

  blocks.push({
    title: "Weight and composition",
    summary:
      latest.weightKg !== null && latest.fatPct !== null
        ? `${fmt(latest.weightKg, 1)} kg at ${fmt(latest.fatPct, 1)}% body fat (${dateSpan}).`
        : `Latest weight ${latest.weightKg !== null ? fmt(latest.weightKg, 1) + " kg" : "unavailable"}.`,
    trend:
      weight.n < 3
        ? "Too few readings to call a trend. Aim for a weekly morning weigh-in."
        : recomp && recomp.dWeight !== null && recomp.dFat !== null && recomp.dLean !== null
          ? `Weight ${recomp.dWeight >= 0 ? "+" : ""}${fmt(recomp.dWeight, 2)} kg = fat ${recomp.dFat >= 0 ? "+" : ""}${fmt(recomp.dFat, 1)} kg and lean ${recomp.dLean >= 0 ? "+" : ""}${fmt(recomp.dLean, 1)} kg. ${
              weight.direction === "flat" && fat.direction === "flat" && lean.direction === "flat"
                ? "All three are inside scale noise: no real change yet."
                : fat.direction === "down" && lean.direction !== "down"
                  ? "Fat is falling without losing lean tissue, which is the ideal pattern."
                  : fat.direction === "up" && lean.direction !== "up"
                    ? "Added weight is mostly fat."
                    : lean.direction === "down"
                      ? "Lean mass is falling: protect muscle with protein and resistance training."
                      : "Mixed signals; keep collecting data."
            }`
          : "Composition detail is incomplete in this export.",
    action: "Keep weigh-ins weekly, same time, same conditions, and judge progress over 4+ weeks rather than single readings.",
  });

  const visceral = assessMetric(readings, "visceralFat", profile);
  if (visceral.latest !== null) {
    blocks.push({
      title: "Visceral fat",
      summary: visceral.forMe,
      trend: trendPhrase(visceral.trend, "", 0),
      action: "Prioritise aerobic activity (your Sport tab shows what you already do), resistance training, less alcohol and better sleep. Re-check in 8–12 weeks.",
    });
  }

  const check = bmrCrossCheck(latest, profile);
  if (latest.bmr !== null && check.mifflin !== null) {
    blocks.push({
      title: "Metabolism (BMR) cross-check",
      summary: `Scale BMR ${fmt(latest.bmr, 0)} kcal vs Mifflin-St Jeor ${fmt(check.mifflin, 0)} kcal${check.katch !== null ? ` and Katch-McArdle ${fmt(check.katch, 0)} kcal` : ""}.`,
      trend:
        check.diffPct !== null && Math.abs(check.diffPct) <= 5
          ? `The scale is within ${fmt(Math.abs(check.diffPct), 1)}% of the standard formula, so it is a reasonable planning baseline.`
          : `The scale differs from the formula by ${check.diffPct !== null ? fmt(check.diffPct, 1) : "?"}%; prefer the formula value for planning.`,
      action: "Add your activity (see Active calories on Overview) to this baseline to estimate daily needs, and adjust using the actual weight trend.",
    });
  }

  const eveningCount = totalCount - readings.length;
  blocks.push({
    title: "Measurement quality",
    summary: `${readings.length} comparable reading${readings.length === 1 ? "" : "s"} used${eveningCount > 0 ? `; ${eveningCount} evening reading${eveningCount === 1 ? "" : "s"} excluded` : ""}.`,
    trend: "Impedance scales shift with hydration: dehydration overestimates fat %, and single-day changes of a few points can be noise.",
    action: "Weigh in the morning after the bathroom and before eating or drinking. Same scale, same surface, no recent exercise.",
  });

  return blocks;
}

// ---------------------------------------------------------------------------
// Apple Health link: compare recovery/fitness context around the scale readings
// ---------------------------------------------------------------------------

export interface HealthContextEntry {
  date: Date | string;
  restingHeartRate: number | null;
  hrv: { min: number; max: number } | null;
  cardioFitness: number | null;
  activeCalories: number | null;
  sleep: number | null;
}

export interface RecoveryLinkRow {
  key: "restingHeartRate" | "hrv" | "cardioFitness" | "activeCalories" | "sleep";
  label: string;
  unit: string;
  decimals: number;
  before: number | null;
  after: number | null;
  delta: number | null;
  daysBefore: number;
  daysAfter: number;
  /** true = moved in the favourable direction, false = unfavourable, null = flat/unknown/neutral */
  favourable: boolean | null;
}

export interface RecoveryLink {
  from: string;
  to: string;
  windowDays: number;
  rows: RecoveryLinkRow[];
}

const DAY_MS = 86400000;
const MIN_DAYS_PER_WINDOW = 3;

const LINK_METRICS: Array<{
  key: RecoveryLinkRow["key"];
  label: string;
  unit: string;
  decimals: number;
  good: "down" | "up" | null;
  noise: number;
  pick: (e: HealthContextEntry) => number | null;
}> = [
  { key: "restingHeartRate", label: "Resting heart rate", unit: "bpm", decimals: 1, good: "down", noise: 1.5, pick: (e) => e.restingHeartRate },
  { key: "hrv", label: "HRV (SDNN, daily mid-range)", unit: "ms", decimals: 0, good: "up", noise: 4, pick: (e) => (e.hrv ? (e.hrv.min + e.hrv.max) / 2 : null) },
  { key: "cardioFitness", label: "VO₂ max", unit: "mL/kg/min", decimals: 1, good: "up", noise: 0.5, pick: (e) => e.cardioFitness },
  { key: "activeCalories", label: "Active calories", unit: "kcal/day", decimals: 0, good: null, noise: 40, pick: (e) => e.activeCalories },
  { key: "sleep", label: "Sleep", unit: "min/night", decimals: 0, good: "up", noise: 15, pick: (e) => e.sleep },
];

function windowAverage(entries: HealthContextEntry[], endMs: number, windowDays: number, pick: (e: HealthContextEntry) => number | null) {
  const startMs = endMs - windowDays * DAY_MS;
  const values = entries
    .filter((e) => {
      const t = new Date(e.date).getTime();
      return t > startMs && t <= endMs + DAY_MS;
    })
    .map(pick)
    .filter((v): v is number => v !== null && v !== undefined && Number.isFinite(v));
  return { avg: values.length >= MIN_DAYS_PER_WINDOW ? values.reduce((a, b) => a + b, 0) / values.length : null, days: values.length };
}

/**
 * Compares Apple Health averages for the `windowDays` ending at the first and the latest comparable
 * scale reading. Context only: with a handful of weigh-ins this cannot show cause and effect.
 * Returns null when the readings are less than a week apart or no metric has enough data in both windows.
 */
export function buildRecoveryLink(readings: BodyMeasurement[], entries: HealthContextEntry[], windowDays = 14): RecoveryLink | null {
  if (readings.length < 2 || entries.length === 0) return null;
  const first = readings[0].measuredAt;
  const last = readings[readings.length - 1].measuredAt;
  const firstMs = new Date(first).getTime();
  const lastMs = new Date(last).getTime();
  if (lastMs - firstMs < 7 * DAY_MS) return null;

  const rows: RecoveryLinkRow[] = [];
  for (const m of LINK_METRICS) {
    const before = windowAverage(entries, firstMs, windowDays, m.pick);
    const after = windowAverage(entries, lastMs, windowDays, m.pick);
    if (before.avg === null || after.avg === null) continue;
    const delta = after.avg - before.avg;
    const favourable = m.good === null || Math.abs(delta) < m.noise ? null : m.good === "down" ? delta < 0 : delta > 0;
    rows.push({
      key: m.key, label: m.label, unit: m.unit, decimals: m.decimals,
      before: before.avg, after: after.avg, delta, daysBefore: before.days, daysAfter: after.days, favourable,
    });
  }
  return rows.length === 0 ? null : { from: first, to: last, windowDays, rows };
}

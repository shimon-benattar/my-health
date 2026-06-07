import type { HealthEntryDoc, UserProfile } from "@/types/health";

export interface InsightBlock {
  summary: string;
  trend: string;
  action: string;
}

// ---------------------------------------------------------------------------
// Helpers — all insight functions expect values sorted ASCENDING (oldest→newest)
// ---------------------------------------------------------------------------

function ageFromBirthdate(birthdate: string): number | null {
  const [day, month, year] = birthdate.split("/").map(Number);
  if (!day || !month || !year) return null;
  const now = new Date();
  let age = now.getFullYear() - year;
  const birthdayThisYear = new Date(now.getFullYear(), month - 1, day);
  if (now < birthdayThisYear) age -= 1;
  return age;
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function toOneDecimal(value: number): string {
  return Number.isInteger(value) ? String(Math.round(value)) : value.toFixed(1);
}

/** Linear regression slope. Values must be ascending (oldest first). */
function linearSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const meanX = (n - 1) / 2;
  const meanY = avg(values);
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (i - meanX) ** 2;
    sxy += (i - meanX) * (values[i] - meanY);
  }
  return sxx > 0 ? sxy / sxx : 0;
}

/**
 * Trend direction using linear regression.
 * - Threshold: 3% of mean change per "half the period"
 */
function trendDirection(values: number[]): "up" | "down" | "flat" {
  if (values.length < 4) return "flat";
  const mean = avg(values);
  if (mean <= 0) return "flat";
  const slope = linearSlope(values);
  // Normalise slope as % of mean per point, then scale to half the window
  const normalisedDelta = (slope * (values.length / 2)) / mean;
  if (normalisedDelta > 0.03) return "up";
  if (normalisedDelta < -0.03) return "down";
  return "flat";
}

/**
 * Coefficient of variation: stddev / mean. >0.20 = high volatility.
 */
function coefficientOfVariation(values: number[]): number {
  if (values.length < 3) return 0;
  const mean = avg(values);
  if (mean <= 0) return 0;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

function rangeSuffix(range: string): string {
  if (range === "all") return "across your full imported history";
  if (range === "7d") return "over the last 7 days";
  if (range === "30d") return "over the last 30 days";
  if (range === "90d") return "over the last 90 days";
  return "over the selected window";
}

export function readinessInsight(score: number, trend: number[], range = "all"): InsightBlock {
  const suffix = rangeSuffix(range);
  // Trend values are already from API in date order; no entries sort needed here
  const ascending = [...trend];
  const t = trendDirection(ascending);

  const summary =
    score >= 70
      ? `Readiness is ${score}/100 — strong enough for quality training ${suffix}.`
      : score >= 40
        ? `Readiness is ${score}/100 — workable but not ideal for back-to-back hard sessions ${suffix}.`
        : `Readiness is ${score}/100 — recovery should take priority ${suffix}.`;

  const trendText =
    t === "up"
      ? `Readiness is trending upward ${suffix}, suggesting recovery is improving.`
      : t === "down"
        ? `Readiness is declining ${suffix}, suggesting fatigue may be building.`
        : `Readiness is broadly stable ${suffix}.`;

  const action =
    score >= 70
      ? "Keep the current training rhythm. Protect sleep and hydration so you can repeat hard sessions."
      : score >= 40
        ? "One quality session is fine; follow it with easier days and monitor sleep."
        : "Swap intensity for recovery: light movement, extra sleep, and good hydration before attempting hard training.";

  return { summary, trend: trendText, action };
}

export function vo2Insight(entries: HealthEntryDoc[], profile: UserProfile | null | undefined, range = "all"): InsightBlock {
  // Sort ascending so trendDirection reads oldest → newest
  const sorted = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const values = sorted.map((e) => e.cardioFitness).filter((v): v is number => v !== null);
  const average = avg(values);
  const age = profile ? ageFromBirthdate(profile.birthdate) : null;
  const direction = trendDirection(values);
  const suffix = rangeSuffix(range);

  let ageLabel = "";
  let verdict = "";
  if (age !== null && values.length > 0) {
    // Garmin/Cooper reference for men — approximate
    const isOlderMale = age >= 45;
    if (isOlderMale) {
      if (average >= 43) verdict = "excellent for your age group (45+)";
      else if (average >= 38) verdict = "good for your age group (45+)";
      else if (average >= 34) verdict = "fair — there is room to build aerobic capacity";
      else verdict = "below average for your age group — consistent aerobic work will help";
      ageLabel = ` (age ${age})`;
    } else {
      if (average >= 52) verdict = "excellent";
      else if (average >= 46) verdict = "good";
      else if (average >= 40) verdict = "fair";
      else verdict = "below average — aerobic base work will help";
    }
  }

  const summary =
    values.length === 0
      ? `No VO2 Max samples in the selected window.`
      : verdict
        ? `Average VO2 Max is ${toOneDecimal(average)} mL/min·kg${ageLabel} — ${verdict}.`
        : `Average VO2 Max is ${toOneDecimal(average)} mL/min·kg ${suffix}.`;

  const trendText =
    direction === "up"
      ? `VO2 Max is slowly rising ${suffix} — a positive sign of aerobic adaptation.`
      : direction === "down"
        ? `VO2 Max has been drifting downward ${suffix} — possible aerobic detraining or incomplete recovery.`
        : `VO2 Max is stable ${suffix}, with no consistent upward or downward movement.`;

  const action =
    direction === "down"
      ? "Add one to two moderate aerobic sessions per week and ensure sleep quality. Avoid back-to-back hard days."
      : "Keep two to three aerobic sessions each week. One threshold effort per week sustains VO2 Max gains.";

  return { summary, trend: trendText, action };
}

export function rhrInsight(entries: HealthEntryDoc[], range = "all"): InsightBlock {
  const sorted = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const values = sorted.map((e) => e.restingHeartRate).filter((v): v is number => v !== null);
  const average = avg(values);
  const direction = trendDirection(values);
  const suffix = rangeSuffix(range);

  const summary =
    values.length === 0
      ? "No Resting Heart Rate samples in the selected window."
      : average <= 55
        ? `Average resting HR is ${toOneDecimal(average)} bpm — a strong recovery indicator ${suffix}.`
        : average <= 65
          ? `Average resting HR is ${toOneDecimal(average)} bpm — acceptable but worth watching ${suffix}.`
          : `Average resting HR is ${toOneDecimal(average)} bpm — elevated, which may reflect stress or fatigue ${suffix}.`;

  const trendText =
    direction === "down"
      ? `Resting HR is trending down ${suffix} — lower baseline strain is a positive sign.`
      : direction === "up"
        ? `Resting HR is trending up ${suffix} — can mean accumulated stress or under-recovery.`
        : `Resting HR is stable ${suffix}.`;

  return {
    summary,
    trend: trendText,
    action: "If resting HR rises above your normal range for several consecutive days, reduce intensity and prioritize sleep.",
  };
}

export function hrvInsight(entries: HealthEntryDoc[], range = "all"): InsightBlock {
  const sorted = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const values = sorted.map((e) => e.hrv?.max ?? null).filter((v): v is number => v !== null);
  const average = avg(values);
  const direction = trendDirection(values);
  const cv = coefficientOfVariation(values);
  const isVolatile = cv > 0.20;
  const suffix = rangeSuffix(range);

  const summary =
    values.length === 0
      ? "No HRV samples in the selected window."
      : average >= 60
        ? `Average HRV peak is ${toOneDecimal(average)} ms — a healthy recovery signal ${suffix}.`
        : average >= 40
          ? `Average HRV peak is ${toOneDecimal(average)} ms — moderate; acceptable but not exceptional ${suffix}.`
          : `Average HRV peak is ${toOneDecimal(average)} ms — low, suggesting ongoing recovery strain ${suffix}.`;

  const volatilityNote = isVolatile
    ? ` HRV fluctuates significantly day-to-day (${Math.round(cv * 100)}% variation), which is normal with varied training loads, illness cycles, or stress. Focus on the multi-week baseline rather than individual readings.`
    : "";

  const trendText =
    direction === "up"
      ? `HRV is on an upward trajectory ${suffix} — recovery is generally improving.${volatilityNote}`
      : direction === "down"
        ? `HRV has a downward lean ${suffix} — could indicate cumulative stress or training load.${volatilityNote}`
        : `HRV is broadly stable ${suffix}.${volatilityNote}`;

  const action = isVolatile
    ? "With high day-to-day HRV variability, avoid rigid training rules. Train hard when you feel ready; back off when multiple signals (sleep, mood, RHR) are poor together."
    : "If HRV drops below your rolling average while you feel fatigued, shift the next session to low intensity.";

  return { summary, trend: trendText, action };
}

export function sleepInsight(entries: HealthEntryDoc[], range = "all"): InsightBlock {
  const sorted = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const values = sorted.map((e) => e.sleep).filter((v): v is number => v !== null);
  const average = avg(values);
  const direction = trendDirection(values);
  const hours = average / 60;
  const suffix = rangeSuffix(range);

  const summary =
    values.length === 0
      ? "No sleep data in the selected window."
      : hours >= 7.5
        ? `Average sleep is ${hours.toFixed(1)} hrs — solid recovery time ${suffix}.`
        : hours >= 6.5
          ? `Average sleep is ${hours.toFixed(1)} hrs — adequate but slightly short for optimal recovery ${suffix}.`
          : `Average sleep is ${hours.toFixed(1)} hrs — likely limiting recovery and readiness ${suffix}.`;

  const trendText =
    direction === "up"
      ? `Sleep duration is trending upward ${suffix} — good for readiness.`
      : direction === "down"
        ? `Sleep duration is trending downward ${suffix} — this can suppress readiness over time.`
        : `Sleep duration is stable ${suffix}.`;

  return {
    summary,
    trend: trendText,
    action: "Aim for a consistent 7.5–8 hr sleep window. Even one extra hour on low-readiness nights speeds recovery significantly.",
  };
}

export function stepsInsight(entries: HealthEntryDoc[], range = "all"): InsightBlock {
  const sorted = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const values = sorted.map((e) => e.steps).filter((v): v is number => v !== null);
  const average = avg(values);
  const direction = trendDirection(values);
  const suffix = rangeSuffix(range);

  const summary =
    values.length === 0
      ? "No step data in the selected window."
      : average >= 9000
        ? `Average ${Math.round(average).toLocaleString("en-US")} steps/day — strong daily movement baseline ${suffix}.`
        : average >= 6000
          ? `Average ${Math.round(average).toLocaleString("en-US")} steps/day — decent but inconsistent days are visible ${suffix}.`
          : `Average ${Math.round(average).toLocaleString("en-US")} steps/day — low daily activity ${suffix}.`;

  const trendText =
    direction === "up"
      ? `Daily movement is trending up ${suffix} — good for general health.`
      : direction === "down"
        ? `Daily movement is declining ${suffix} — check whether rest days cluster together or activity has dropped.`
        : `Daily movement is stable ${suffix}.`;

  return {
    summary,
    trend: trendText,
    action: "Use steps as a baseline consistency check. Aim for a steady weekly total rather than spiky high-low patterns.",
  };
}

export function activeCaloriesInsight(entries: HealthEntryDoc[], range = "all"): InsightBlock {
  const sorted = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const values = sorted.map((e) => e.activeCalories).filter((v): v is number => v !== null);
  const average = avg(values);
  const direction = trendDirection(values);
  const suffix = rangeSuffix(range);

  const summary =
    values.length === 0
      ? "No active calorie data in the selected window."
      : average >= 700
        ? `Average ${Math.round(average)} active kcal/day — high activity load ${suffix}.`
        : average >= 400
          ? `Average ${Math.round(average)} active kcal/day — moderate daily load ${suffix}.`
          : `Average ${Math.round(average)} active kcal/day — relatively light activity ${suffix}.`;

  const trendText =
    direction === "up"
      ? `Active calorie load is trending upward ${suffix}.`
      : direction === "down"
        ? `Active calorie load is trending downward ${suffix}.`
        : `Active calorie load is stable ${suffix}.`;

  return {
    summary,
    trend: trendText,
    action: "If load rises for multiple weeks, pair it with stronger sleep and recovery habits to avoid carrying fatigue forward.",
  };
}

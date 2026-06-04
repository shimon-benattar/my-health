import type { HealthEntryDoc, UserProfile } from "@/types/health";

export interface InsightBlock {
  summary: string;
  trend: string;
  action: string;
}

function ageFromBirthdate(birthdate: string): number | null {
  const [day, month, year] = birthdate.split("/").map(Number);
  if (!day || !month || !year) return null;
  const now = new Date();
  let age = now.getFullYear() - year;
  const birthdayThisYear = new Date(now.getFullYear(), month - 1, day);
  if (now < birthdayThisYear) age -= 1;
  return age;
}

function trendDirection(values: number[]): "up" | "down" | "flat" {
  if (values.length < 2) return "flat";
  const { first, last } = splitTrend(values);
  const delta = avg(last) - avg(first);
  if (Math.abs(delta) < 1) return "flat";
  return delta > 0 ? "up" : "down";
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function toOneDecimal(value: number): string {
  return Number.isInteger(value) ? String(Math.round(value)) : value.toFixed(1);
}

function splitTrend(values: number[]): { first: number[]; last: number[] } {
  const midpoint = Math.max(1, Math.floor(values.length / 2));
  return { first: values.slice(0, midpoint), last: values.slice(midpoint) };
}

export function readinessInsight(score: number, trend: number[]): InsightBlock {
  const t = trendDirection(trend);
  const summary =
    score >= 70
      ? `Average readiness is ${score}/100, which is strong enough for quality training.`
      : score >= 40
        ? `Average readiness is ${score}/100, which is workable but not ideal for repeated hard sessions.`
        : `Average readiness is ${score}/100, which suggests you should prioritize recovery.`;

  const trendText = t === "up"
    ? "Readiness is improving across the selected period, so recovery is catching up."
    : t === "down"
      ? "Readiness is declining across the selected period, so fatigue may be building."
      : "Readiness is broadly stable across the selected period.";

  const action =
    score >= 70
      ? "Keep the next hard session, but preserve sleep and hydration so you can repeat it tomorrow."
      : score >= 40
        ? "Train, but keep intensity targeted: one quality session is fine, then back off and recover."
      : "Swap intensity for recovery work, hydrate, and extend sleep before attempting hard training.";

  return { summary, trend: trendText, action };
}

export function vo2Insight(entries: HealthEntryDoc[], profile: UserProfile | null | undefined): InsightBlock {
  const values = entries.map((e) => e.cardioFitness).filter((v): v is number => v !== null);
  const average = avg(values);
  const age = profile ? ageFromBirthdate(profile.birthdate) : null;
  const direction = trendDirection(values);

  const summary = values.length === 0
    ? "No VO2 Max samples exist in this window."
    : age !== null && age >= 45
      ? average >= 42
        ? `Your average VO2 Max is ${toOneDecimal(average)} mL/min·kg, which is strong for your age band.`
        : `Your average VO2 Max is ${toOneDecimal(average)} mL/min·kg, which leaves room to improve aerobic capacity.`
      : `Your average VO2 Max is ${toOneDecimal(average)} mL/min·kg.`;

  const trend = direction === "up"
    ? "VO2 Max is trending upward, which usually means your aerobic fitness is improving."
    : direction === "down"
      ? "VO2 Max is trending downward, which suggests aerobic detraining or incomplete recovery."
      : "VO2 Max is stable across the selected period.";

  return {
    summary,
    trend,
    action: "Keep two to three aerobic sessions each week and one threshold effort if recovery stays stable.",
  };
}

export function rhrInsight(entries: HealthEntryDoc[]): InsightBlock {
  const values = entries.map((e) => e.restingHeartRate).filter((v): v is number => v !== null);
  const average = avg(values);
  const direction = trendDirection(values);
  const summary = values.length === 0
    ? "No Resting Heart Rate samples yet."
    : average <= 55
      ? `Your average resting HR is ${toOneDecimal(average)} bpm, which is a strong recovery sign.`
      : average <= 65
        ? `Your average resting HR is ${toOneDecimal(average)} bpm, which is acceptable but worth watching.`
        : `Your average resting HR is ${toOneDecimal(average)} bpm, which is elevated and may reflect stress or fatigue.`;

  return {
    summary,
    trend: direction === "down" ? "Resting HR is trending down, which usually means lower baseline strain." : direction === "up" ? "Resting HR is trending up, which can mean stress or under-recovery." : "Resting HR is stable across this window.",
    action: "If your resting HR stays above your usual range for several days, reduce intensity and prioritize sleep and hydration.",
  };
}

export function hrvInsight(entries: HealthEntryDoc[]): InsightBlock {
  const values = entries.map((e) => e.hrv?.max ?? null).filter((v): v is number => v !== null);
  const average = avg(values);
  const direction = trendDirection(values);
  const summary = values.length === 0
    ? "No HRV samples yet."
    : average >= 60
      ? `Your average HRV peak is ${toOneDecimal(average)} ms, which is a positive recovery signal.`
      : average >= 40
        ? `Your average HRV peak is ${toOneDecimal(average)} ms, which is usable but not especially high.`
        : `Your average HRV peak is ${toOneDecimal(average)} ms, which suggests recovery strain.`;

  return {
    summary,
    trend: direction === "up" ? "HRV is trending upward, which usually means recovery is improving." : direction === "down" ? "HRV is trending downward, which can indicate accumulating stress." : "HRV is stable across this period.",
    action: "If HRV drops while you feel tired, switch the next one or two days to low-intensity work.",
  };
}

export function sleepInsight(entries: HealthEntryDoc[]): InsightBlock {
  const values = entries.map((e) => e.sleep).filter((v): v is number => v !== null);
  const average = avg(values);
  const direction = trendDirection(values);
  const hours = average / 60;
  const summary = values.length === 0
    ? "No sleep data yet."
    : hours >= 7.5
      ? `Your average sleep is ${hours.toFixed(1)} hours, which is in the healthy recovery range.`
      : hours >= 6.5
        ? `Your average sleep is ${hours.toFixed(1)} hours, which is adequate but a bit short for best recovery.`
        : `Your average sleep is ${hours.toFixed(1)} hours, which is likely limiting recovery.`;

  return {
    summary,
    trend: direction === "up" ? "Sleep duration is trending upward, which should help recovery and readiness." : direction === "down" ? "Sleep duration is trending downward, which can drag readiness down." : "Sleep duration is stable across this period.",
    action: "Aim for a repeatable 7.5-8 hour sleep window and reduce late-night stimulation.",
  };
}

export function stepsInsight(entries: HealthEntryDoc[]): InsightBlock {
  const values = entries.map((e) => e.steps).filter((v): v is number => v !== null);
  const average = avg(values);
  const direction = trendDirection(values);
  const summary = values.length === 0
    ? "No step data yet."
    : average >= 9000
      ? `Your average daily steps are ${Math.round(average).toLocaleString("en-US")}, which is a strong daily movement baseline.`
      : average >= 6000
        ? `Your average daily steps are ${Math.round(average).toLocaleString("en-US")}, which is decent but could be more consistent.`
        : `Your average daily steps are ${Math.round(average).toLocaleString("en-US")}, which suggests low day-to-day movement.`;

  return {
    summary,
    trend: direction === "up" ? "Daily movement is trending upward, which is good if recovery stays stable." : direction === "down" ? "Daily movement is trending downward, which can reduce your general activity load." : "Daily movement is stable across the selected period.",
    action: "Use steps as its own baseline metric and keep weekly totals steady rather than spiky.",
  };
}

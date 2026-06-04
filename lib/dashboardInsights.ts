import type { HealthEntryDoc, UserProfile } from "@/types/health";

export interface InsightBlock {
  standing: string;
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
  const first = values[0];
  const last = values[values.length - 1];
  const delta = last - first;
  if (Math.abs(delta) < 1) return "flat";
  return delta > 0 ? "up" : "down";
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function readinessInsight(score: number, trend: number[]): InsightBlock {
  const t = trendDirection(trend);
  const standing =
    score >= 70
      ? "Good readiness. Your recovery markers support normal to hard training."
      : score >= 40
        ? "Moderate readiness. You can train, but keep intensity selective."
        : "Low readiness. Recovery should be the main priority today.";

  const trendText = t === "up"
    ? "Readiness trend is improving over the selected period."
    : t === "down"
      ? "Readiness trend is declining; recovery load may be accumulating."
      : "Readiness trend is stable over the selected period.";

  const action =
    score >= 70
      ? "Maintain sleep consistency and schedule one key hard session."
      : score >= 40
        ? "Prioritize sleep tonight and keep today mostly aerobic or skills-focused."
        : "Reduce intensity, hydrate, and aim for longer sleep before hard efforts.";

  return { standing, trend: trendText, action };
}

export function vo2Insight(entries: HealthEntryDoc[], profile: UserProfile | null | undefined): InsightBlock {
  const values = entries.map((e) => e.cardioFitness).filter((v): v is number => v !== null);
  const current = values.length > 0 ? values[values.length - 1] : null;
  const age = profile ? ageFromBirthdate(profile.birthdate) : null;

  const standing = current === null
    ? "No VO2 max samples yet in this period."
    : age !== null && age >= 45
      ? current >= 42
        ? `VO2 max ${current.toFixed(1)} is strong for your age band.`
        : `VO2 max ${current.toFixed(1)} is moderate; there is room to improve aerobic capacity.`
      : `VO2 max is ${current.toFixed(1)}.`;

  const direction = trendDirection(values);
  const trend = direction === "up"
    ? "VO2 trend is improving, indicating better aerobic fitness."
    : direction === "down"
      ? "VO2 trend is declining; aerobic fitness may be detraining."
      : "VO2 trend is stable.";

  return {
    standing,
    trend,
    action: "Add 2-3 weekly aerobic sessions and one threshold workout; keep easy-day recovery intact.",
  };
}

export function rhrInsight(entries: HealthEntryDoc[]): InsightBlock {
  const values = entries.map((e) => e.restingHeartRate).filter((v): v is number => v !== null);
  const current = values.length > 0 ? values[values.length - 1] : null;
  const direction = trendDirection(values);

  return {
    standing: current === null ? "No resting HR samples yet." : `Current resting HR is ${Math.round(current)} bpm.`,
    trend: direction === "down" ? "Resting HR trend is improving (lower baseline strain)." : direction === "up" ? "Resting HR trend is rising, which can indicate stress or under-recovery." : "Resting HR trend is stable.",
    action: "If RHR rises for several days, reduce intensity and prioritize sleep/hydration.",
  };
}

export function hrvInsight(entries: HealthEntryDoc[]): InsightBlock {
  const values = entries.map((e) => e.hrv?.max ?? null).filter((v): v is number => v !== null);
  const current = values.length > 0 ? values[values.length - 1] : null;
  const direction = trendDirection(values);

  return {
    standing: current === null ? "No HRV samples yet." : `Current HRV peak is ${Math.round(current)} ms.`,
    trend: direction === "up" ? "HRV trend is improving, usually a positive recovery signal." : direction === "down" ? "HRV trend is dropping, suggesting higher stress load." : "HRV trend is stable.",
    action: "When HRV falls and fatigue rises together, shift to low-intensity training for 1-2 days.",
  };
}

export function sleepInsight(entries: HealthEntryDoc[]): InsightBlock {
  const values = entries.map((e) => e.sleep).filter((v): v is number => v !== null);
  const current = values.length > 0 ? values[values.length - 1] : null;
  const average = avg(values);
  const direction = trendDirection(values);

  return {
    standing: current === null ? "No sleep data yet." : `Latest sleep is ${(current / 60).toFixed(1)} h; period average is ${(average / 60).toFixed(1)} h.`,
    trend: direction === "up" ? "Sleep duration trend is improving." : direction === "down" ? "Sleep duration trend is declining." : "Sleep duration trend is stable.",
    action: "Target a consistent 7-8+ hour window and protect bedtime routine.",
  };
}

export function stepsInsight(entries: HealthEntryDoc[]): InsightBlock {
  const values = entries.map((e) => e.steps).filter((v): v is number => v !== null);
  const average = avg(values);

  return {
    standing: values.length === 0 ? "No step data yet." : `Average daily steps are ${Math.round(average).toLocaleString("en-US")}.`,
    trend: trendDirection(values) === "up" ? "Step volume trend is increasing." : trendDirection(values) === "down" ? "Step volume trend is decreasing." : "Step volume trend is stable.",
    action: "Use steps as a standalone load metric; aim for a sustainable weekly baseline rather than spikes.",
  };
}

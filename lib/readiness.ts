function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeTo100(value: number, min: number, max: number): number {
  if (max <= min) {
    return 0;
  }

  const ratio = (value - min) / (max - min);
  return Math.round(clamp(ratio, 0, 1) * 100);
}

/**
 * Readiness score = average of HRV score and sleep score.
 * - HRV range reference: 20-80 ms
 * - Sleep range reference: 300-540 min (5h-9h)
 */
export function calcReadiness(hrvMax: number | null, sleepMinutes: number | null): number {
  const hrvScore = normalizeTo100(hrvMax ?? 0, 20, 80);
  const sleepScore = normalizeTo100(sleepMinutes ?? 0, 300, 540);
  return Math.round((hrvScore + sleepScore) / 2);
}

export interface ReadinessInput {
  currentHrvMax: number | null;
  yesterdaySleepMinutes: number | null;
}

export function calcReadinessFromInput(input: ReadinessInput): number {
  return calcReadiness(input.currentHrvMax, input.yesterdaySleepMinutes);
}

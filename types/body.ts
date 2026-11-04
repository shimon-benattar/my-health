export const BODY_METRIC_KEYS = [
  "weightKg",
  "bmi",
  "fatPct",
  "fatKg",
  "skeletalMusclePct",
  "skeletalMuscleKg",
  "musclePct",
  "muscleKg",
  "visceralFat",
  "waterPct",
  "waterKg",
  "bmr",
  "obesityDegreePct",
  "boneMassKg",
  "proteinPct",
  "leanMassKg",
  "bodyAge",
] as const;

export type BodyMetricKey = (typeof BODY_METRIC_KEYS)[number];

export type BodyMetrics = Record<BodyMetricKey, number | null>;

/** One scale reading. `measuredAt` is an ISO string on the wire. */
export interface BodyMeasurement extends BodyMetrics {
  measuredAt: string;
  /** True when the reading was taken outside the morning window (hydration confounder). */
  isEvening?: boolean;
  sourceFile?: string | null;
}

export interface ScaleFileMeta {
  sex: "male" | "female" | null;
  age: number | null;
  heightCm: number | null;
}

export interface ParsedScaleFile {
  meta: ScaleFileMeta;
  measurements: Array<{ measuredAt: Date } & BodyMetrics>;
  warnings: string[];
}

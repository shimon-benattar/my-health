import mongoose, { Schema, Document, Model } from "mongoose";
import type { RangeValue } from "@/types/health";

export interface IHealthEntry extends Document {
  date: Date;
  sportType?: string | null;
  workoutType?: string | null;
  workoutDurationMinutes?: number | null;
  sourceType?: "csv" | "apple-health";
  sourceFile?: string | null;
  importedAt?: Date | null;
  activeCalories: number | null;
  cardioFitness: number | null;
  heartRate: RangeValue | null;
  hrv: RangeValue | null;
  restingHeartRate: number | null;
  sleep: number | null;
  steps: number | null;
  sleepDetail?: {
    remMinutes: number;
    coreMinutes: number;
    deepMinutes: number;
    awakeMinutes: number;
    asleepMinutes: number;
    inBedMinutes: number;
  } | null;
  sleepHeartRate?: {
    avg: number | null;
    min: number | null;
    max: number | null;
    lowAlerts: number;
  } | null;
  syntheticAdjustments?: {
    shabbatSleepAddedMinutes: number;
    shabbatStepsAdded: number;
  } | null;
}

const RangeValueSchema = new Schema<RangeValue>(
  { min: { type: Number, required: true }, max: { type: Number, required: true } },
  { _id: false }
);

const SleepDetailSchema = new Schema(
  {
    remMinutes: { type: Number, default: 0 },
    coreMinutes: { type: Number, default: 0 },
    deepMinutes: { type: Number, default: 0 },
    awakeMinutes: { type: Number, default: 0 },
    asleepMinutes: { type: Number, default: 0 },
    inBedMinutes: { type: Number, default: 0 },
  },
  { _id: false }
);

const SleepHeartRateSchema = new Schema(
  {
    avg: { type: Number, default: null },
    min: { type: Number, default: null },
    max: { type: Number, default: null },
    lowAlerts: { type: Number, default: 0 },
  },
  { _id: false }
);

const SyntheticAdjustmentsSchema = new Schema(
  {
    shabbatSleepAddedMinutes: { type: Number, default: 0 },
    shabbatStepsAdded: { type: Number, default: 0 },
  },
  { _id: false }
);

const HealthEntrySchema = new Schema<IHealthEntry>(
  {
    date: { type: Date, required: true, unique: true, index: true },
    sportType: { type: String, default: null, index: true },
    workoutType: { type: String, default: null },
    workoutDurationMinutes: { type: Number, default: null },
    sourceType: { type: String, enum: ["csv", "apple-health"], default: "csv", index: true },
    sourceFile: { type: String, default: null },
    importedAt: { type: Date, default: null, index: true },
    activeCalories: { type: Number, default: null },
    cardioFitness: { type: Number, default: null },
    heartRate: { type: RangeValueSchema, default: null },
    hrv: { type: RangeValueSchema, default: null },
    restingHeartRate: { type: Number, default: null },
    sleep: { type: Number, default: null },
    steps: { type: Number, default: null },
    sleepDetail: { type: SleepDetailSchema, default: null },
    sleepHeartRate: { type: SleepHeartRateSchema, default: null },
    syntheticAdjustments: { type: SyntheticAdjustmentsSchema, default: null },
  },
  { timestamps: false }
);

const HealthEntry: Model<IHealthEntry> =
  mongoose.models.HealthEntry ??
  mongoose.model<IHealthEntry>("HealthEntry", HealthEntrySchema);

export default HealthEntry;

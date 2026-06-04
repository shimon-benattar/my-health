import mongoose, { Schema, Document, Model } from "mongoose";
import type { RangeValue } from "@/types/health";

export interface IHealthEntry extends Document {
  date: Date;
  sportType?: string | null;
  workoutType?: string | null;
  workoutDurationMinutes?: number | null;
  activeCalories: number | null;
  cardioFitness: number | null;
  heartRate: RangeValue | null;
  hrv: RangeValue | null;
  restingHeartRate: number | null;
  sleep: number | null;
  steps: number | null;
}

const RangeValueSchema = new Schema<RangeValue>(
  { min: { type: Number, required: true }, max: { type: Number, required: true } },
  { _id: false }
);

const HealthEntrySchema = new Schema<IHealthEntry>(
  {
    date: { type: Date, required: true, unique: true, index: true },
    sportType: { type: String, default: null, index: true },
    workoutType: { type: String, default: null },
    workoutDurationMinutes: { type: Number, default: null },
    activeCalories: { type: Number, default: null },
    cardioFitness: { type: Number, default: null },
    heartRate: { type: RangeValueSchema, default: null },
    hrv: { type: RangeValueSchema, default: null },
    restingHeartRate: { type: Number, default: null },
    sleep: { type: Number, default: null },
    steps: { type: Number, default: null },
  },
  { timestamps: false }
);

const HealthEntry: Model<IHealthEntry> =
  mongoose.models.HealthEntry ??
  mongoose.model<IHealthEntry>("HealthEntry", HealthEntrySchema);

export default HealthEntry;

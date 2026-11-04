import mongoose, { Schema, Document, Model } from "mongoose";
import { BODY_METRIC_KEYS, type BodyMetrics } from "@/types/body";

export interface IBodyMeasurement extends Document, BodyMetrics {
  /** Scale wall-clock time stored as UTC digits (same convention as HealthEntry dates). */
  measuredAt: Date;
  sourceFile?: string | null;
  /** Sex / height the scale had on file when it produced the reading. */
  scaleSex?: "male" | "female" | null;
  scaleHeightCm?: number | null;
  importedAt: Date;
}

const metricFields = Object.fromEntries(
  BODY_METRIC_KEYS.map((key) => [key, { type: Number, default: null }])
);

const BodyMeasurementSchema = new Schema<IBodyMeasurement>(
  {
    measuredAt: { type: Date, required: true, unique: true, index: true },
    ...metricFields,
    sourceFile: { type: String, default: null },
    scaleSex: { type: String, enum: ["male", "female", null], default: null },
    scaleHeightCm: { type: Number, default: null },
    importedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: false }
);

const BodyMeasurement: Model<IBodyMeasurement> =
  mongoose.models.BodyMeasurement ??
  mongoose.model<IBodyMeasurement>("BodyMeasurement", BodyMeasurementSchema);

export default BodyMeasurement;

import mongoose, { Document, Model, Schema } from "mongoose";

interface RouteSummary {
  pointCount: number;
  firstTimestamp: Date | null;
  lastTimestamp: Date | null;
  boundingBox: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  } | null;
  distanceEstimateMeters?: number | null;
}

interface RouteCorrelation {
  matched: boolean;
  confidence: number;
  matchReason: string;
}

export interface IAppleHealthWorkout extends Document {
  externalId: string;
  workoutType: string;
  startDate: Date;
  endDate: Date;
  durationMinutes: number | null;
  totalEnergyBurned: number | null;
  totalDistance: number | null;
  sourceName: string | null;
  sourceVersion: string | null;
  routePath: string | null;
  routeSummary: RouteSummary | null;
  routeCorrelation: RouteCorrelation;
  importedAt: Date;
}

const BoundingBoxSchema = new Schema(
  {
    minLat: { type: Number, required: true },
    maxLat: { type: Number, required: true },
    minLon: { type: Number, required: true },
    maxLon: { type: Number, required: true },
  },
  { _id: false }
);

const RouteSummarySchema = new Schema(
  {
    pointCount: { type: Number, required: true },
    firstTimestamp: { type: Date, default: null },
    lastTimestamp: { type: Date, default: null },
    boundingBox: { type: BoundingBoxSchema, default: null },
    distanceEstimateMeters: { type: Number, default: null },
  },
  { _id: false }
);

const RouteCorrelationSchema = new Schema(
  {
    matched: { type: Boolean, required: true },
    confidence: { type: Number, required: true },
    matchReason: { type: String, required: true },
  },
  { _id: false }
);

const AppleHealthWorkoutSchema = new Schema<IAppleHealthWorkout>(
  {
    externalId: { type: String, required: true, unique: true, index: true },
    workoutType: { type: String, required: true, index: true },
    startDate: { type: Date, required: true, index: true },
    endDate: { type: Date, required: true, index: true },
    durationMinutes: { type: Number, default: null },
    totalEnergyBurned: { type: Number, default: null },
    totalDistance: { type: Number, default: null },
    sourceName: { type: String, default: null },
    sourceVersion: { type: String, default: null },
    routePath: { type: String, default: null },
    routeSummary: { type: RouteSummarySchema, default: null },
    routeCorrelation: { type: RouteCorrelationSchema, required: true },
    importedAt: { type: Date, required: true, index: true },
  },
  { timestamps: false, collection: "apple_health_workouts" }
);

const AppleHealthWorkout: Model<IAppleHealthWorkout> =
  mongoose.models.AppleHealthWorkout ??
  mongoose.model<IAppleHealthWorkout>("AppleHealthWorkout", AppleHealthWorkoutSchema);

export default AppleHealthWorkout;

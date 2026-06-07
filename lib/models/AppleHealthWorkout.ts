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

interface StatSummary {
  avg: number | null;
  min: number | null;
  max: number | null;
  sum: number | null;
}

interface WorkoutStats {
  heartRate?: StatSummary | null;
  distanceKm?: number | null;
  activeCalories?: number | null;
  stepCount?: number | null;
  runningSpeedKmh?: StatSummary | null;
  runningStrideM?: StatSummary | null;
  runningGroundContactMs?: StatSummary | null;
  runningPowerW?: StatSummary | null;
  runningVerticalOscillationCm?: StatSummary | null;
  elevationAscendedCm?: number | null;
  averageMETs?: number | null;
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
  stats: WorkoutStats;
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

const StatSummarySchema = new Schema(
  {
    avg: { type: Number, default: null },
    min: { type: Number, default: null },
    max: { type: Number, default: null },
    sum: { type: Number, default: null },
  },
  { _id: false }
);

const WorkoutStatsSchema = new Schema(
  {
    heartRate: { type: StatSummarySchema, default: null },
    distanceKm: { type: Number, default: null },
    activeCalories: { type: Number, default: null },
    stepCount: { type: Number, default: null },
    runningSpeedKmh: { type: StatSummarySchema, default: null },
    runningStrideM: { type: StatSummarySchema, default: null },
    runningGroundContactMs: { type: StatSummarySchema, default: null },
    runningPowerW: { type: StatSummarySchema, default: null },
    runningVerticalOscillationCm: { type: StatSummarySchema, default: null },
    elevationAscendedCm: { type: Number, default: null },
    averageMETs: { type: Number, default: null },
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
    stats: { type: WorkoutStatsSchema, default: {} },
    importedAt: { type: Date, required: true, index: true },
  },
  { timestamps: false, collection: "apple_health_workouts" }
);

const AppleHealthWorkout: Model<IAppleHealthWorkout> =
  mongoose.models.AppleHealthWorkout ??
  mongoose.model<IAppleHealthWorkout>("AppleHealthWorkout", AppleHealthWorkoutSchema);

export default AppleHealthWorkout;

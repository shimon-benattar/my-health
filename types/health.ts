export interface RangeValue {
  min: number;
  max: number;
}

export interface HealthEntryInput {
  date: Date;
  sportType?: string | null;
  workoutType?: string | null;
  workoutDurationMinutes?: number | null;
  sourceType?: "csv" | "apple-health";
  sourceFile?: string | null;
  activeCalories: number | null;
  cardioFitness: number | null;
  heartRate: RangeValue | null;
  hrv: RangeValue | null;
  restingHeartRate: number | null;
  sleep: number | null; // total minutes
  steps: number | null;
}

export interface ImportedDataPoint {
  date: string;
  action: "inserted" | "updated";
  pulledAt: string;
  sourceType: "csv" | "apple-health";
  sourceFile: string | null;
}

export interface IngestionResult {
  requestId?: string;
  inserted: number;
  updated: number;
  skipped: number;
  unchanged: number;
  dateRange: { from: string; to: string } | null;
  pulled: ImportedDataPoint[];
}

/** Shape of a MongoDB HealthEntry document after `.lean()` */
export interface HealthEntryDoc {
  _id: string;
  date: Date;
  sportType?: string | null;
  workoutType?: string | null;
  workoutDurationMinutes?: number | null;
  sourceType?: "csv" | "apple-health";
  sourceFile?: string | null;
  importedAt?: Date | string | null;
  activeCalories: number | null;
  cardioFitness: number | null;
  heartRate: RangeValue | null;
  hrv: RangeValue | null;
  restingHeartRate: number | null;
  sleep: number | null;
  steps: number | null;
}

export interface UserProfile {
  name: string;
  birthdate: string; // DD/MM/YYYY
  weightKg: number;
  heightCm: number;
  updatedAt?: string;
}

export interface DashboardMetricsResponse {
  entries: HealthEntryDoc[];
  workouts?: DashboardWorkoutDoc[];
  readiness: number;
  readinessTrend: number[];
  profile?: UserProfile | null;
  sportSummary?: Record<
    string,
    {
      sessions: number;
      totalCalories: number;
      totalSteps: number;
      peakHeartRateMax: number | null;
    }
  >;
}

export interface DashboardWorkoutDoc {
  _id: string;
  externalId: string;
  workoutType: string;
  startDate: Date | string;
  endDate: Date | string;
  durationMinutes: number | null;
  totalEnergyBurned: number | null;
  totalDistance: number | null;
  routeCorrelation?: {
    matched: boolean;
    confidence: number;
    matchReason: string;
  } | null;
}

export interface AppleHealthImportCounts {
  recordsProcessed: number;
  workoutsProcessed: number;
  routesFound: number;
  routesMatched: number;
  unmatchedWorkouts: number;
  skipped: number;
  inserted: number;
  updated: number;
}

export interface AppleHealthUnmatchedWorkout {
  workoutType: string;
  startDate: string;
  endDate: string;
  reason: string;
}

export interface AppleHealthImportResult {
  requestId: string;
  status: "ok";
  counts: AppleHealthImportCounts;
  warnings: string[];
  sampleUnmatchedWorkouts: AppleHealthUnmatchedWorkout[];
}

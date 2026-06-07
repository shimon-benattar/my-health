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

export interface WorkoutStatSummary {
  avg: number | null;
  min: number | null;
  max: number | null;
  sum: number | null;
}

export interface DashboardWorkoutStats {
  heartRate?: WorkoutStatSummary | null;
  distanceKm?: number | null;
  activeCalories?: number | null;
  stepCount?: number | null;
  runningSpeedKmh?: WorkoutStatSummary | null;
  runningStrideM?: WorkoutStatSummary | null;
  runningGroundContactMs?: WorkoutStatSummary | null;
  runningPowerW?: WorkoutStatSummary | null;
  runningVerticalOscillationCm?: WorkoutStatSummary | null;
  elevationAscendedCm?: number | null;
  averageMETs?: number | null;
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
  stats?: DashboardWorkoutStats | null;
  routeSummary?: {
    distanceEstimateMeters: number | null;
    pointCount: number;
    firstTimestamp: Date | string | null;
    lastTimestamp: Date | string | null;
  } | null;
  routeCorrelation?: {
    matched: boolean;
    confidence: number;
    matchReason: string;
  } | null;
  kmSplits?: Array<{
    kmIndex: number;
    distanceKm: number;
    paceMinPerKm: number | null;
    avgHeartRate: number | null;
    maxHeartRate: number | null;
  }> | null;
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

export interface RangeValue {
  min: number;
  max: number;
}

export interface HealthEntryInput {
  date: Date;
  sportType?: string | null;
  activeCalories: number | null;
  cardioFitness: number | null;
  heartRate: RangeValue | null;
  hrv: RangeValue | null;
  restingHeartRate: number | null;
  sleep: number | null; // total minutes
  steps: number | null;
}

export interface IngestionResult {
  inserted: number;
  updated: number;
  skipped: number;
  dateRange: { from: string; to: string } | null;
}

/** Shape of a MongoDB HealthEntry document after `.lean()` */
export interface HealthEntryDoc {
  _id: string;
  date: Date;
  sportType?: string | null;
  activeCalories: number | null;
  cardioFitness: number | null;
  heartRate: RangeValue | null;
  hrv: RangeValue | null;
  restingHeartRate: number | null;
  sleep: number | null;
  steps: number | null;
}

export interface DashboardMetricsResponse {
  entries: HealthEntryDoc[];
  readiness: number;
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

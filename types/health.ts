export interface RangeValue {
  min: number;
  max: number;
}

export interface HealthEntryInput {
  date: Date;
  activeCalories: number | null;
  cardioFitness: number | null;
  heartRate: RangeValue | null;
  hrv: RangeValue | null;
  restingHeartRate: number | null;
  sleep: number | null; // total minutes
  steps: number | null;
}

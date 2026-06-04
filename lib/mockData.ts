export interface SportSession {
  date: string;
  peakHeartRate: number;
  calories: number;
  steps: number;
  durationMinutes?: number;
}

const MOCK_SESSIONS: Record<string, SportSession[]> = {
  running: [
    { date: "2026-05-24", peakHeartRate: 168, calories: 590, steps: 12400, durationMinutes: 28 },
    { date: "2026-05-26", peakHeartRate: 171, calories: 640, steps: 13200, durationMinutes: 31 },
    { date: "2026-05-29", peakHeartRate: 165, calories: 560, steps: 11800, durationMinutes: 27 },
    { date: "2026-06-01", peakHeartRate: 173, calories: 680, steps: 14100, durationMinutes: 33 },
    { date: "2026-06-03", peakHeartRate: 170, calories: 615, steps: 12800, durationMinutes: 30 },
  ],
  padel: [
    { date: "2026-05-23", peakHeartRate: 176, calories: 520, steps: 7600, durationMinutes: 38 },
    { date: "2026-05-25", peakHeartRate: 182, calories: 570, steps: 8300, durationMinutes: 42 },
    { date: "2026-05-28", peakHeartRate: 179, calories: 550, steps: 8100, durationMinutes: 39 },
    { date: "2026-05-31", peakHeartRate: 185, calories: 605, steps: 8700, durationMinutes: 44 },
    { date: "2026-06-02", peakHeartRate: 181, calories: 575, steps: 8400, durationMinutes: 41 },
  ],
};

export function getMockSportData(sport: string): SportSession[] {
  const key = sport.trim().toLowerCase();
  return MOCK_SESSIONS[key] ?? [];
}

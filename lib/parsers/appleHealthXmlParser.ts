import sax from "sax";

export interface AppleHealthRecord {
  type: string;
  value: string;
  unit: string | null;
  sourceName: string | null;
  sourceVersion: string | null;
  startDate: Date;
  endDate: Date;
}

export interface WorkoutStatSummary {
  avg: number | null;
  min: number | null;
  max: number | null;
  sum: number | null;
}

export interface AppleHealthWorkoutStats {
  heartRate?: WorkoutStatSummary;
  distanceKm?: number | null;          // HKQuantityTypeIdentifierDistanceWalkingRunning sum
  activeCalories?: number | null;      // HKQuantityTypeIdentifierActiveEnergyBurned sum
  stepCount?: number | null;           // HKQuantityTypeIdentifierStepCount sum
  runningSpeedKmh?: WorkoutStatSummary; // HKQuantityTypeIdentifierRunningSpeed
  runningStrideM?: WorkoutStatSummary;  // HKQuantityTypeIdentifierRunningStrideLength
  runningGroundContactMs?: WorkoutStatSummary; // HKQuantityTypeIdentifierRunningGroundContactTime
  runningPowerW?: WorkoutStatSummary;   // HKQuantityTypeIdentifierRunningPower
  runningVerticalOscillationCm?: WorkoutStatSummary; // HKQuantityTypeIdentifierRunningVerticalOscillation
  elevationAscendedCm?: number | null; // MetadataEntry HKElevationAscended
  averageMETs?: number | null;         // MetadataEntry HKAverageMETs
}

export interface AppleHealthWorkout {
  workoutActivityType: string;
  startDate: Date;
  endDate: Date;
  durationMinutes: number | null;
  totalEnergyBurned: number | null;
  totalDistance: number | null;
  sourceName: string | null;
  sourceVersion: string | null;
  stats: AppleHealthWorkoutStats;
}

export interface AppleHealthParseResult {
  records: AppleHealthRecord[];
  workouts: AppleHealthWorkout[];
  skippedRecords: number;
  skippedWorkouts: number;
}

export interface AppleHealthStreamHandlers {
  onRecord?: (record: AppleHealthRecord) => void;
  onWorkout?: (workout: AppleHealthWorkout) => void;
}

export interface AppleHealthStreamParseResult {
  recordsProcessed: number;
  workoutsProcessed: number;
  skippedRecords: number;
  skippedWorkouts: number;
  recordTypeCounts: Record<string, number>;
  workoutTypeCounts: Record<string, number>;
}

function parseAppleDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  // Apple export format is usually: 2026-06-01 08:00:00 +0300
  const normalized = raw.replace(/^([0-9-]+)\s([0-9:]+)\s([+-][0-9]{4})$/, "$1T$2$3");
  const fallback = new Date(normalized);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function parseNumeric(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

function parseRecordNode(node: sax.Tag): AppleHealthRecord | null {
  const attrs = node.attributes as Record<string, string>;
  const startDate = parseAppleDate(attrs.startDate);
  const endDate = parseAppleDate(attrs.endDate);
  if (!startDate || !endDate || !attrs.type) {
    return null;
  }

  return {
    type: attrs.type,
    value: attrs.value ?? "",
    unit: attrs.unit ?? null,
    sourceName: attrs.sourceName ?? null,
    sourceVersion: attrs.sourceVersion ?? null,
    startDate,
    endDate,
  };
}

function parseWorkoutNode(node: sax.Tag): AppleHealthWorkout | null {
  const attrs = node.attributes as Record<string, string>;
  const startDate = parseAppleDate(attrs.startDate);
  const endDate = parseAppleDate(attrs.endDate);
  if (!startDate || !endDate || !attrs.workoutActivityType) {
    return null;
  }

  let durationMinutes = parseNumeric(attrs.duration);
  if (durationMinutes !== null && attrs.durationUnit?.toLowerCase() === "s") {
    durationMinutes = durationMinutes / 60;
  }
  if (durationMinutes !== null && attrs.durationUnit?.toLowerCase().includes("hour")) {
    durationMinutes = durationMinutes * 60;
  }

  return {
    workoutActivityType: attrs.workoutActivityType,
    startDate,
    endDate,
    durationMinutes,
    totalEnergyBurned: parseNumeric(attrs.totalEnergyBurned),
    totalDistance: parseNumeric(attrs.totalDistance),
    sourceName: attrs.sourceName ?? null,
    sourceVersion: attrs.sourceVersion ?? null,
    stats: {},
  };
}

function parseStatSummary(attrs: Record<string, string>): WorkoutStatSummary {
  return {
    avg: parseNumeric(attrs.average),
    min: parseNumeric(attrs.minimum),
    max: parseNumeric(attrs.maximum),
    sum: parseNumeric(attrs.sum),
  };
}

function applyWorkoutStatistics(workout: AppleHealthWorkout, attrs: Record<string, string>): void {
  const type = attrs.type ?? "";
  const stat = parseStatSummary(attrs);

  switch (type) {
    case "HKQuantityTypeIdentifierHeartRate":
      workout.stats.heartRate = stat;
      break;
    case "HKQuantityTypeIdentifierDistanceWalkingRunning":
      workout.stats.distanceKm = stat.sum;
      break;
    case "HKQuantityTypeIdentifierActiveEnergyBurned":
      workout.stats.activeCalories = stat.sum;
      break;
    case "HKQuantityTypeIdentifierStepCount":
      workout.stats.stepCount = stat.sum;
      break;
    case "HKQuantityTypeIdentifierRunningSpeed":
      workout.stats.runningSpeedKmh = stat;
      break;
    case "HKQuantityTypeIdentifierRunningStrideLength":
      workout.stats.runningStrideM = stat;
      break;
    case "HKQuantityTypeIdentifierRunningGroundContactTime":
      workout.stats.runningGroundContactMs = stat;
      break;
    case "HKQuantityTypeIdentifierRunningPower":
      workout.stats.runningPowerW = stat;
      break;
    case "HKQuantityTypeIdentifierRunningVerticalOscillation":
      workout.stats.runningVerticalOscillationCm = stat;
      break;
    default:
      break;
  }
}

function applyWorkoutMetadata(workout: AppleHealthWorkout, attrs: Record<string, string>): void {
  const key = attrs.key ?? "";
  const value = attrs.value ?? "";

  if (key === "HKElevationAscended") {
    // value like "4250 cm" or "42.5 m"
    const match = value.match(/^([\d.]+)\s*(cm|m)?/i);
    if (match) {
      let cm = parseNumeric(match[1]);
      if (cm !== null && match[2]?.toLowerCase() === "m") cm *= 100;
      workout.stats.elevationAscendedCm = cm;
    }
  } else if (key === "HKAverageMETs") {
    const match = value.match(/^([\d.]+)/);
    if (match) workout.stats.averageMETs = parseNumeric(match[1]);
  }
}

function createSaxParserState(handlers: AppleHealthStreamHandlers) {
  const state: AppleHealthStreamParseResult = {
    recordsProcessed: 0,
    workoutsProcessed: 0,
    skippedRecords: 0,
    skippedWorkouts: 0,
    recordTypeCounts: {},
    workoutTypeCounts: {},
  };

  // Track current open Workout so we can attach child WorkoutStatistics/MetadataEntry
  let currentWorkout: AppleHealthWorkout | null = null;

  const parser = sax.createStream(true, { trim: true, normalize: true });
  parser.on("opentag", (node: sax.Tag) => {
    const attrs = node.attributes as Record<string, string>;

    if (node.name === "Record") {
      const record = parseRecordNode(node);
      if (!record) {
        state.skippedRecords++;
        return;
      }
      state.recordsProcessed++;
      state.recordTypeCounts[record.type] = (state.recordTypeCounts[record.type] ?? 0) + 1;
      handlers.onRecord?.(record);
      return;
    }

    if (node.name === "Workout") {
      const workout = parseWorkoutNode(node);
      if (!workout) {
        state.skippedWorkouts++;
        currentWorkout = null;
        return;
      }
      // Don't emit yet — collect child stats first
      currentWorkout = workout;
      return;
    }

    if (node.name === "WorkoutStatistics" && currentWorkout) {
      applyWorkoutStatistics(currentWorkout, attrs);
      return;
    }

    if (node.name === "MetadataEntry" && currentWorkout) {
      applyWorkoutMetadata(currentWorkout, attrs);
      return;
    }
  });

  parser.on("closetag", (name: string) => {
    if (name === "Workout" && currentWorkout) {
      state.workoutsProcessed++;
      state.workoutTypeCounts[currentWorkout.workoutActivityType] =
        (state.workoutTypeCounts[currentWorkout.workoutActivityType] ?? 0) + 1;
      handlers.onWorkout?.(currentWorkout);
      currentWorkout = null;
    }
  });

  return { parser, state };
}

export async function parseAppleHealthXmlStream(
  input: NodeJS.ReadableStream,
  handlers: AppleHealthStreamHandlers
): Promise<AppleHealthStreamParseResult> {
  const { parser, state } = createSaxParserState(handlers);

  return await new Promise<AppleHealthStreamParseResult>((resolve, reject) => {
    parser.on("error", (err) => reject(err));
    parser.on("end", () => resolve(state));
    input.pipe(parser);
  });
}

export function parseAppleHealthXml(xmlText: string): AppleHealthParseResult {
  const records: AppleHealthRecord[] = [];
  const workouts: AppleHealthWorkout[] = [];
  const { parser, state } = createSaxParserState({
    onRecord: (record) => records.push(record),
    onWorkout: (workout) => workouts.push(workout),
  });

  parser.write(xmlText);
  parser.end();

  return {
    records,
    workouts,
    skippedRecords: state.skippedRecords,
    skippedWorkouts: state.skippedWorkouts,
  };
}

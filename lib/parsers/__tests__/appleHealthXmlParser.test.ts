import { describe, it, expect } from "vitest";
import { parseAppleHealthXml } from "@/lib/parsers/appleHealthXmlParser";

const XML_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<HealthData>
  <Record type="HKQuantityTypeIdentifierStepCount" value="1200" unit="count" sourceName="iPhone" sourceVersion="17" startDate="2026-06-01 08:00:00 +0000" endDate="2026-06-01 08:05:00 +0000" />
  <Record type="HKQuantityTypeIdentifierHeartRate" value="95" unit="count/min" sourceName="Watch" sourceVersion="10" startDate="2026-06-01 08:00:00 +0000" endDate="2026-06-01 08:00:10 +0000" />
  <Record type="HKQuantityTypeIdentifierStepCount" value="999" unit="count" sourceName="iPhone" sourceVersion="17" startDate="not-a-date" endDate="2026-06-01 09:00:00 +0000" />
  <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="45" durationUnit="min" totalDistance="8.3" totalEnergyBurned="500" sourceName="Watch" sourceVersion="10" startDate="2026-06-01 07:30:00 +0000" endDate="2026-06-01 08:15:00 +0000" />
</HealthData>`;

describe("parseAppleHealthXml", () => {
  it("extracts records and workouts and counts skipped nodes", () => {
    const parsed = parseAppleHealthXml(XML_FIXTURE);

    expect(parsed.records).toHaveLength(2);
    expect(parsed.workouts).toHaveLength(1);
    expect(parsed.skippedRecords).toBe(1);
    expect(parsed.skippedWorkouts).toBe(0);

    expect(parsed.records[0].type).toBe("HKQuantityTypeIdentifierStepCount");
    expect(parsed.workouts[0].workoutActivityType).toBe("HKWorkoutActivityTypeRunning");
    expect(parsed.workouts[0].durationMinutes).toBe(45);
  });
});

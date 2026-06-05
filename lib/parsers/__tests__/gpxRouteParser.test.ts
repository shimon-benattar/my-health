import { describe, it, expect } from "vitest";
import { parseGpxRoute } from "@/lib/parsers/gpxRouteParser";

const GPX_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Apple Health Export" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <trkseg>
      <trkpt lat="31.9" lon="34.9"><time>2026-06-01T08:00:00Z</time></trkpt>
      <trkpt lat="31.91" lon="34.91"><time>2026-06-01T08:05:00Z</time></trkpt>
    </trkseg>
  </trk>
</gpx>`;

describe("parseGpxRoute", () => {
  it("parses route summary metadata", () => {
    const parsed = parseGpxRoute("workout-routes/route_1.gpx", GPX_FIXTURE);

    expect(parsed.routePath).toBe("workout-routes/route_1.gpx");
    expect(parsed.pointCount).toBe(2);
    expect(parsed.firstTimestamp?.toISOString()).toBe("2026-06-01T08:00:00.000Z");
    expect(parsed.lastTimestamp?.toISOString()).toBe("2026-06-01T08:05:00.000Z");
    expect(parsed.boundingBox).toEqual({
      minLat: 31.9,
      maxLat: 31.91,
      minLon: 34.9,
      maxLon: 34.91,
    });
    expect(parsed.distanceEstimateMeters).not.toBeNull();
  });
});

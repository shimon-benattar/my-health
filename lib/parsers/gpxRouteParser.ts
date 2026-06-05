import sax from "sax";

export interface GpxRouteSummary {
  routePath: string;
  pointCount: number;
  firstTimestamp: Date | null;
  lastTimestamp: Date | null;
  boundingBox: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  } | null;
  distanceEstimateMeters: number | null;
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusMeters = 6371000;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMeters * c;
}

export function parseGpxRoute(routePath: string, gpxXml: string): GpxRouteSummary {
  const parser = sax.parser(true, { trim: true, normalize: true });

  let pointCount = 0;
  let firstTimestamp: Date | null = null;
  let lastTimestamp: Date | null = null;

  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let minLon = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;

  let inTrkpt = false;
  let collectingTime = false;
  let currentTimeText = "";
  let lastPoint: { lat: number; lon: number } | null = null;
  let distanceEstimateMeters = 0;

  parser.onopentag = (node) => {
    if (node.name === "trkpt") {
      const attrs = node.attributes as Record<string, string>;
      const lat = Number.parseFloat(attrs.lat ?? "");
      const lon = Number.parseFloat(attrs.lon ?? "");
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        inTrkpt = false;
        return;
      }

      inTrkpt = true;
      pointCount++;

      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);

      if (lastPoint) {
        distanceEstimateMeters += haversineMeters(lastPoint.lat, lastPoint.lon, lat, lon);
      }
      lastPoint = { lat, lon };
      return;
    }

    if (node.name === "time" && inTrkpt) {
      collectingTime = true;
      currentTimeText = "";
    }
  };

  parser.ontext = (text) => {
    if (collectingTime) {
      currentTimeText += text;
    }
  };

  parser.onclosetag = (tagName) => {
    if (tagName === "time" && collectingTime) {
      collectingTime = false;
      const maybeDate = new Date(currentTimeText);
      if (!Number.isNaN(maybeDate.getTime())) {
        if (!firstTimestamp) firstTimestamp = maybeDate;
        lastTimestamp = maybeDate;
      }
      return;
    }

    if (tagName === "trkpt") {
      inTrkpt = false;
    }
  };

  parser.write(gpxXml).close();

  return {
    routePath,
    pointCount,
    firstTimestamp,
    lastTimestamp,
    boundingBox:
      pointCount > 0
        ? {
            minLat,
            maxLat,
            minLon,
            maxLon,
          }
        : null,
    distanceEstimateMeters: pointCount > 1 ? distanceEstimateMeters : null,
  };
}

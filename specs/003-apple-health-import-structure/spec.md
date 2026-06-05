# Spec: Apple Health Import Structure

**Spec ID**: 003-apple-health-import-structure  
**Status**: Active  
**Branch**: 003-apple-health-import-structure  
**Created**: 2026-06-04

---

## Objective

Replace the current CSV-first import flow and schema assumptions with an Apple Health export ingestion pipeline based on extracted export.zip structure.

The new ingestion must use:
- export.xml as the primary source of metrics and workouts
- workout-routes directory for GPX route data
- export_cda.xml ignored

---

## Input Structure

Expected extracted folder contents:
- export.xml
- workout-routes with 72+ GPX files
- export_cda.xml (ignored)

System behavior:
- Parse export.xml for Record and Workout elements
- Parse GPX files from workout-routes
- Correlate workouts and routes by timestamp windows
- Persist with upsert semantics

---

## User Stories

| ID | Story |
|----|-------|
| US1 | As a user, I can import an extracted Apple Health folder and the system ingests records from export.xml |
| US2 | As a user, workout sessions are correlated with GPS routes when a matching GPX route exists |
| US3 | As a user, route-linked workouts are stored so dashboard analytics can include route-derived data later |
| US4 | As a user, irrelevant files like export_cda.xml do not affect ingestion |

---

## Functional Requirements

### FR1: XML Parsing
- Parser implementation must use Python xml.etree.ElementTree style streaming behavior as design principle for memory efficiency, adapted to the app runtime implementation.
- Process export.xml in a memory-conscious way.
- Extract at minimum:
  - Record elements required for daily metrics
  - Workout elements required for session-level analytics

### FR2: Route Correlation
- Load GPX metadata from workout-routes.
- For each Workout from export.xml:
  - Match GPX by startDate/endDate proximity.
  - Matching strategy must be deterministic and documented.
  - If multiple candidates exist, choose nearest by absolute time delta.

### FR3: Persistence
- Upsert records/workouts into MongoDB.
- Workout schema must support route reference storage:
  - route file path and/or encoded route content
  - correlation quality metadata (for audit and debugging)

### FR4: Ignore Unsupported File
- export_cda.xml must be ignored explicitly.

### FR5: Import Result Contract
- Import response should include:
  - total records processed
  - workouts processed
  - routes found
  - routes matched
  - unmatched workouts
  - skipped/invalid rows

---

## Correlation Rules

Given Workout W with startDate and endDate:
1. Candidate GPX files are those whose first/last trackpoint timestamps overlap workout time window, or are within a configurable tolerance window.
2. Default tolerance target: plus/minus 10 minutes at both boundaries.
3. Primary score:
   - absolute difference between workout start and GPX first point
   - plus absolute difference between workout end and GPX last point
4. Lowest score wins.
5. If score exceeds rejection threshold, mark workout as unmatched.

---

## Data Model Changes

Add or update schema fields for workout-level data:
- workoutType
- startDate
- endDate
- durationMinutes
- totalEnergyBurned
- totalDistance
- sourceName
- sourceVersion
- routePath optional
- routeSummary optional
  - pointCount
  - firstTimestamp
  - lastTimestamp
  - boundingBox
  - distanceEstimateMeters optional
- routeCorrelation
  - matched boolean
  - confidence score
  - matchReason

---

## API Changes

### Replace current import endpoint behavior
- Existing CSV import route becomes legacy or is replaced by a new Apple Health import route.
- New route should accept extracted folder path or uploaded package strategy as decided in implementation.

Recommended route:
- POST /api/health/import/apple-health

Response shape:
- status
- counts object
- warnings array
- sample unmatched workouts for diagnostics

---

## Non-Goals

- Do not ingest export_cda.xml.
- Do not require ML/LLM matching for route correlation.
- Do not block import on unmatched routes; continue with warnings.

---

## Testing Requirements

- Unit tests for export.xml parsing
- Unit tests for GPX route metadata parsing
- Unit tests for correlation scorer and tie-breaking
- API tests for successful import with mixed matched/unmatched workouts
- Regression tests for malformed XML and malformed GPX
- Performance test with realistic export size to ensure no memory blow-up

---

## Migration Notes

- Existing CSV-based ingestion remains temporarily available behind a legacy route or feature flag until full migration is complete.
- Dashboard readers must tolerate both legacy and new records during migration.

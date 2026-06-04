# Spec: Interactive Dashboard (Phase 5 – Master)

**Spec ID**: `002-interactive-dashboard`  
**Status**: Active  
**Branch**: `002-interactive-dashboard`  
**Created**: 2026-06-04

---

## Objective

Build an interactive dashboard visualising `DailyMetric` data with deep-dive analysis for general health and sport-specific disciplines.

---

## User Stories

| ID  | Story |
|-----|-------|
| US1 | As a user, I can view trend charts for my core health metrics (VO2 Max, RHR, HRV, Sleep) |
| US2 | As a user, I can see a Readiness Score derived from HRV + yesterday's sleep |
| US3 | As a user, each chart shows a tooltip explaining the metric, its trend meaning, and actionable recommendations |
| US4 | As a user, I can switch to a "Sport Performance" tab to view metrics grouped by sport type |
| US5 | As a user, sport sections show a "Peak Intensity" trend and a text label for the load type |
| US6 | As a user, sport sections render sensible placeholder charts even when the database has no data for that sport |

---

## 1. Global Metrics (The Engine Room)

### 1.1 Trend Charts
Display as line charts (one per metric):

| Metric | Field | Unit |
|--------|-------|------|
| VO2 Max | `cardioFitness` | mL/min·kg |
| Resting Heart Rate | `restingHeartRate` | bpm |
| HRV | `hrv.max` | ms |
| Sleep | `sleep` | minutes (render as h/m) |

### 1.2 Readiness Score
- Formula: normalise current `hrv.max` (0–100 scale, reference range 20–80 ms) + yesterday's `sleep` duration (0–100 scale, reference 300–540 min). Average the two.
- Display as a circular gauge (0–100) with colour bands: 0–39 = red, 40–69 = amber, 70–100 = green.

### 1.3 Contextual Tooltips
Every chart card has an **ⓘ** icon. Clicking/hovering opens a tooltip with three sections:
- **Why** — plain-language explanation of the metric
- **Trend Meaning** — what an upward or downward trend signals
- **Actionable Recommendations** — what the user can do

Tooltip content is defined in a static `lib/tooltipContent.ts` config file (not fetched from DB).

---

## 2. Sport-Specific Section

### 2.1 Overview tab
Default tab: renders all four trend charts + Readiness Score.

### 2.2 Sport Performance tab
Tabs: `[Overview] [Sport Performance]`

Sport sections (initial set: **Running**, **Padel**):

| Section | Metrics shown | Load label |
|---------|--------------|------------|
| Running | Peak HR per session, HR efficiency trend | "Aerobic Endurance" |
| Padel   | Peak HR per session, session frequency | "Explosive Interval" |

- **Aggregated stats**: total calories and total steps filtered by sport type (from `sportType` field on entries)
- **Intensity Profiling**: peak `heartRate.max` per session as a bar chart
- **Trend line**: 7-session rolling average of Peak HR

### 2.3 Mock Data Service
`lib/mockData.ts` exports `getMockSportData(sport: string): SportSession[]`.  
The dashboard uses real data when available; falls back to `getMockSportData()` when the DB returns an empty result set for a sport.  
The UI clearly labels mock data with a "Sample Data" badge.

---

## 3. API Changes

### `GET /api/dashboard/metrics`
New endpoint. Query params:

| Param | Type | Description |
|-------|------|-------------|
| `range` | `7d \| 30d \| 90d \| all` | Date window (default `30d`) |
| `sportType` | string (optional) | Filter by sport |

Response shape:
```ts
{
  entries: HealthEntryDoc[];
  readiness: number; // 0–100
}
```

---

## 4. Component Architecture

```
app/dashboard/page.tsx          ← tabs: Overview / Sport Performance
components/dashboard/
  MetricChart.tsx               ← reusable line/bar chart card + tooltip
  ReadinessGauge.tsx            ← circular gauge
  SportSection.tsx              ← per-sport card (real or mock data)
  TooltipInfo.tsx               ← ⓘ popover component
lib/
  tooltipContent.ts             ← static tooltip text config
  mockData.ts                   ← MockDataService for empty sport sets
  readiness.ts                  ← readiness score calculation (pure fn)
```

---

## 5. Constraints

- Charts: use **Recharts** (already lightweight; add as dependency).
- No external analytics SDK.
- Readiness formula must live in a pure function (`lib/readiness.ts`) so it is unit-testable.
- All numeric casts must follow existing `parseNumber` patterns (filter `'-'`).
- `MockDataService` must be tree-shaken in production (import only in dashboard route, guarded by empty-check).

---

## 6. Testing Requirements

- Unit tests for `lib/readiness.ts` (edge cases: missing HRV, 0-minute sleep, max values)
- Unit tests for `lib/mockData.ts` (returns correct shape, correct sport name)
- Component tests for `MetricChart` (renders with data, renders empty state)
- Component tests for `ReadinessGauge` (colour bands at 39, 40, 69, 70)
- Component test for `SportSection` (shows "Sample Data" badge when mock data used)
- API tests for `GET /api/dashboard/metrics` (default range, sport filter, empty sport → still 200)

---

## References

- Existing patterns: `lib/parsers/csvParser.ts`, `app/api/health/upload/route.ts`
- Mongoose upsert pattern: `lib/models/HealthEntry.ts`
- Numeric cast pattern: `parseNumber` in `lib/parsers/csvParser.ts`

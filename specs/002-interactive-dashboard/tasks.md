# Tasks: Interactive Dashboard (Phase 5 – Master)

**Input**: `specs/002-interactive-dashboard/spec.md`  
**Branch**: `002-interactive-dashboard`

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with other [P]-tagged tasks
- **[Story]**: US1–US6 (see spec.md)

---

## Phase 1: Foundation & API

- [x] T001 [P] Create branch `002-interactive-dashboard` from `main`
- [x] T002 [P] Install `recharts` dependency
- [x] T003 Create `GET /api/dashboard/metrics` route — supports `range` and `sportType` query params; returns `{ entries, readiness }`
- [x] T004 [P] Create `lib/readiness.ts` — pure `calcReadiness(hrvMax, sleepMinutes)` function (US2)

---

## Phase 2: Core Library Modules

- [x] T005 [P] Create `lib/tooltipContent.ts` — static tooltip definitions for VO2Max, RHR, HRV, Sleep (US3)
- [x] T006 [P] Create `lib/mockData.ts` — `getMockSportData(sport)` returning `SportSession[]` shape for Running and Padel (US6)

---

## Phase 3: Shared UI Components

- [x] T007 Create `components/dashboard/TooltipInfo.tsx` — ⓘ popover with Why / Trend Meaning / Recommendations sections (US3)
- [x] T008 Create `components/dashboard/MetricChart.tsx` — reusable Recharts line/bar chart card; accepts `data`, `dataKey`, `label`, `unit`, `tooltipKey`; shows empty state (US1, US3)
- [x] T009 Create `components/dashboard/ReadinessGauge.tsx` — circular gauge 0–100 with red/amber/green bands (US2)
- [x] T010 Create `components/dashboard/SportSection.tsx` — per-sport card: peak HR bar chart, rolling-avg trend, aggregated stats, "Sample Data" badge when using mock (US4, US5, US6)

---

## Phase 4: Dashboard Page

- [x] T011 Update `app/dashboard/page.tsx` — add tab switcher [Overview] [Sport Performance]; fetch from `/api/dashboard/metrics`; wire all components (US1–US6)

---

## Phase 5: Tests

- [x] T012 [P] Unit tests for `lib/readiness.ts` — edge cases: missing HRV, zero sleep, max values, boundary values (39/40, 69/70)
- [x] T013 [P] Unit tests for `lib/mockData.ts` — correct shape, correct sport names
- [x] T014 [P] Component tests for `MetricChart` — renders chart with data, renders empty state
- [x] T015 [P] Component tests for `ReadinessGauge` — colour bands at boundaries 39, 40, 69, 70
- [x] T016 [P] Component test for `SportSection` — "Sample Data" badge visible when mock data used; hidden when real data present
- [x] T017 API tests for `GET /api/dashboard/metrics` — default range, `sportType` filter, empty sport still returns 200

---

## Phase 6: Deployment

- [x] T018 Run full test suite; confirm all pass
- [ ] T019 Push branch, open PR → merge to `main`
- [ ] T020 Confirm Vercel production deploy is ● Ready and routes `/dashboard` render new tabs

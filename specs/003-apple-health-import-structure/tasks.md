# Tasks: Apple Health Import Structure

**Input**: specs/003-apple-health-import-structure/spec.md  
**Branch**: 003-apple-health-import-structure

## Format: [ID] [P?] [Story] Description

- [P]: Can run in parallel with other P-tagged tasks
- [Story]: US1-US4 from spec

---

## Phase 1: Discovery and Schema Prep

- [ ] T001 [P] Audit current ingestion flow and identify all CSV-only assumptions in API, parser, and UI
- [ ] T002 [P] Design new import contracts and shared TypeScript types for Apple Health import payload and result summary
- [ ] T003 Extend workout-related Mongo schemas to support route metadata and correlation status fields
- [ ] T004 Create migration-safe read adapters so dashboard can read both legacy and new workout records

---

## Phase 2: XML and GPX Parsers

- [ ] T005 Implement export.xml parser module with memory-efficient iterative traversal
- [ ] T006 Implement GPX parser module for workout-routes files (timestamps, point count, bounds, optional distance)
- [ ] T007 [P] Add parser validation and error normalization utilities for malformed XML/GPX

---

## Phase 3: Correlation Engine

- [ ] T008 Implement workout-to-route correlation scorer using start/end timestamp deltas
- [ ] T009 Add deterministic tie-break and rejection threshold logic
- [ ] T010 Produce correlation audit output (matched, unmatched, reason, confidence)

---

## Phase 4: API and Persistence

- [ ] T011 Create POST /api/health/import/apple-health route and wire parser plus correlation pipeline
- [ ] T012 Implement upsert persistence for records and workouts including routePath or routeSummary
- [ ] T013 Explicitly ignore export_cda.xml in import workflow with informational warning
- [ ] T014 Return detailed import summary counts and sample warnings in API response

---

## Phase 5: UI and Integration

- [ ] T015 Update landing import UX to support Apple Health extracted structure (or upload strategy)
- [ ] T016 Add import summary visualization for matched routes and unmatched workouts
- [ ] T017 Ensure dashboard reads new workout fields without breaking legacy views

---

## Phase 6: Tests

- [ ] T018 [P] Unit tests for export.xml parser
- [ ] T019 [P] Unit tests for GPX parser
- [ ] T020 [P] Unit tests for correlation scoring and threshold behavior
- [ ] T021 API integration tests for mixed matched/unmatched imports
- [ ] T022 Regression tests for malformed XML and GPX
- [ ] T023 Performance-oriented test using realistic export sample size

---

## Phase 7: Rollout

- [ ] T024 Run full test suite and build verification
- [ ] T025 Deploy to production and verify import end-to-end on real Apple Health sample
- [ ] T026 Mark legacy CSV route as deprecated (or keep behind feature flag) after successful validation

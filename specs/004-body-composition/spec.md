# 004 Body Composition

## Goal
Import smart-scale `.xlsx` exports and show weight / fat / muscle analysis with an explanation of every parameter and what it means for the user. Sits in its own tab between Overview and Sport Performance, with a snapshot card on Overview.

## Data
- Source: scale export (rows 1–3 metadata, row 4 header, rows 5+ readings, `MM/DD/YYYY` + `HH:MM`). 17 metrics plus date/time; see `types/body.ts` (`BODY_METRIC_KEYS`).
- Stored in `BodyMeasurement` (unique on `measuredAt`, wall-clock time kept as UTC digits). Re-importing merges by time, never deletes.

## Behaviour
- `POST /api/body/import` (.xlsx, max 4 MB) and `GET /api/body/measurements?range=all|90d|30d|7d`.
- Parser: `lib/parsers/scaleXlsxParser.ts` (jszip + sax, header-name aliases, warnings for missing columns or inconsistent derived values).
- Knowledge: `lib/bodyCompositionKnowledge.ts`. Reference ranges carry a source and a confidence (guideline / reference-table / vendor-specific). Metrics without a reliable range are shown but not graded.
- Insights: `lib/bodyCompositionInsights.ts`. Trends need 3+ readings; changes under a per-metric noise threshold read as "stable"; slope per week from 5+. Readings from 12:00 UTC-wall-clock onwards are excluded by default (toggle available).
- No runtime LLM calls: the research is baked into the reviewed knowledge file so output is deterministic and testable.

## Known limits
- Ranges for visceral fat, water and protein are scale-brand conventions. Skeletal-muscle ranges are not graded (definitions differ; sarcopenia cut-offs need appendicular measurements).
- No goal (lose fat / build muscle) is stored yet, so "what it means for me" uses age, sex and trend only.

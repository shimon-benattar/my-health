# Tasks: Health Dashboard Initialization

**Input**: `specs/001-health-dashboard-init/spec.md` + `specs/001-health-dashboard-init/plan.md`  
**Branch**: `001-health-dashboard-init`

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with other [P]-tagged tasks
- **[Story]**: US1 = CSV upload & persistence · US2 = entries retrieval · US3 = upload UI

---

## Phase 1: Project Setup

- [x] T001 Scaffold Next.js 14 App Router project with TypeScript strict mode inside `my-health/`
- [x] T002 Install dependencies: `mongoose`, `papaparse`, `@types/papaparse`, `tailwindcss`
- [x] T003 Create `.env.local` with `MONGODB_URI` placeholder and add to `.gitignore`

---

## Phase 2: Types & Schema (US1 + US2 shared infrastructure)

- [x] T004 [P] Create `types/health.ts` — `RangeValue` and `HealthEntryInput` interfaces
- [x] T005 [P] Create `lib/db.ts` — cached Mongoose singleton connection
- [x] T006 Create `lib/models/HealthEntry.ts` — Mongoose schema with unique `date` index (depends on T004)

---

## Phase 3: CSV Parser (US1)

- [x] T007 Create `lib/parsers/csvParser.ts` — `parseDate`, `parseNumber`, `parseRange`, `parseSleep`, `parseRow`, `parseCSV` functions (depends on T004)
- [ ] T008 [P] Verify edge cases against sample CSV: single-value HRV ("58.51"), decimal heart rate ("46.22-130"), all-dash row (22/05/2026), comma-stripped steps ("1,109") ⬅ **YOU: requires live DB — see offline guide**

---

## Phase 4: Upload API Route (US1)

- [x] T009 Create `app/api/health/upload/route.ts` — `POST` handler: parse `multipart/form-data`, call `parseCSV`, upsert via `findOneAndUpdate` (depends on T005, T006, T007)
- [ ] T010 Verify idempotency: upload sample CSV twice; confirm counts `{ inserted: 32, updated: 0, skipped: 0 }` then `{ inserted: 0, updated: 0, skipped: 32 }` ⬅ **YOU: requires live DB — see offline guide**

---

## Phase 5: Entries API Route (US2)

- [x] T011 Create `app/api/health/entries/route.ts` — `GET` handler returning all documents sorted by `date` descending (depends on T005, T006)
- [ ] T012 Verify response shape: `heartRate` and `hrv` are `{ min, max }` objects; `sleep` is integer minutes; `steps` is a plain number ⬅ **YOU: requires live DB — see offline guide**

---

## Phase 6: Upload UI (US3)

- [x] T013 Create `components/UploadForm.tsx` — file input, submit handler, display `{ inserted, updated, skipped }` counts (depends on T009)
- [x] T014 Wire `UploadForm` into `app/page.tsx` dashboard home
- [x] T015 [P] Configure Tailwind CSS (`tailwind.config.ts`, `app/globals.css`)

---

## Phase 7: Deployment & Merge Gate

- [ ] T016 Set real `MONGODB_URI` in `.env.local` and confirm `npm run dev` starts without errors ⬅ **YOU**
- [ ] T017 Run T008 / T010 / T012 verification steps (curl tests against local dev server) ⬅ **YOU**
- [ ] T018 Deploy to Vercel: import GitHub repo, set `MONGODB_URI` env var, confirm production build ⬅ **YOU**
- [ ] T019 Run `speckit.checklist` constitution compliance review ⬅ **Copilot — after T017 passes**
- [ ] T020 Open PR: `001-health-dashboard-init` → `main` and merge ⬅ **YOU — after T019 passes**

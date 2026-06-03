# my-health — Copilot Workspace Instructions

## Project context
Personal health dashboard: Next.js 14 App Router + MongoDB Atlas + Vercel free tier.
Ingests Apple Health CSV exports, stores parsed data, exposes REST API.

---

## Mandatory rules for every change

### 1 — Tests are not optional
- Every new function, route handler, or component **must** ship with tests in the same PR.
- Test files live next to the code they test: `lib/foo/__tests__/foo.test.ts`, `components/__tests__/Foo.test.tsx`, `app/api/health/x/__tests__/route.test.ts`.
- Run `npm test` before committing. A failing test suite blocks merge.

### 2 — Test coverage targets
| Layer | Tool | Minimum |
|---|---|---|
| Parser / pure logic | Vitest unit tests | every public function |
| API routes (BE) | Vitest — mock `connectDB` + Mongoose model | all status codes (200, 400, 422, 500) |
| React components (FE) | Vitest + React Testing Library | render, user interactions, success/error states |
| End-to-end flows | Playwright MCP (manual or `npx playwright test`) | upload happy-path, entries display |

### 3 — Type safety
- `strict: true` is non-negotiable in `tsconfig.json`.
- No `any` or `as unknown` casts without an explanatory comment.
- All shared types live in `types/health.ts`.

### 4 — Idempotent ingestion
- Re-uploading the same CSV must produce `inserted:0, updated:0, skipped:N`.
- Deduplication key is `date` (unique index on MongoDB collection).
- `upsert: true` + field-level diff decides `updated` vs `skipped`.

### 5 — Date handling
- All dates stored as **midnight UTC** using `Date.UTC(year, month-1, day)`.
- Never use `new Date(year, month-1, day)` (local timezone shifts).
- Test: `d.getUTCHours() === 0`.

### 6 — CSV parsing
- Apple Health headers contain decorative quotes (e.g. `"Active Calories" (kcal)`).
- Strip `"` from the header line **only** before passing to papaparse.
- Canonical field keys after stripping: `Active Calories (kcal)`, `Heart Rate (bpm)`, `Heart Rate Variability (ms)`, `Resting Heart Rate (bpm)`, `Sleep`, `Steps (steps)`, `Cardio Fitness (mL/min·kg)`.

### 7 — Free-tier compliance
- No paid Vercel features, no MongoDB Atlas M2+.
- No background jobs, cron, or websockets (Vercel Hobby limits).
- Serverless function memory/duration must stay under 10 s.

### 8 — Simplicity (YAGNI)
- Do not add features not in the current spec.
- Do not add error handling for scenarios that cannot happen.
- Do not create helpers or abstractions for one-time use.

### 9 — File input UX
- File inputs use `<label htmlFor="...">` + hidden `<input type="file" className="sr-only">`.
- Always show selected filename in a sibling `data-testid="file-name"` span.
- Upload button is disabled when no file is selected.
- VS Code's integrated browser blocks file dialogs — always test in a real Chrome window.

### 10 — Environment variables
- `MONGODB_URI` is required at runtime. Validated inside `connectDB()`, not at module load.
- Never throw env errors at module import time (breaks `next build`).
- Secrets go in `.env.local` (gitignored). Add to Vercel dashboard for Production + Preview.

---

## Project structure

```
app/
  api/health/
    entries/route.ts     GET  → return all docs sorted by date desc
    upload/route.ts      POST → accept CSV, parse, upsert, return counts
  page.tsx               Dashboard home — renders UploadForm
components/
  UploadForm.tsx         File picker + upload + result display
lib/
  db.ts                  Lazy Mongoose connection (cached on globalThis)
  models/HealthEntry.ts  Mongoose schema + model
  parsers/csvParser.ts   Apple Health CSV → HealthEntryInput[]
types/
  health.ts              RangeValue, HealthEntryInput interfaces
```

---

## Running the project

```bash
npm run dev          # local dev server → http://localhost:3000
npm test             # run all Vitest tests (once)
npm run test:watch   # watch mode
npm run build        # production build (must pass before PR)
```

---

## Spec-kit workflow
Branch: `001-health-dashboard-init` → `main`  
Spec directory: `specs/001-health-dashboard-init/`  
All tasks (`tasks.md`) must be `[x]` and all checklist items (`checklist.md`) must be `[x]` before opening a PR.

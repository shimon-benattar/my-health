# my-health

A personal health dashboard built with Next.js. Import your Apple Health export and visualize steps, sleep, heart rate, HRV, VO₂ max, active calories, and workouts over time.

## Features

- **Apple Health import** — upload the ZIP from iPhone's Health app; the app parses `export.xml`, extracts daily metrics and workout records, and correlates GPS routes from embedded GPX files.
- **Dashboard** — overview and sport tabs with time-series charts (Recharts), aggregated metrics, and AI-generated readiness insights.
- **MongoDB storage** — daily health entries, workout records, import logs, and a rolling 30-day archive of replaced data.
- **Vercel Blob** — large ZIP uploads are streamed directly to Blob storage to bypass the 4.5 MB function body limit, then fetched server-side for processing.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Charts | Recharts |
| Database | MongoDB via Mongoose |
| File storage | Vercel Blob |
| Tests | Vitest + Testing Library |

## Getting started

### Prerequisites

- Node.js 20+
- A running MongoDB instance (local or Atlas)
- (Optional) Vercel Blob credentials for large-file imports

### Environment variables

Create `my-health/.env.local`:

```env
MONGODB_URI=mongodb://localhost:27017/my-health

# Vercel Blob — required for ZIP uploads larger than ~4 MB
BLOB_READ_WRITE_TOKEN=your_token_here

# Set to "public" if your blob store is public; default is "private"
BLOB_ACCESS_MODE=private
```

### Run locally

```bash
cd my-health
npm install
npm run dev
```

Open [http://localhost:3010](http://localhost:3010).

### Other commands

```bash
npm run build        # production build
npm test             # run test suite (Vitest)
npm run test:watch   # watch mode
npm run test:coverage
npm run lint
```

## Importing Apple Health data

1. On iPhone: **Health → your avatar → Export All Health Data** — this produces a ZIP file.
2. On the app's home page, drag-drop or select the ZIP in the upload form.
3. Files ≤4 MB upload directly; larger files are staged to Vercel Blob first.
4. The import pipeline:
   - Unzips and streams `export.xml` via a SAX parser.
   - Aggregates daily buckets: steps, active calories, heart rate (min/max), resting HR, HRV, VO₂ max, sleep stages.
   - Parses GPX route files from `workout-routes/` and correlates them to workout records.
   - Archives any existing Apple Health data before replacing it (retained for 30 days).

## Project structure

```
app/
  api/
    health/
      import/apple-health/   # ZIP import endpoint
      import/upload-url/     # pre-signed Blob URL endpoint
      entries/               # CRUD for daily health entries
      checkpoint/            # last-import checkpoint
      upload/                # generic upload + log endpoints
    dashboard/metrics/       # aggregated metrics for dashboard
    profile/                 # user profile
  dashboard/                 # dashboard page
  page.tsx                   # landing / upload page

components/
  dashboard/                 # chart components, DashboardClient
  UploadForm.tsx
  EntriesTable.tsx
  ProfileMenu.tsx

lib/
  db.ts                      # MongoDB connection
  models/                    # Mongoose schemas
  parsers/
    appleHealthXmlParser.ts  # SAX-based export.xml parser
    csvParser.ts
    gpxRouteParser.ts
    workoutRouteCorrelation.ts
  dashboardInsights.ts
  readiness.ts
  timeAggregation.ts

types/
  health.ts                  # shared TypeScript types
```

## Engineering standards

See [instructions.md](./instructions.md) for the full guide. Key rules:

- Every bug fix must include a regression test.
- New API endpoints need a success case + at least one invalid-input case.
- Error responses follow `{ error, code, requestId }`.
- `npm test` and `npm run build` must pass before merging.

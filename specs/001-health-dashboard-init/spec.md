# Feature Specification: Health Dashboard Initialization

**Feature Branch**: `001-health-dashboard-init`  
**Created**: 2026-06-02  
**Status**: Approved  
**Input**: User description: "Initialize Next.js health dashboard with CSV ingestion, Mongoose models, and upload API"

## User Scenarios & Testing

### User Story 1 — Upload CSV & Persist Data (Priority: P1)

A user selects a historical Apple Health CSV export and uploads it through a form. The system parses all rows, transforms each field to its typed schema shape, and upserts each day's record into MongoDB. Uploading the same file a second time produces no duplicates.

**Why this priority**: This is the core data pipeline — without ingestion, nothing else can work.

**Independent Test**: Upload the sample CSV via `POST /api/health/upload`. Verify 32 documents are upserted. Upload again and verify zero changes.

**Acceptance Scenarios**:

1. **Given** a valid CSV file, **When** `POST /api/health/upload` is called, **Then** all rows are parsed and upserted, returning `{ inserted, updated, skipped }` counts.
2. **Given** the same file uploaded twice, **When** the second upload completes, **Then** the database contains the same 32 documents (no duplicates).
3. **Given** a row where all data fields are `"-"` (e.g., 22/05/2026), **When** parsed, **Then** `date` is stored and all other fields are `null`.
4. **Given** an HRV value of `"58.51"` (single value, no hyphen), **When** parsed, **Then** stored as `{ min: 58.51, max: 58.51 }`.

---

### User Story 2 — Retrieve All Entries (Priority: P2)

A user (or a dashboard component) fetches the full list of health entries sorted by date descending for display.

**Why this priority**: Required for any visualisation or dashboard page.

**Independent Test**: After uploading the CSV, `GET /api/health/entries` returns 32 documents in descending date order with all fields in their typed shapes.

**Acceptance Scenarios**:

1. **Given** data in the database, **When** `GET /api/health/entries` is called, **Then** returns an array of entries sorted by `date` descending.
2. **Given** a returned entry, **When** inspecting fields, **Then** `heartRate` and `hrv` are `{ min, max }` objects or `null`, `sleep` is an integer (minutes) or `null`, `steps` is a Number with no commas.

---

### User Story 3 — Upload UI (Priority: P3)

A user can upload a CSV file from the browser using a simple form on the dashboard home page without needing `curl` or external tools.

**Why this priority**: Improves usability but the API works independently.

**Independent Test**: Open `http://localhost:3000`, select the sample CSV, click upload, and see a success count displayed.

**Acceptance Scenarios**:

1. **Given** the home page, **When** a CSV file is selected and submitted, **Then** a success message with insert/update counts is shown.
2. **Given** an upload error (e.g., network failure), **When** the request fails, **Then** an error message is displayed without crashing the page.

---

### User Story 4 — Ingestion Summary (Priority: P3)

After a successful upload, the user sees a structured summary of the ingestion result: how many records were processed, the date range covered, and any rows that were skipped due to invalid data. A "Go to Dashboard" link provides a clear next step.

**Why this priority**: Improves upload UX without blocking core functionality; the API already returns sufficient data.

**Independent Test**: Upload the sample CSV and verify the `IngestionSummary` component renders the correct counts, the date range `02 May 2026 → 02 Jun 2026`, and the "Go to Dashboard" link.

**Acceptance Scenarios**:

1. **Given** a successful upload response, **When** the summary renders, **Then** it shows total records (inserted + updated), a formatted date range, and a "Go to Dashboard" link.
2. **Given** a CSV with one unparseable date row, **When** the summary renders, **Then** the skipped-row count is shown.
3. **Given** all rows are valid (skipped = 0), **When** the summary renders, **Then** the skipped section is hidden.

---

### Edge Cases

- What happens when a row has a Heart Rate value of `"46.22-130"` (decimal min, integer max)? → `parseRange` splits on `-` and parses each side with `parseFloat`.
- What happens when Heart Rate Variability is a single float like `"58.51"` (no hyphen)? → `parseRange` falls back to `{ min: val, max: val }`.
- What happens when a row has `"-"` for all fields? → All nullable fields are stored as `null`; the `date` is still stored (valid upsert target).
- What happens when Steps contains commas like `"1,109"`? → `parseNumber` strips commas before `parseFloat`.
- What happens when Sleep is `"-"` or the field is absent? → Returns `null`.

## Requirements

### Functional
- `POST /api/health/upload` accepts `multipart/form-data` with a `file` field containing a CSV.
- All 8 target fields must be parsed according to the transformation rules specified in the constitution.
- Writes use `findOneAndUpdate` with `{ upsert: true }` on the `date` unique index.
- Upload response includes `{ inserted, updated, skipped, dateRange: { from, to } | null }`.
- `GET /api/health/entries` returns all documents sorted by `date` descending as JSON.
- The `UploadForm` component submits the file and renders `IngestionSummary` on success.
- `IngestionSummary` displays total records processed, the date range, skipped-row count (when > 0), and a "Go to Dashboard" link.

### Non-Functional
- TypeScript `strict` mode: no `any` in the data pipeline.
- Each API route must complete within 10 seconds (Vercel Free Tier limit).
- `MONGODB_URI` must never appear in committed source files; loaded from `process.env` only.
- No paid dependencies or services.

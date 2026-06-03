# Implementation Plan: Health Dashboard Initialization

**Branch**: `001-health-dashboard-init` | **Date**: 2026-06-02 | **Spec**: [spec.md](spec.md)  
**Input**: Feature specification from `specs/001-health-dashboard-init/spec.md`

## Summary

Initialize the `my-health` Next.js App Router project with a fully typed CSV ingestion pipeline, Mongoose data model, and two API routes (`POST /api/health/upload`, `GET /api/health/entries`) backed by MongoDB Atlas M0. A minimal upload form is included as the P3 UI story.

## Technical Context

**Language/Version**: TypeScript 5 (strict mode), Node.js 20 LTS  
**Primary Dependencies**: Next.js 14 (App Router), Mongoose 8, papaparse 5, Tailwind CSS 3  
**Storage**: MongoDB Atlas M0 (free cluster, 512 MB cap)  
**Testing**: `curl` + manual verification against sample CSV (see Verification section in spec)  
**Target Platform**: Vercel Free Tier (serverless, max 10s execution per function)  
**Project Type**: Full-stack web application  
**Performance Goals**: Upload of a 31-row monthly CSV must complete in < 2 seconds end-to-end  
**Constraints**: Vercel 10s function limit; MongoDB Atlas M0 512 MB; no paid services  
**Scale/Scope**: Single user, one collection (~365 docs/year), no multi-tenancy

## Constitution Check

*GATE: Must pass before implementation. Re-checked after Phase 1 design.*

| Principle | Gate | Status |
|---|---|---|
| I. Spec-First | spec.md approved; plan presented and approved before implementation | ✅ PASS |
| II. Type-Safe Pipeline | All fields flow through `HealthEntryInput` interface; `any` banned in pipeline | ✅ PASS |
| III. Idempotent Ingestion | `findOneAndUpdate` + `{ upsert: true }` on unique `date` index; `$set` overwrites | ✅ PASS |
| IV. Free-Tier Compliance | 31-row batch << 10s Vercel limit; M0 index budget respected | ✅ PASS |
| V. Simplicity (YAGNI) | Single upload route, no auth, no job queue | ✅ PASS |

## Project Structure

### Documentation (this feature)

```text
specs/001-health-dashboard-init/
├── spec.md
├── plan.md              ← this file
└── tasks.md             ← generated next by speckit.tasks
```

### Source Code (Next.js App Router)

```text
my-health/                       ← Next.js project root
├── app/
│   ├── layout.tsx
│   ├── page.tsx                 ← Dashboard home + UploadForm
│   └── api/
│       └── health/
│           ├── upload/
│           │   └── route.ts     ← POST /api/health/upload
│           └── entries/
│               └── route.ts     ← GET  /api/health/entries
├── components/
│   └── UploadForm.tsx
├── lib/
│   ├── db.ts                    ← MongoDB singleton (cached connection)
│   ├── models/
│   │   └── HealthEntry.ts       ← Mongoose schema + model
│   └── parsers/
│       └── csvParser.ts         ← papaparse + field sanitisers
├── types/
│   └── health.ts                ← RangeValue, HealthEntryInput interfaces
├── .env.local                   ← MONGODB_URI (git-ignored)
├── next.config.ts
└── tsconfig.json
```

**Structure Decision**: Single Next.js project with `app/` router. Backend logic lives in `lib/`; frontend in `app/` and `components/`. No separate backend server needed.

## Complexity Tracking

No constitution violations — all decisions are within YAGNI bounds.

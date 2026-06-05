"use client";

import Link from "next/link";
import type { AppleHealthImportResult, IngestionResult } from "@/types/health";

interface Props {
  result: IngestionResult | AppleHealthImportResult;
}

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function IngestionSummary({ result }: Props) {
  if ("counts" in result) {
    return (
      <div
        role="status"
        data-testid="ingestion-summary"
        className="mt-4 rounded-md bg-green-50 p-4 text-sm text-green-800"
      >
        <p className="font-semibold">Apple Health import complete</p>
        <ul className="mt-2 space-y-1 list-inside list-disc">
          <li data-testid="total-count">Records processed: {result.counts.recordsProcessed}</li>
          <li>Workouts processed: {result.counts.workoutsProcessed}</li>
          <li>Routes found: {result.counts.routesFound}</li>
          <li>Routes matched: {result.counts.routesMatched}</li>
          <li>Unmatched workouts: {result.counts.unmatchedWorkouts}</li>
          <li data-testid="skipped-count" className="text-amber-700">Skipped: {result.counts.skipped}</li>
        </ul>

        {result.warnings.length > 0 && (
          <div className="mt-3 rounded-md bg-white/60 p-3 text-xs text-green-900">
            <p className="font-semibold">Warnings</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {result.warnings.map((warning, index) => (
                <li key={`${warning}-${index}`}>{warning}</li>
              ))}
            </ul>
          </div>
        )}

        {result.sampleUnmatchedWorkouts.length > 0 && (
          <div className="mt-3 rounded-md bg-white/60 p-3 text-xs text-green-900">
            <p className="font-semibold">Sample unmatched workouts</p>
            <ul className="mt-1 max-h-40 list-disc space-y-1 overflow-auto pl-5" data-testid="pulled-list">
              {result.sampleUnmatchedWorkouts.map((item, idx) => (
                <li key={`${item.workoutType}-${item.startDate}-${idx}`}>
                  {item.workoutType} · {new Date(item.startDate).toISOString()} · {item.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        <Link
          href="/dashboard"
          data-testid="dashboard-link"
          className="mt-3 inline-block font-medium underline hover:text-green-900"
        >
          Go to Dashboard →
        </Link>
      </div>
    );
  }

  const {
    inserted,
    updated,
    unchanged = 0,
    skipped,
    dateRange,
    pulled = [],
  } = result;
  const total = inserted + updated;

  return (
    <div
      role="status"
      data-testid="ingestion-summary"
      className="mt-4 rounded-md bg-green-50 p-4 text-sm text-green-800"
    >
      <p className="font-semibold">Upload complete</p>
      <ul className="mt-2 space-y-1 list-inside list-disc">
        <li>
          Records processed:{" "}
          <span data-testid="total-count">{total}</span>
          {" "}(inserted: <span data-testid="inserted-count">{inserted}</span>,
          {" "}updated: <span data-testid="updated-count">{updated}</span>,
          {" "}unchanged: <span data-testid="unchanged-count">{unchanged}</span>)
        </li>
        {dateRange && (
          <li data-testid="date-range">
            Date range: {formatDate(dateRange.from)} → {formatDate(dateRange.to)}
          </li>
        )}
        {skipped > 0 && (
          <li data-testid="skipped-count" className="text-amber-700">
            Skipped (invalid date): {skipped}
          </li>
        )}
      </ul>

      {pulled.length > 0 && (
        <div className="mt-3 rounded-md bg-white/60 p-3 text-xs text-green-900">
          <p className="font-semibold">Delta pulled with timestamps</p>
          <ul className="mt-1 max-h-40 list-disc space-y-1 overflow-auto pl-5" data-testid="pulled-list">
            {pulled.slice(0, 20).map((item, idx) => (
              <li key={`${item.date}-${idx}`}>
                {new Date(item.date).toISOString().slice(0, 10)} · {item.action} · {item.sourceType} · pulled at {new Date(item.pulledAt).toISOString()}
              </li>
            ))}
          </ul>
          {pulled.length > 20 && <p className="mt-1">Showing first 20 of {pulled.length} changes.</p>}
        </div>
      )}

      <Link
        href="/dashboard"
        data-testid="dashboard-link"
        className="mt-3 inline-block font-medium underline hover:text-green-900"
      >
        Go to Dashboard →
      </Link>
    </div>
  );
}

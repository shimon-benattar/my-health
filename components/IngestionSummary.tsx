"use client";

import Link from "next/link";
import type { IngestionResult } from "@/types/health";

interface Props {
  result: IngestionResult;
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
  const { inserted, updated, skipped, dateRange } = result;
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
          {" "}updated: <span data-testid="updated-count">{updated}</span>)
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
      <Link
        href="/"
        data-testid="dashboard-link"
        className="mt-3 inline-block font-medium underline hover:text-green-900"
      >
        Go to Dashboard →
      </Link>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";

const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
const BUILD_DATE_RAW = process.env.NEXT_PUBLIC_BUILD_DATE;

function formatBuildDate(input?: string): string {
  if (!input) return "Local development";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  return date.toUTCString();
}

export default function AboutMenu() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 active:bg-slate-100"
      >
        About
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative max-h-[90vh] w-[90vw] max-w-2xl overflow-auto rounded-lg border border-slate-200 bg-white p-6 text-slate-700 shadow-2xl">
            <button
              onClick={() => setIsOpen(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600"
              aria-label="Close"
            >
              ✕
            </button>

            <h2 className="text-2xl font-bold text-slate-900">my-health</h2>
            <p className="mt-3 leading-relaxed">
              A personal Apple Health ingestion dashboard that turns exported ZIP data into daily metrics and workout insights.
            </p>

            <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-slate-600">How it works</h3>
            <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm">
              <li>Upload your Apple Health export ZIP.</li>
              <li>Large files upload to Vercel Blob, then the server imports from Blob.</li>
              <li>Data is parsed, normalized, and stored in MongoDB.</li>
              <li>Dashboard endpoints aggregate entries into trend and readiness views.</li>
            </ol>

            <div className="mt-5 rounded-md bg-slate-50 p-4 text-xs text-slate-600">
              <p>
                <span className="font-semibold text-slate-800">Build:</span> <code className="font-mono">{BUILD_ID}</code>
              </p>
              <p className="mt-2">
                <span className="font-semibold text-slate-800">Built at:</span> {formatBuildDate(BUILD_DATE_RAW)}
              </p>
            </div>

            <div className="mt-5 flex gap-3">
              <Link href="/" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                Home
              </Link>
              <Link href="/dashboard" className="rounded-md bg-slate-200 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-300">
                Dashboard
              </Link>
              <button
                onClick={() => setIsOpen(false)}
                className="ml-auto rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

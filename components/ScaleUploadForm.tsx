"use client";

import Link from "next/link";
import { useRef, useState } from "react";

interface ImportResponse {
  error?: string;
  code?: string;
  total?: number;
  inserted?: number;
  updated?: number;
  from?: string;
  to?: string;
  warnings?: string[];
}

export default function ScaleUploadForm({ compact = false }: { compact?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setStatus("uploading");
    setErrorMsg("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/body/import", { method: "POST", body: form });
      const json = (await res.json()) as ImportResponse;
      if (!res.ok) {
        setErrorMsg(json.error ?? "Import failed.");
        setStatus("error");
        return;
      }
      setResult(json);
      setStatus("success");
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch {
      setErrorMsg("Import failed. Check your connection and try again.");
      setStatus("error");
    }
  }

  return (
    <div className={`rounded-lg border border-gray-200 bg-white shadow-sm ${compact ? "p-4" : "p-6"}`} data-testid="scale-upload">
      <h2 className="text-lg font-semibold text-gray-900">Upload Smart Scale Export (.xlsx)</h2>
      <p className="mt-1 text-sm text-gray-600">
        Weight, body fat, muscle, visceral fat, water and more. Re-importing is safe: readings are merged by time.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          data-testid="scale-file-input"
          aria-label="Smart scale export file"
          className="block w-full text-sm text-gray-700 file:mr-3 file:rounded file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setStatus("idle");
          }}
        />
        <button
          type="submit"
          disabled={!file || status === "uploading"}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {status === "uploading" ? "Importing..." : "Import scale data"}
        </button>
      </form>

      {status === "error" && (
        <p className="mt-3 text-sm text-red-600" role="alert">{errorMsg}</p>
      )}
      {status === "success" && result && (
        <p className="mt-3 text-sm text-green-700" role="status">
          Imported {result.total} readings ({result.inserted} new, {result.updated} updated
          {result.warnings?.length ? `, ${result.warnings.length} warning${result.warnings.length === 1 ? "" : "s"}` : ""}).{" "}
          <Link href="/dashboard?tab=body" className="font-medium underline" data-testid="scale-view-link">
            View Body Composition →
          </Link>
        </p>
      )}
    </div>
  );
}

"use client";

import { useState, useRef } from "react";

interface UploadResult {
  inserted: number;
  updated: number;
  skipped: number;
}

export default function UploadForm() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [result, setResult] = useState<UploadResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;

    setStatus("uploading");
    setResult(null);
    setErrorMsg("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/health/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      const data: UploadResult = await res.json();
      setResult(data);
      setStatus("success");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Upload failed");
      setStatus("error");
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Upload Health Export</h2>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          required
          className="block w-full text-sm text-gray-700 file:mr-4 file:rounded-md file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
        />

        <button
          type="submit"
          disabled={status === "uploading"}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "uploading" ? "Uploading…" : "Upload CSV"}
        </button>
      </form>

      {status === "success" && result && (
        <div className="mt-4 rounded-md bg-green-50 p-4 text-sm text-green-800">
          <p className="font-semibold">Upload complete</p>
          <ul className="mt-1 list-inside list-disc">
            <li>Inserted: {result.inserted}</li>
            <li>Updated: {result.updated}</li>
            <li>Skipped (no change): {result.skipped}</li>
          </ul>
        </div>
      )}

      {status === "error" && (
        <div className="mt-4 rounded-md bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold">Upload failed</p>
          <p className="mt-1">{errorMsg}</p>
        </div>
      )}
    </div>
  );
}

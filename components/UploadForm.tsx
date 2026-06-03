"use client";

import { useState, useRef } from "react";

interface UploadResult {
  inserted: number;
  updated: number;
  skipped: number;
}

export default function UploadForm() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [result, setResult] = useState<UploadResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setStatus("idle");
    setResult(null);
    setErrorMsg("");
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedFile) return;

    setStatus("uploading");
    setResult(null);
    setErrorMsg("");

    const formData = new FormData();
    formData.append("file", selectedFile);

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
      setSelectedFile(null);
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
        {/* Hidden native file input */}
        <input
          ref={fileInputRef}
          id="csv-file-input"
          data-testid="file-input"
          type="file"
          accept=".csv"
          className="sr-only"
          onChange={handleFileChange}
        />

        {/* Visible label acting as the "Browse" button */}
        <div className="flex items-center gap-3">
          <label
            htmlFor="csv-file-input"
            className="cursor-pointer rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100"
          >
            Browse…
          </label>
          <span className="truncate text-sm text-gray-500" data-testid="file-name">
            {selectedFile ? selectedFile.name : "No file chosen"}
          </span>
        </div>

        <button
          type="submit"
          disabled={status === "uploading" || !selectedFile}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "uploading" ? "Uploading…" : "Upload CSV"}
        </button>
      </form>

      {status === "success" && result && (
        <div className="mt-4 rounded-md bg-green-50 p-4 text-sm text-green-800" role="status">
          <p className="font-semibold">Upload complete</p>
          <ul className="mt-1 list-inside list-disc">
            <li>Inserted: {result.inserted}</li>
            <li>Updated: {result.updated}</li>
            <li>Skipped (no change): {result.skipped}</li>
          </ul>
        </div>
      )}

      {status === "error" && (
        <div className="mt-4 rounded-md bg-red-50 p-4 text-sm text-red-800" role="alert">
          <p className="font-semibold">Upload failed</p>
          <p className="mt-1" data-testid="error-message">{errorMsg}</p>
        </div>
      )}
    </div>
  );
}


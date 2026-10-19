"use client";

import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import JSZip from "jszip";
import IngestionSummary from "@/components/IngestionSummary";
import type { AppleHealthImportResult, IngestionResult } from "@/types/health";

/** Files larger than this threshold are uploaded directly to Vercel Blob to bypass
 *  the 4.5 MB serverless function body limit. */
const BLOB_THRESHOLD_BYTES = 4 * 1024 * 1024; // 4 MB
const BLOB_ACCESS_MODE = process.env.NEXT_PUBLIC_BLOB_ACCESS_MODE === "public" ? "public" : "private";

interface Props {
  compact?: boolean;
}

function clearDashboardSessionCache(): void {
  if (typeof window === "undefined") {
    return;
  }

  const keysToDelete: string[] = [];
  for (let index = 0; index < window.sessionStorage.length; index += 1) {
    const key = window.sessionStorage.key(index);
    if (key?.startsWith("dashboard-metrics:")) {
      keysToDelete.push(key);
    }
  }

  for (const key of keysToDelete) {
    window.sessionStorage.removeItem(key);
  }
}

export default function UploadForm({ compact = false }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [showExportHelp, setShowExportHelp] = useState(false);
  const [result, setResult] = useState<IngestionResult | AppleHealthImportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const [uploadSpeedMbps, setUploadSpeedMbps] = useState<number | null>(null);
  const [uploadPhase, setUploadPhase] = useState<"uploading" | "processing">("uploading");

  useEffect(() => {
    if (status !== "uploading" || uploadPhase !== "processing") {
      return;
    }

    const interval = window.setInterval(() => {
      setUploadProgress((prev) => Math.min(99, prev + 1));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [status, uploadPhase]);

  function formatEta(seconds: number | null): string {
    if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return "Calculating...";
    if (seconds < 60) return `${Math.ceil(seconds)}s remaining`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.ceil(seconds % 60);
    return `${mins}m ${secs}s remaining`;
  }

  function formatFileSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index += 1;
    }
    return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
  }

  async function postFormWithProgress(
    url: string,
    file: File,
    onProgress: (loaded: number, total: number, elapsedSeconds: number) => void
  ): Promise<{ ok: boolean; status: number; body: unknown }> {
    // Keep deterministic fetch behavior in test environment.
    if (process.env.NODE_ENV === "test" || typeof XMLHttpRequest === "undefined") {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(url, { method: "POST", body: formData });
      const body = await res.json().catch(() => ({ error: "Unknown error" }));
      return { ok: res.ok, status: res.status, body };
    }

    return await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const startedAt = Date.now();

      xhr.open("POST", url);
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.001);
        onProgress(event.loaded, event.total, elapsedSeconds);
      };

      xhr.onload = () => {
        const parsedBody = (() => {
          try {
            return JSON.parse(xhr.responseText);
          } catch {
            const responseText = typeof xhr.responseText === "string" ? xhr.responseText.trim() : "";
            const responseSnippet = responseText.slice(0, 180);
            return {
              error:
                responseSnippet.length > 0
                  ? `HTTP ${xhr.status}: ${responseSnippet}`
                  : `HTTP ${xhr.status}: ${xhr.statusText || "Unknown error"}`,
            };
          }
        })();
        resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, body: parsedBody });
      };

      xhr.onerror = () => reject(new Error("Network error while uploading file"));
      xhr.onabort = () => reject(new Error("Upload was aborted"));

      const formData = new FormData();
      formData.append("file", file);
      xhr.send(formData);
    });
  }

  async function preflightBlobClientToken(file: File): Promise<void> {
    const response = await fetch("/api/health/import/upload-url", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "blob.generate-client-token",
        payload: {
          pathname: file.name,
          contentType: file.type || "application/zip",
          multipart: true,
        },
      }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      const details = typeof body?.error === "string" ? body.error : `HTTP ${response.status}`;
      throw new Error(`Blob token preflight failed: ${details}`);
    }
  }

  async function isAppleHealthZip(file: File): Promise<boolean> {
    try {
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      return Object.values(zip.files).some(
        (entry) => !entry.dir && entry.name.toLowerCase().endsWith("export.xml")
      );
    } catch {
      return false;
    }
  }

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
    setUploadPhase("uploading");
    setUploadProgress(0);
    setEtaSeconds(null);
    setUploadSpeedMbps(null);

    try {
      const appleHealthZip = await isAppleHealthZip(selectedFile);
      const updateProgress = (loaded: number, total: number, elapsedSeconds: number) => {
        if (!Number.isFinite(total) || total <= 0) return;
        const progress = Math.min(95, Math.max(0, (loaded / total) * 95));
        const bytesPerSecond = loaded / elapsedSeconds;
        const remainingBytes = Math.max(0, total - loaded);
        const remainingSeconds = bytesPerSecond > 0 ? remainingBytes / bytesPerSecond : null;

        setUploadProgress(progress);
        setEtaSeconds(remainingSeconds);
        setUploadSpeedMbps((bytesPerSecond * 8) / (1024 * 1024));
      };

      // Large files (> 4 MB) bypass the serverless function body limit by uploading
      // directly to Vercel Blob storage, then instructing the import API to fetch from there.
      // When Blob is not configured (local dev), fall through to the direct form-upload path.
      const blobReady = appleHealthZip &&
        selectedFile.size > BLOB_THRESHOLD_BYTES &&
        await fetch("/api/health/checkpoint", { cache: "no-store" }).then(r => r.ok).catch(() => false);

      if (blobReady) {

        await preflightBlobClientToken(selectedFile);

        const startedAt = Date.now();
        let blob;
        try {
          console.log("[UploadForm] Starting large file upload to Blob", {
            fileName: selectedFile.name,
            fileSize: selectedFile.size,
            accessMode: BLOB_ACCESS_MODE,
          });
          blob = await upload(selectedFile.name, selectedFile, {
            access: BLOB_ACCESS_MODE,
            handleUploadUrl: "/api/health/import/upload-url",
            onUploadProgress: ({ loaded, total }) => {
              const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.001);
              updateProgress(loaded, total, elapsedSeconds);
            },
          });
          console.log("[UploadForm] Blob upload completed", { url: blob.url });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Blob upload failed";
          console.error("[UploadForm] Blob upload failed:", message);
          if (message.toLowerCase().includes("failed to retrieve the client token")) {
            throw new Error(
              `Blob client token request failed: ${message}\n\nEnsure BLOB_READ_WRITE_TOKEN is valid and set in Vercel Environment Variables.\n\nDebug: Check browser console and server logs for details.`
            );
          }
          throw error;
        }

        setUploadPhase("processing");
        setUploadProgress((prev) => Math.max(96, prev));
        setEtaSeconds(null);
        setUploadSpeedMbps(null);

        const importRes = await fetch("/api/health/import/apple-health", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ blobUrl: blob.url }),
        });
        const importBody = await importRes.json().catch(() => ({ error: "Invalid JSON response" })) as IngestionResult | AppleHealthImportResult | { error: string };

        if (!importRes.ok) {
          throw new Error(
            (importBody as { error?: string }).error ?? `Import failed: HTTP ${importRes.status}`
          );
        }

        setResult(importBody as IngestionResult | AppleHealthImportResult);
        clearDashboardSessionCache();
        setUploadProgress(100);
        setStatus("success");
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      const firstEndpoint = appleHealthZip ? "/api/health/import/apple-health" : "/api/health/upload";
      const firstResponse = await postFormWithProgress(firstEndpoint, selectedFile, updateProgress);
      let finalResponse = firstResponse;

      if (!firstResponse.ok) {
        const firstBody = firstResponse.body as { error?: string };
        const shouldTryAppleHealth =
          !appleHealthZip &&
          firstResponse.status === 422 &&
          typeof firstBody.error === "string" &&
          firstBody.error.toLowerCase().includes("export.xml");

        if (shouldTryAppleHealth) {
          setUploadProgress(0);
          setEtaSeconds(null);
          setUploadSpeedMbps(null);
          setUploadPhase("uploading");
          finalResponse = await postFormWithProgress(
            "/api/health/import/apple-health",
            selectedFile,
            updateProgress
          );
          if (!finalResponse.ok) {
            const secondBody = finalResponse.body as { error?: string };
            if (finalResponse.status === 404) {
              throw new Error("Apple Health import endpoint is not deployed yet. Please redeploy the latest version.");
            }
            throw new Error(secondBody.error ?? `HTTP ${finalResponse.status}`);
          }
        } else {
          throw new Error(firstBody.error ?? `HTTP ${firstResponse.status}`);
        }
      }

      setUploadPhase("processing");
      setUploadProgress((prev) => Math.max(96, prev));
      setEtaSeconds(0);
      setUploadSpeedMbps(null);

      const data = finalResponse.body as IngestionResult | AppleHealthImportResult;
      setResult(data);
      clearDashboardSessionCache();
      setUploadProgress(100);
      setStatus("success");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Upload failed");
      setStatus("error");
    }
  }

  const isUploading = status === "uploading";

  return (
    <div className={`rounded-lg border border-gray-200 bg-white shadow-sm ${compact ? "p-4" : "p-6"}`}>
      <div className="mb-4 flex items-center gap-2">
        <h2 className="text-lg font-semibold text-gray-900">Upload Health Export ZIP</h2>
        <div className="relative">
          <button
            type="button"
            aria-expanded={showExportHelp}
            aria-controls="upload-export-help"
            aria-label="How to export Apple Health ZIP on iPhone"
            className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 text-xs font-bold text-gray-600 transition hover:bg-gray-100"
            onClick={() => setShowExportHelp((prev) => !prev)}
          >
            ?
          </button>
          {showExportHelp && (
            <div
              id="upload-export-help"
              role="tooltip"
              className="absolute left-0 top-8 z-20 w-80 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700 shadow-xl"
            >
              <p className="font-semibold text-gray-900">Export the ZIP from your iPhone</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>Open the Health app on your iPhone.</li>
                <li>Tap your profile picture in the top-right corner.</li>
                <li>Scroll down and tap <span className="font-medium">Export All Health Data</span>.</li>
                <li>Confirm by tapping <span className="font-medium">Export</span>.</li>
                <li>Wait while Apple prepares the ZIP file.</li>
                <li>Save or share the ZIP to Files, AirDrop, or your computer.</li>
                <li>Come back here, choose that ZIP file, and start the import.</li>
              </ol>
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Hidden native file input */}
        <input
          ref={fileInputRef}
          id="zip-file-input"
          data-testid="file-input"
          type="file"
          accept=".zip"
          className="sr-only"
          onChange={handleFileChange}
        />

        {/* Visible label acting as the "Browse" button */}
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-gray-200 bg-gray-50 p-3">
          <label
            htmlFor="zip-file-input"
            className="cursor-pointer rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100"
          >
            Choose ZIP
          </label>
          <span className="truncate text-sm text-gray-500" data-testid="file-name">
            {selectedFile ? selectedFile.name : "No file chosen"}
          </span>
          <span className="ml-auto text-xs text-gray-500" data-testid="selected-file-size">
            {selectedFile ? `Size: ${formatFileSize(selectedFile.size)}` : ""}
          </span>
        </div>

        <button
          type="submit"
          disabled={status === "uploading" || !selectedFile}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "uploading" ? "Uploading…" : "Start Import"}
        </button>
      </form>

      {isUploading && (
        <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50/70 p-4" data-testid="upload-progress-panel">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px]" data-testid="upload-stage-labels">
            <span className={`rounded-full px-2 py-1 font-semibold ${uploadPhase === "uploading" ? "bg-blue-600 text-white" : "bg-green-100 text-green-800"}`}>
              1. Upload ZIP
            </span>
            <span className={`rounded-full px-2 py-1 font-semibold ${uploadPhase === "processing" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}>
              2. Import and map workouts
            </span>
            <span className={`rounded-full px-2 py-1 font-semibold ${uploadPhase === "processing" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}>
              3. Save metrics to dashboard
            </span>
          </div>

          <div className="mb-2 flex items-center justify-between text-xs text-blue-900">
            <span className="font-semibold">
              {uploadPhase === "uploading" ? "Uploading ZIP" : "Importing and mapping workouts"}
            </span>
            <span>{Math.round(uploadProgress)}%</span>
          </div>

          <div className="relative h-3 overflow-hidden rounded-full bg-blue-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500 transition-[width] duration-300"
              style={{ width: `${uploadProgress}%` }}
              data-testid="upload-progress-bar"
            />
            <div className="pointer-events-none absolute inset-y-0 w-1/3 animate-shimmer bg-gradient-to-r from-transparent via-white/70 to-transparent" />
          </div>

          <div className="mt-2 flex items-center justify-between text-xs text-blue-900">
            <span data-testid="upload-eta">{uploadPhase === "uploading" ? formatEta(etaSeconds) : "Linking routes to workouts and saving all metrics..."}</span>
            <span>{uploadSpeedMbps ? `${uploadSpeedMbps.toFixed(2)} Mbps` : ""}</span>
          </div>

          <div className="mt-3 flex items-center gap-3 rounded-md bg-white/70 p-2">
            <div className="relative h-10 w-10">
              <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500" />
              <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500 animate-orbit" />
            </div>
            <p className="text-xs text-blue-900">
              Crunching records, workouts, and routes with live telemetry logs.
            </p>
          </div>
        </div>
      )}

      {status === "success" && result && <IngestionSummary result={result} />}

      {status === "error" && (
        <div className="mt-4 rounded-md bg-red-50 p-4 text-sm text-red-800" role="alert">
          <p className="font-semibold">Upload failed</p>
          <p className="mt-1" data-testid="error-message">{errorMsg}</p>
        </div>
      )}
    </div>
  );
}

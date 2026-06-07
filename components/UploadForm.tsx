"use client";

import { useState, useRef } from "react";
import { upload } from "@vercel/blob/client";
import IngestionSummary from "@/components/IngestionSummary";
import type { AppleHealthImportResult, IngestionResult } from "@/types/health";

/** Files larger than this threshold are uploaded directly to Vercel Blob to bypass
 *  the 4.5 MB serverless function body limit. */
const BLOB_THRESHOLD_BYTES = 4 * 1024 * 1024; // 4 MB
const BLOB_ACCESS_MODE = process.env.NEXT_PUBLIC_BLOB_ACCESS_MODE === "public" ? "public" : "private";

interface Props {
  compact?: boolean;
}

export default function UploadForm({ compact = false }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [result, setResult] = useState<IngestionResult | AppleHealthImportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [weightKg, setWeightKg] = useState<string>("85");
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const [uploadSpeedMbps, setUploadSpeedMbps] = useState<number | null>(null);
  const [uploadPhase, setUploadPhase] = useState<"uploading" | "processing">("uploading");

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
    weight: string,
    onProgress: (loaded: number, total: number, elapsedSeconds: number) => void
  ): Promise<{ ok: boolean; status: number; body: unknown }> {
    // Keep deterministic fetch behavior in test environment.
    if (process.env.NODE_ENV === "test" || typeof XMLHttpRequest === "undefined") {
      const formData = new FormData();
      formData.append("file", file);
      if (weight.trim() !== "") formData.append("weightKg", weight.trim());
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
      if (weight.trim() !== "") formData.append("weightKg", weight.trim());
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
      const updateProgress = (loaded: number, total: number, elapsedSeconds: number) => {
        if (!Number.isFinite(total) || total <= 0) return;
        const progress = Math.min(100, Math.max(0, (loaded / total) * 100));
        const bytesPerSecond = loaded / elapsedSeconds;
        const remainingBytes = Math.max(0, total - loaded);
        const remainingSeconds = bytesPerSecond > 0 ? remainingBytes / bytesPerSecond : null;

        setUploadProgress(progress);
        setEtaSeconds(remainingSeconds);
        setUploadSpeedMbps((bytesPerSecond * 8) / (1024 * 1024));
      };

      // Large files (> 4 MB) bypass the serverless function body limit by uploading
      // directly to Vercel Blob storage, then instructing the import API to fetch from there.
      if (selectedFile.size > BLOB_THRESHOLD_BYTES) {
        const checkpointRes = await fetch("/api/health/checkpoint", { cache: "no-store" });
        if (!checkpointRes.ok) {
          const checkpointBody = await checkpointRes.json().catch(() => null) as { missing?: string[] } | null;
          const missing = Array.isArray(checkpointBody?.missing) ? checkpointBody?.missing : [];
          const suffix = missing.length > 0 ? ` Missing: ${missing.join(", ")}.` : "";
          throw new Error(`Blob upload is not ready in this deployment.${suffix}`);
        }

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
        setUploadProgress(100);
        setEtaSeconds(null);

        const importRes = await fetch("/api/health/import/apple-health", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ blobUrl: blob.url, weightKg: weightKg.trim() || undefined }),
        });
        const importBody = await importRes.json().catch(() => ({ error: "Invalid JSON response" })) as IngestionResult | AppleHealthImportResult | { error: string };

        if (!importRes.ok) {
          throw new Error(
            (importBody as { error?: string }).error ?? `Import failed: HTTP ${importRes.status}`
          );
        }

        setResult(importBody as IngestionResult | AppleHealthImportResult);
        setStatus("success");
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      // Small files: use the existing direct-upload path.
      const firstResponse = await postFormWithProgress("/api/health/upload", selectedFile, weightKg, updateProgress);
      let finalResponse = firstResponse;

      if (!firstResponse.ok) {
        const firstBody = firstResponse.body as { error?: string };
        const shouldTryAppleHealth =
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
            weightKg,
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
      setUploadProgress(100);
      setEtaSeconds(0);

      const data = finalResponse.body as IngestionResult | AppleHealthImportResult;
      setResult(data);
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
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Upload Health Export ZIP</h2>

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
        <div className="flex items-center gap-3">
          <label
            htmlFor="zip-file-input"
            className="cursor-pointer rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100"
          >
            Browse…
          </label>
          <span className="truncate text-sm text-gray-500" data-testid="file-name">
            {selectedFile ? selectedFile.name : "No file chosen"}
          </span>
        </div>

        {selectedFile && (
          <p className="text-xs text-gray-500" data-testid="selected-file-size">
            File size: {formatFileSize(selectedFile.size)}
          </p>
        )}

        <div className="grid gap-2">
          <label htmlFor="weight-kg" className="text-sm font-medium text-gray-700">
            Current weight (kg)
          </label>
          <input
            id="weight-kg"
            data-testid="weight-input"
            type="number"
            min="1"
            max="400"
            step="0.1"
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={status === "uploading" || !selectedFile}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "uploading" ? "Uploading…" : "Upload ZIP"}
        </button>
      </form>

      {isUploading && (
        <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50/70 p-4" data-testid="upload-progress-panel">
          <div className="mb-2 flex items-center justify-between text-xs text-blue-900">
            <span className="font-semibold">
              {uploadPhase === "uploading" ? "Uploading ZIP" : "Processing Imported Data"}
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
            <span data-testid="upload-eta">{uploadPhase === "uploading" ? formatEta(etaSeconds) : "Finalizing and saving to database..."}</span>
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


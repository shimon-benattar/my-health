"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { UserProfile } from "@/types/health";

interface ProfileFormState {
  name: string;
  imageUrl: string;
  birthdate: string;
  weightKg: string;
  heightCm: string;
  sex: "" | "female" | "male" | "other";
  timezone: string;
  notes: string;
}

const DEFAULT_FORM: ProfileFormState = {
  name: "",
  imageUrl: "",
  birthdate: "",
  weightKg: "",
  heightCm: "",
  sex: "",
  timezone: "Asia/Jerusalem",
  notes: "",
};

function birthdateToInput(raw: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return "";
  const [d, m, y] = raw.split("/");
  return `${y}-${m}-${d}`;
}

function toForm(profile: UserProfile): ProfileFormState {
  return {
    name: profile.name ?? "",
    imageUrl: profile.imageUrl ?? "",
    birthdate: birthdateToInput(profile.birthdate ?? ""),
    weightKg: Number.isFinite(profile.weightKg) ? String(profile.weightKg) : "",
    heightCm: Number.isFinite(profile.heightCm) ? String(profile.heightCm) : "",
    sex: profile.sex ?? "",
    timezone: profile.timezone ?? "Asia/Jerusalem",
    notes: profile.notes ?? "",
  };
}

export default function ProfileMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState<ProfileFormState>(DEFAULT_FORM);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    let active = true;

    async function loadProfile() {
      setLoading(true);
      setError("");
      setSuccess("");
      try {
        const res = await fetch("/api/profile", { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const profile = (await res.json()) as UserProfile;
        if (active) {
          setForm(toForm(profile));
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load profile");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadProfile();

    return () => {
      active = false;
    };
  }, [isOpen]);

  const previewImage = useMemo(() => {
    return /^https?:\/\//i.test(form.imageUrl.trim()) ? form.imageUrl.trim() : "";
  }, [form.imageUrl]);

  function setField<K extends keyof ProfileFormState>(field: K, value: ProfileFormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const payload = {
        name: form.name,
        imageUrl: form.imageUrl.trim() || null,
        birthdate: form.birthdate,
        weightKg: Number(form.weightKg),
        heightCm: Number(form.heightCm),
        sex: form.sex || null,
        timezone: form.timezone,
        notes: form.notes.trim() || null,
      };

      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = (await res.json().catch(() => ({}))) as { error?: string } & UserProfile;
      if (!res.ok) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      setForm(toForm(body));
      setSuccess("Profile saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 active:bg-slate-100"
      >
        Profile
      </button>

      {isOpen && mounted && createPortal(
        <div
          className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-10 sm:py-16"
          onClick={() => setIsOpen(false)}
          role="presentation"
        >
          <div
            className="relative mt-4 w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-6 text-slate-700 shadow-2xl sm:mt-0"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Edit profile"
          >
            <button
              onClick={() => setIsOpen(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600"
              aria-label="Close"
            >
              ✕
            </button>

            <h2 className="text-2xl font-bold text-slate-900">Profile</h2>
            <p className="mt-2 text-sm text-slate-500">Manage your personal details used by insights and dashboard context.</p>

            {loading ? (
              <p className="mt-4 text-sm text-slate-500">Loading profile...</p>
            ) : (
              <form className="mt-5 grid gap-4" onSubmit={onSubmit}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-slate-700">Name</span>
                    <input
                      value={form.name}
                      onChange={(e) => setField("name", e.target.value)}
                      required
                      className="rounded-md border border-slate-300 px-3 py-2"
                    />
                  </label>

                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-slate-700">Birth date</span>
                    <input
                      type="date"
                      value={form.birthdate}
                      onChange={(e) => setField("birthdate", e.target.value)}
                      required
                      className="rounded-md border border-slate-300 px-3 py-2"
                    />
                  </label>

                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-slate-700">Weight (kg)</span>
                    <input
                      type="number"
                      min="1"
                      max="400"
                      step="0.1"
                      value={form.weightKg}
                      onChange={(e) => setField("weightKg", e.target.value)}
                      required
                      className="rounded-md border border-slate-300 px-3 py-2"
                    />
                  </label>

                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-slate-700">Height (cm)</span>
                    <input
                      type="number"
                      min="50"
                      max="260"
                      value={form.heightCm}
                      onChange={(e) => setField("heightCm", e.target.value)}
                      required
                      className="rounded-md border border-slate-300 px-3 py-2"
                    />
                  </label>

                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-slate-700">Sex</span>
                    <select
                      value={form.sex}
                      onChange={(e) => setField("sex", e.target.value as ProfileFormState["sex"])}
                      className="rounded-md border border-slate-300 px-3 py-2"
                    >
                      <option value="">Not set</option>
                      <option value="female">Female</option>
                      <option value="male">Male</option>
                      <option value="other">Other</option>
                    </select>
                  </label>

                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-slate-700">Timezone</span>
                    <input
                      value={form.timezone}
                      onChange={(e) => setField("timezone", e.target.value)}
                      className="rounded-md border border-slate-300 px-3 py-2"
                    />
                  </label>
                </div>

                <label className="grid gap-1 text-sm">
                  <span className="font-medium text-slate-700">Image URL</span>
                  <input
                    type="url"
                    value={form.imageUrl}
                    onChange={(e) => setField("imageUrl", e.target.value)}
                    placeholder="https://..."
                    className="rounded-md border border-slate-300 px-3 py-2"
                  />
                </label>

                {previewImage && (
                  <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                    <img src={previewImage} alt="Profile" className="h-12 w-12 rounded-full object-cover" />
                    <span className="text-xs text-slate-500">Image preview</span>
                  </div>
                )}

                <label className="grid gap-1 text-sm">
                  <span className="font-medium text-slate-700">Notes</span>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setField("notes", e.target.value)}
                    rows={3}
                    maxLength={800}
                    className="rounded-md border border-slate-300 px-3 py-2"
                    placeholder="Any relevant context for your health insights"
                  />
                </label>

                {error && <p className="text-sm text-red-600">{error}</p>}
                {success && <p className="text-sm text-green-700">{success}</p>}

                <div className="mt-2 flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {saving ? "Saving..." : "Save Profile"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Close
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

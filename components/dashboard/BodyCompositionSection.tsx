"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import MetricConclusion from "@/components/dashboard/MetricConclusion";
import TooltipInfo from "@/components/dashboard/TooltipInfo";
import { BODY_METRIC_BY_KEY, BODY_METRIC_GROUPS, BODY_METRICS } from "@/lib/bodyCompositionKnowledge";
import {
  assessMetric,
  buildBodyInsights,
  buildRecoveryLink,
  selectComparable,
  type HealthContextEntry,
  type BodyProfile,
  type MetricAssessment,
  type MetricStatus,
} from "@/lib/bodyCompositionInsights";
import type { BodyMeasurement, BodyMetricKey } from "@/types/body";

export type BodyRange = "7d" | "30d" | "90d" | "all";

interface ScaleProfileHint {
  sex: "male" | "female" | null;
  heightCm: number | null;
}

interface BodyData {
  measurements: BodyMeasurement[];
  profile: BodyProfile;
}

function ageFromBirthdate(birthdate: string | undefined): number | null {
  const [day, month, year] = (birthdate ?? "").split("/").map(Number);
  if (!day || !month || !year) return null;
  const now = new Date();
  let age = now.getFullYear() - year;
  if (now < new Date(now.getFullYear(), month - 1, day)) age -= 1;
  return age;
}

/** Loads scale readings plus the profile needed to grade them. Tolerates unexpected payloads. */
export function useBodyData(range: BodyRange, reloadToken = 0) {
  const [data, setData] = useState<BodyData>({ measurements: [], profile: { age: null, sex: null, heightCm: null } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [bodyRes, profileRes] = await Promise.all([
          fetch(`/api/body/measurements?range=${range}`, { cache: "no-store" }),
          fetch("/api/profile", { cache: "no-store" }).catch(() => null),
        ]);
        if (!bodyRes.ok) throw new Error("Could not load body measurements.");
        const body = (await bodyRes.json()) as { measurements?: BodyMeasurement[]; scaleProfile?: ScaleProfileHint };
        const profileDoc = profileRes && profileRes.ok ? ((await profileRes.json()) as { birthdate?: string; sex?: "male" | "female" | "other" | null; heightCm?: number }) : null;
        if (cancelled) return;
        const measurements = Array.isArray(body.measurements) ? body.measurements : [];
        const profileSex = profileDoc?.sex === "male" || profileDoc?.sex === "female" ? profileDoc.sex : null;
        setData({
          measurements,
          profile: {
            age: ageFromBirthdate(profileDoc?.birthdate),
            sex: profileSex ?? body.scaleProfile?.sex ?? null,
            heightCm: profileDoc?.heightCm ?? body.scaleProfile?.heightCm ?? null,
          },
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load body measurements.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [range, reloadToken]);

  return { ...data, loading, error };
}

const STATUS_STYLE: Record<MetricStatus, string> = {
  "in-range": "bg-green-100 text-green-800",
  above: "bg-amber-100 text-amber-800",
  below: "bg-sky-100 text-sky-800",
  ungraded: "bg-slate-100 text-slate-600",
};

const STATUS_LABEL: Record<MetricStatus, string> = {
  "in-range": "In range",
  above: "Above range",
  below: "Below range",
  ungraded: "Not graded",
};

function formatValue(key: BodyMetricKey, value: number | null): string {
  if (value === null) return "–";
  const k = BODY_METRIC_BY_KEY[key];
  return `${value.toFixed(k.decimals)}${k.unit === "%" ? "%" : k.unit ? ` ${k.unit}` : ""}`;
}

function trendArrow(a: MetricAssessment): { symbol: string; label: string } {
  const { direction, n } = a.trend;
  if (direction === "insufficient") return { symbol: "…", label: n < 2 ? "1 reading" : "need 3+ readings" };
  if (direction === "flat") return { symbol: "●", label: "stable" };
  return direction === "up" ? { symbol: "▲", label: "rising" } : { symbol: "▼", label: "falling" };
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

function fullDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
  const time = d.toISOString().slice(11, 16);
  return `${date} ${time}`;
}

function signed(value: number | null, decimals: number): string {
  if (value === null) return "–";
  return `${value >= 0 ? "+" : ""}${value.toFixed(decimals)}`;
}

const TILE_KEYS: BodyMetricKey[] = ["weightKg", "fatPct", "skeletalMuscleKg", "visceralFat", "bmr", "bodyAge"];

function KpiTile({ a }: { a: MetricAssessment }) {
  const k = BODY_METRIC_BY_KEY[a.key];
  const arrow = trendArrow(a);
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4" data-testid={`body-tile-${a.key}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{k.label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{formatValue(a.key, a.latest)}</p>
      <p className="mt-1 text-xs text-slate-600">
        <span aria-hidden="true">{arrow.symbol}</span> {arrow.label}
        {a.trend.deltaPrev !== null && <> · vs previous {signed(a.trend.deltaPrev, k.decimals === 0 ? 0 : 1)}</>}
      </p>
      <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[a.status]}`}>{STATUS_LABEL[a.status]}</span>
    </div>
  );
}

function ImportButton({ onImported }: { onImported: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function upload(file: File) {
    setBusy(true);
    setMessage("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/body/import", { method: "POST", body: form });
      const json = (await res.json()) as { error?: string; inserted?: number; updated?: number; total?: number; warnings?: string[] };
      if (!res.ok) {
        setMessage(json.error ?? "Import failed.");
        return;
      }
      const warn = json.warnings?.length ? ` (${json.warnings.length} warning${json.warnings.length === 1 ? "" : "s"})` : "";
      setMessage(`Imported ${json.total} readings: ${json.inserted} new, ${json.updated} updated${warn}.`);
      onImported();
    } catch {
      setMessage("Import failed. Check your connection and try again.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        data-testid="body-import-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-60"
      >
        {busy ? "Importing..." : "Import scale file (.xlsx)"}
      </button>
      {message && <span className="text-sm text-slate-700" role="status">{message}</span>}
    </div>
  );
}

interface Props {
  range: BodyRange;
  /** Daily Apple Health entries already loaded by the dashboard; used for the recovery comparison. */
  healthEntries?: HealthContextEntry[];
}

export default function BodyCompositionSection({ range, healthEntries = [] }: Props) {
  const [reload, setReload] = useState(0);
  const [includeEvening, setIncludeEvening] = useState(false);
  const { measurements, profile, loading, error } = useBodyData(range, reload);
  const onImported = useCallback(() => setReload((n) => n + 1), []);

  const comparable = useMemo(() => selectComparable(measurements, includeEvening), [measurements, includeEvening]);
  const assessments = useMemo(
    () => Object.fromEntries(BODY_METRICS.map((m) => [m.key, assessMetric(comparable, m.key, profile)])) as Record<BodyMetricKey, MetricAssessment>,
    [comparable, profile]
  );
  const insights = useMemo(() => buildBodyInsights(comparable, profile, measurements.length), [comparable, profile, measurements.length]);
  const excluded = measurements.length - comparable.length;
  const recoveryLink = useMemo(() => buildRecoveryLink(comparable, healthEntries), [comparable, healthEntries]);

  const trendData = comparable.map((m) => ({ label: shortDate(m.measuredAt), weight: m.weightKg, fat: m.fatPct }));
  const compositionData = comparable.map((m) => ({
    label: shortDate(m.measuredAt),
    fat: m.fatKg,
    lean: m.leanMassKg !== null && m.boneMassKg !== null ? +(m.leanMassKg - m.boneMassKg).toFixed(1) : m.leanMassKg,
    bone: m.boneMassKg,
  }));

  if (loading) return <p className="text-sm text-gray-500">Loading body measurements...</p>;

  const latest = measurements[measurements.length - 1];

  return (
    <section className="space-y-5" data-testid="body-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 text-sm">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Body Composition</h2>
          <p className="text-slate-600">
            {latest ? `Last reading ${fullDateTime(latest.measuredAt)} · ${measurements.length} reading${measurements.length === 1 ? "" : "s"}` : "No scale readings imported yet."}
          </p>
        </div>
        <ImportButton onImported={onImported} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!error && measurements.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-700" data-testid="body-empty">
          Import a smart-scale export (.xlsx with Date, Time, Weight(Kg), Fat(%) and the other columns) to see weight, fat, muscle and visceral-fat analysis with explanations for each parameter.
        </div>
      )}

      {measurements.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" data-testid="body-quality">
            <span>
              {comparable.length} of {measurements.length} readings used for trends.
              {excluded > 0 && " Evening readings are excluded because hydration changes during the day distort impedance results."}
              {comparable.length < 3 && " At least 3 readings are needed before a trend is shown."}
            </span>
            {measurements.some((m) => m.isEvening) && measurements.length > 1 && (
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={includeEvening} onChange={(e) => setIncludeEvening(e.target.checked)} />
                Include evening readings
              </label>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            {TILE_KEYS.map((key) => (
              <KpiTile key={key} a={assessments[key]} />
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">Weight and body fat %</h3>
              <div className="mt-2 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" />
                    <YAxis yAxisId="w" domain={["auto", "auto"]} unit=" kg" width={64} />
                    <YAxis yAxisId="f" orientation="right" domain={["auto", "auto"]} unit="%" width={48} />
                    <Tooltip />
                    <Legend />
                    <Line yAxisId="w" type="monotone" dataKey="weight" name="Weight (kg)" stroke="#2563eb" strokeWidth={2} dot />
                    <Line yAxisId="f" type="monotone" dataKey="fat" name="Body fat (%)" stroke="#d97706" strokeWidth={2} dot />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">Composition per reading (kg)</h3>
              <div className="mt-2 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={compositionData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" />
                    <YAxis unit=" kg" width={64} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="fat" name="Fat" stackId="c" fill="#d97706" />
                    <Bar dataKey="lean" name="Lean (ex. bone)" stackId="c" fill="#2563eb" />
                    <Bar dataKey="bone" name="Bone" stackId="c" fill="#64748b" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white" data-testid="body-explainer">
            <div className="border-b border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Every parameter: what it is and what it means for you</h3>
              <p className="text-xs text-slate-600">Ranges are labelled with their source. Scale-specific ranges only compare against the same brand of scale.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs text-slate-900">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Parameter</th>
                    <th className="px-3 py-2">Latest</th>
                    <th className="px-3 py-2">Trend</th>
                    <th className="px-3 py-2">Range and status</th>
                    <th className="px-3 py-2">What it means for me</th>
                  </tr>
                </thead>
                <tbody>
                  {BODY_METRIC_GROUPS.map((group) => (
                    <GroupRows key={group} group={group} assessments={assessments} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {insights.map((block) => (
              <div key={block.title}>
                <p className="mb-1 text-sm font-semibold text-slate-900">{block.title}</p>
                <MetricConclusion title={block.title} summary={block.summary} trend={block.trend} action={block.action} />
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white" data-testid="body-recovery-link">
            <div className="border-b border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Body vs Apple Health (context)</h3>
              <p className="text-xs text-slate-600">
                {recoveryLink
                  ? `Average of the ${recoveryLink.windowDays} days up to your first reading (${shortDate(recoveryLink.from)}) vs up to your latest (${shortDate(recoveryLink.to)}).`
                  : "Needs at least two comparable readings 7+ days apart and 3+ days of Apple Health data around each."}
              </p>
            </div>
            {recoveryLink ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-xs text-slate-900">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Metric</th>
                      <th className="px-3 py-2">Before</th>
                      <th className="px-3 py-2">Latest</th>
                      <th className="px-3 py-2">Change</th>
                      <th className="px-3 py-2">Direction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recoveryLink.rows.map((r) => (
                      <tr key={r.key} className="border-t border-slate-100" data-testid={`recovery-row-${r.key}`}>
                        <td className="px-3 py-2 font-medium">{r.label}</td>
                        <td className="whitespace-nowrap px-3 py-2">{r.before?.toFixed(r.decimals)} {r.unit}</td>
                        <td className="whitespace-nowrap px-3 py-2">{r.after?.toFixed(r.decimals)} {r.unit}</td>
                        <td className="whitespace-nowrap px-3 py-2">{signed(r.delta, r.decimals)}</td>
                        <td className="px-3 py-2">
                          <span className={`rounded-full px-2 py-0.5 ${r.favourable === null ? STATUS_STYLE.ungraded : r.favourable ? STATUS_STYLE["in-range"] : STATUS_STYLE.above}`}>
                            {r.favourable === null ? "Stable / neutral" : r.favourable ? "Favourable" : "Unfavourable"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <p className="border-t border-slate-100 p-3 text-xs text-slate-600">
              This shows what else was happening, not what caused it. With only {comparable.length} weigh-in{comparable.length === 1 ? "" : "s"} a correlation would be meaningless. Lower resting heart rate, higher HRV and higher VO₂ max alongside falling fat are the pattern to look for over months.
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white" data-testid="body-raw-table">
            <div className="border-b border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Imported scale readings</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs text-slate-900">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-2">Date</th>
                    {BODY_METRICS.map((m) => (
                      <th key={m.key} className="whitespace-nowrap px-3 py-2">
                        {m.label}
                        {m.unit && <span className="font-normal"> ({m.unit})</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...measurements].reverse().map((m) => (
                    <tr key={m.measuredAt} className="border-t border-slate-100">
                      <td className="whitespace-nowrap px-3 py-2">
                        {fullDateTime(m.measuredAt)}
                        {m.isEvening && <span className="ml-1 rounded bg-amber-100 px-1 text-amber-800">evening</span>}
                      </td>
                      {BODY_METRICS.map((k) => (
                        <td key={k.key} className="whitespace-nowrap px-3 py-2">
                          {m[k.key] === null ? "–" : (m[k.key] as number).toFixed(k.decimals)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function GroupRows({ group, assessments }: { group: string; assessments: Record<BodyMetricKey, MetricAssessment> }) {
  const metrics = BODY_METRICS.filter((m) => m.group === group);
  return (
    <>
      <tr className="bg-slate-100">
        <td colSpan={5} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">{group}</td>
      </tr>
      {metrics.map((m) => {
        const a = assessments[m.key];
        const arrow = trendArrow(a);
        return (
          <tr key={m.key} className="border-t border-slate-100 align-top" data-testid={`body-row-${m.key}`}>
            <td className="px-3 py-2 font-medium">
              <div className="flex items-center gap-2">
                <span>{m.label}</span>
                <TooltipInfo
                  title={m.label}
                  content={{ why: `${m.what} ${m.why}`, trendMeaning: m.trendMeaning, actionableRecommendations: m.actions }}
                />
              </div>
            </td>
            <td className="whitespace-nowrap px-3 py-2">{formatValue(m.key, a.latest)}</td>
            <td className="whitespace-nowrap px-3 py-2">
              <span aria-hidden="true">{arrow.symbol}</span> {arrow.label}
            </td>
            <td className="px-3 py-2">
              <div>{a.rangeText}</div>
              <span className={`mt-1 inline-block rounded-full px-2 py-0.5 ${STATUS_STYLE[a.status]}`}>{STATUS_LABEL[a.status]}</span>
              {a.range && <div className="mt-1 text-slate-500">{a.range.source}</div>}
            </td>
            <td className="min-w-[18rem] px-3 py-2 text-slate-700">{a.forMe}</td>
          </tr>
        );
      })}
    </>
  );
}

/** Compact card for the Overview tab. Renders nothing when there is no data. */
export function BodySnapshotCard({ range, onOpen }: { range: BodyRange; onOpen: () => void }) {
  const { measurements, profile, loading, error } = useBodyData(range);
  const comparable = useMemo(() => selectComparable(measurements), [measurements]);
  if (loading || error || comparable.length === 0) return null;

  const keys: BodyMetricKey[] = ["weightKg", "fatPct", "skeletalMuscleKg"];
  const latest = measurements[measurements.length - 1];
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4" data-testid="body-snapshot">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Body snapshot · {fullDateTime(latest.measuredAt)}</h3>
        <button type="button" onClick={onOpen} className="text-sm font-medium text-blue-700 hover:underline" data-testid="body-snapshot-link">
          View details →
        </button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {keys.map((key) => {
          const a = assessMetric(comparable, key, profile);
          const k = BODY_METRIC_BY_KEY[key];
          return (
            <div key={key}>
              <p className="text-xs text-slate-500">{k.label}</p>
              <p className="text-xl font-semibold text-slate-900">{formatValue(key, a.latest)}</p>
              <p className="text-xs text-slate-600">{trendArrow(a).label}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

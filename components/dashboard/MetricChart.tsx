"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";
import TooltipInfo from "@/components/dashboard/TooltipInfo";
import { TOOLTIP_CONTENT } from "@/lib/tooltipContent";

export interface MetricPoint {
  label: string;
  value: number | null;
}

interface Props {
  title: string;
  tooltipKey: keyof typeof TOOLTIP_CONTENT;
  data: MetricPoint[];
  unit?: string;
  variant?: "line" | "bar";
}

type TooltipValue = number | string | Array<number | string> | undefined;

function formatTooltipValue(value: TooltipValue, unit: string): string {
  if (Array.isArray(value)) {
    return `${value.join(" - ")}${unit ? ` ${unit}` : ""}`;
  }

  if (value === undefined) {
    return unit ? `0 ${unit}` : "0";
  }

  return `${value}${unit ? ` ${unit}` : ""}`;
}

function formatAxisLabel(label: string): string {
  if (/^\d{4}-W\d{2}$/.test(label)) {
    const [year, week] = label.split("-W");
    return `W${Number(week)}-${year}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(label)) {
    const [year, month, day] = label.split("-");
    return `${day}-${month}-${year}`;
  }

  return label;
}

export default function MetricChart({ title, tooltipKey, data, unit = "", variant = "line" }: Props) {
  const cleaned = data.filter((d) => d.value !== null) as Array<{ label: string; value: number }>;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm" data-testid="metric-chart">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <p className="text-xs text-gray-500">Unit: {unit || "n/a"}</p>
        </div>
        <TooltipInfo title={title} content={TOOLTIP_CONTENT[tooltipKey]} />
      </div>

      {cleaned.length === 0 ? (
        <div className="flex h-52 items-center justify-center rounded-md border border-dashed border-gray-300 text-sm text-gray-400" data-testid="metric-chart-empty">
          No data in selected range
        </div>
      ) : (
        <div className="h-52" data-testid="metric-chart-rendered">
          <ResponsiveContainer width="100%" height="100%">
            {variant === "bar" ? (
              <BarChart data={cleaned}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickFormatter={formatAxisLabel} interval={0} minTickGap={16} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => formatTooltipValue(value as TooltipValue, unit)} />
                <Bar dataKey="value" fill="#2563eb" radius={[6, 6, 0, 0]} />
              </BarChart>
            ) : (
              <LineChart data={cleaned}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickFormatter={formatAxisLabel} interval={0} minTickGap={16} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => formatTooltipValue(value as TooltipValue, unit)} />
                <Line type="monotone" dataKey="value" stroke="#1d4ed8" strokeWidth={2} dot={false} />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

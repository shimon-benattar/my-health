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

export default function MetricChart({ title, tooltipKey, data, unit = "", variant = "line" }: Props) {
  const cleaned = data.filter((d) => d.value !== null) as Array<{ label: string; value: number }>;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm" data-testid="metric-chart">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
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
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(val: number) => `${val}${unit ? ` ${unit}` : ""}`} />
                <Bar dataKey="value" fill="#2563eb" radius={[6, 6, 0, 0]} />
              </BarChart>
            ) : (
              <LineChart data={cleaned}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(val: number) => `${val}${unit ? ` ${unit}` : ""}`} />
                <Line type="monotone" dataKey="value" stroke="#1d4ed8" strokeWidth={2} dot={false} />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

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
import type { ReactNode } from "react";
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

function weekStartFromIsoLabel(label: string): Date | null {
  const match = label.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const week = Number(match[2]);
  const fourthOfJanuary = new Date(Date.UTC(year, 0, 4));
  const fourthDay = fourthOfJanuary.getUTCDay() || 7;
  const weekOneMonday = new Date(fourthOfJanuary);
  weekOneMonday.setUTCDate(fourthOfJanuary.getUTCDate() - fourthDay + 1);

  const weekStart = new Date(weekOneMonday);
  weekStart.setUTCDate(weekOneMonday.getUTCDate() + (week - 1) * 7);
  return weekStart;
}

export function formatAxisLabel(label: string): string {
  if (/^\d{4}-W\d{2}$/.test(label)) {
    const weekStart = weekStartFromIsoLabel(label);
    if (!weekStart) return label;

    return weekStart.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  }

  if (/^\d{4}-\d{2}$/.test(label)) {
    const [year, month] = label.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-GB", {
      month: "short",
      year: "2-digit",
      timeZone: "UTC",
    });
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(label)) {
    return new Date(`${label}T00:00:00.000Z`).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      timeZone: "UTC",
    });
  }

  return label;
}

export function formatTooltipLabel(label: string): string {
  if (/^\d{4}-W\d{2}$/.test(label)) {
    const weekStart = weekStartFromIsoLabel(label);
    if (!weekStart) return label;
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekStart.getUTCDate() + 6);

    return `Week of ${weekStart.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    })} to ${weekEnd.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    })}`;
  }

  if (/^\d{4}-\d{2}$/.test(label)) {
    const [year, month] = label.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(label)) {
    return new Date(`${label}T00:00:00.000Z`).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }

  return label;
}

function formatTooltipLabelNode(label: ReactNode): ReactNode {
  return typeof label === "string" ? formatTooltipLabel(label) : label;
}

export default function MetricChart({ title, tooltipKey, data, unit = "", variant = "line" }: Props) {
  const cleaned = data.filter((d) => d.value !== null) as Array<{ label: string; value: number }>;
  const xTickFontSize = cleaned.length > 40 ? 12 : 13;
  const xTickAngle = cleaned.length > 60 ? -28 : 0;

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
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: xTickFontSize }}
                  tickFormatter={formatAxisLabel}
                  interval="preserveStartEnd"
                  minTickGap={24}
                  angle={xTickAngle}
                  height={xTickAngle !== 0 ? 56 : 30}
                />
                <YAxis tick={{ fontSize: 12 }} width={42} />
                <Tooltip
                  formatter={(value) => formatTooltipValue(value as TooltipValue, unit)}
                  labelFormatter={formatTooltipLabelNode}
                />
                <Bar dataKey="value" fill="#2563eb" radius={[6, 6, 0, 0]} />
              </BarChart>
            ) : (
              <LineChart data={cleaned}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: xTickFontSize }}
                  tickFormatter={formatAxisLabel}
                  interval="preserveStartEnd"
                  minTickGap={24}
                  angle={xTickAngle}
                  height={xTickAngle !== 0 ? 56 : 30}
                />
                <YAxis tick={{ fontSize: 12 }} width={42} />
                <Tooltip
                  formatter={(value) => formatTooltipValue(value as TooltipValue, unit)}
                  labelFormatter={formatTooltipLabelNode}
                />
                <Line type="monotone" dataKey="value" stroke="#1d4ed8" strokeWidth={2} dot={false} />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

import { describe, it, expect } from "vitest";
import { aggregateSeries } from "@/lib/timeAggregation";
import type { MetricPoint } from "@/components/dashboard/MetricChart";

describe("aggregateSeries", () => {
  const data: MetricPoint[] = [
    { label: "2026-05-01", value: 10 },
    { label: "2026-05-02", value: 20 },
    { label: "2026-05-08", value: 30 },
    { label: "2026-05-09", value: 40 },
    { label: "2026-05-16", value: 50 },
  ];

  it("keeps partial edge buckets for average mode", () => {
    const result = aggregateSeries(data, "week", "average");
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].label).toContain("W");
  });

  it("drops partial edge buckets for total mode when trimming is enabled", () => {
    const result = aggregateSeries(data, "week", "total", { trimPartialEdges: true });
    expect(result).toHaveLength(1);
  });
});

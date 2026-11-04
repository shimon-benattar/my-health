import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BodyCompositionSection, { BodySnapshotCard } from "@/components/dashboard/BodyCompositionSection";
import DashboardClient from "@/components/dashboard/DashboardClient";
import { BODY_METRICS } from "@/lib/bodyCompositionKnowledge";
import { BODY_METRIC_KEYS, type BodyMeasurement } from "@/types/body";

vi.mock("recharts", async () => {
  const React = await import("react");
  const Box = ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children);
  return {
    ResponsiveContainer: Box, LineChart: Box, BarChart: Box, Line: Box, Bar: Box,
    CartesianGrid: Box, XAxis: Box, YAxis: Box, Tooltip: Box, Legend: Box,
  };
});
vi.mock("@/components/dashboard/MetricChart", () => ({ default: ({ title }: { title: string }) => <div>{title}</div> }));
vi.mock("@/components/dashboard/SourceDataTable", () => ({ default: () => <div>Source Data Table</div> }));
vi.mock("@/components/dashboard/SportSection", () => ({ default: () => <div>Sport Section</div> }));
vi.mock("@/components/dashboard/ReadinessGauge", () => ({ default: () => <div>gauge</div> }));

function reading(iso: string, o: Partial<BodyMeasurement> = {}): BodyMeasurement {
  const base = Object.fromEntries(BODY_METRIC_KEYS.map((k) => [k, null])) as unknown as BodyMeasurement;
  return {
    ...base, measuredAt: iso, isEvening: new Date(iso).getUTCHours() >= 12,
    weightKg: 85.1, bmi: 27.2, fatPct: 25.7, fatKg: 21.9, skeletalMuscleKg: 33.3, skeletalMusclePct: 39.2,
    visceralFat: 15, waterPct: 53, bmr: 1757, bodyAge: 45, leanMassKg: 63.2, boneMassKg: 3.2, ...o,
  };
}

const MEASUREMENTS = [
  reading("2026-10-15T19:55:00.000Z", { weightKg: 85 }),
  reading("2026-10-18T07:13:00.000Z"),
  reading("2026-10-25T07:18:00.000Z"),
  reading("2026-11-01T07:13:00.000Z"),
];

function mockFetch(measurements: BodyMeasurement[]) {
  const fn = vi.fn(async (url: string) => {
    if (url.startsWith("/api/body/measurements")) {
      return { ok: true, json: async () => ({ measurements, scaleProfile: { sex: "male", heightCm: 177 } }) };
    }
    if (url.startsWith("/api/profile")) {
      return { ok: true, json: async () => ({ birthdate: "21/04/1979", sex: null, heightCm: 177 }) };
    }
    if (url.startsWith("/api/dashboard/metrics")) {
      return {
        ok: true,
        json: async () => ({
          entries: [{ _id: "1", date: "2026-06-01T00:00:00.000Z", sourceType: "apple-health", activeCalories: 1, steps: 1, restingHeartRate: 55 }],
          workouts: [], readiness: 0, readinessTrend: [],
        }),
      };
    }
    return { ok: true, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("BodyCompositionSection", () => {
  it("shows an empty state with an import button when there are no readings", async () => {
    mockFetch([]);
    render(<BodyCompositionSection range="all" />);
    expect(await screen.findByTestId("body-empty")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /import scale file/i })).toBeInTheDocument();
  });

  it("renders tiles, an explainer row for every parameter and the visceral-fat flag", async () => {
    mockFetch(MEASUREMENTS);
    render(<BodyCompositionSection range="all" />);
    const explainer = await screen.findByTestId("body-explainer");
    for (const m of BODY_METRICS) {
      expect(within(explainer).getByTestId(`body-row-${m.key}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId("body-tile-visceralFat")).toHaveTextContent("Above range");
    expect(within(screen.getByTestId("body-row-visceralFat")).getByText(/metabolic and cardiovascular risk/i)).toBeInTheDocument();
  });

  it("excludes the evening reading from trends and flags it in the raw table", async () => {
    mockFetch(MEASUREMENTS);
    render(<BodyCompositionSection range="all" />);
    const quality = await screen.findByTestId("body-quality");
    expect(quality).toHaveTextContent("3 of 4 readings used for trends");
    expect(within(screen.getByTestId("body-raw-table")).getByText("evening")).toBeInTheDocument();
  });

  it("opens the info tooltip with what the parameter is", async () => {
    mockFetch(MEASUREMENTS);
    render(<BodyCompositionSection range="all" />);
    await screen.findByTestId("body-explainer");
    await userEvent.click(screen.getByRole("button", { name: /more info about visceral fat/i }));
    expect(screen.getByText(/fat stored around the abdominal organs/i)).toBeInTheDocument();
  });

  it("shows the Apple Health comparison when entries cover both windows", async () => {
    mockFetch([reading("2026-10-01T07:00:00.000Z"), reading("2026-10-29T07:00:00.000Z")]);
    const day = (iso: string, rhr: number) => ({ date: iso, restingHeartRate: rhr, hrv: null, cardioFitness: null, activeCalories: null, sleep: null });
    const entries = [
      ...Array.from({ length: 10 }, (_, i) => day(`2026-09-${String(20 + i).padStart(2, "0")}T00:00:00.000Z`, 60)),
      ...Array.from({ length: 10 }, (_, i) => day(`2026-10-${String(18 + i).padStart(2, "0")}T00:00:00.000Z`, 55)),
    ];
    render(<BodyCompositionSection range="all" healthEntries={entries} />);
    const row = await screen.findByTestId("recovery-row-restingHeartRate");
    expect(row).toHaveTextContent("Favourable");
    expect(screen.getByTestId("body-recovery-link")).toHaveTextContent(/not what caused it/i);
  });

  it("explains why the Apple Health comparison is unavailable", async () => {
    mockFetch(MEASUREMENTS);
    render(<BodyCompositionSection range="all" healthEntries={[]} />);
    expect(await screen.findByTestId("body-recovery-link")).toHaveTextContent(/needs at least two comparable readings/i);
  });

  it("shows an error when loading fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    render(<BodyCompositionSection range="all" />);
    expect(await screen.findByText(/could not load body measurements/i)).toBeInTheDocument();
  });
});

describe("BodySnapshotCard", () => {
  it("renders nothing when there is no data", async () => {
    mockFetch([]);
    const { container } = render(<BodySnapshotCard range="all" onOpen={() => {}} />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("shows latest values and opens the body tab", async () => {
    mockFetch(MEASUREMENTS);
    const onOpen = vi.fn();
    render(<BodySnapshotCard range="all" onOpen={onOpen} />);
    expect(await screen.findByTestId("body-snapshot")).toHaveTextContent("85.10 kg");
    await userEvent.click(screen.getByTestId("body-snapshot-link"));
    expect(onOpen).toHaveBeenCalled();
  });
});

describe("DashboardClient body tab", () => {
  it("places the Body Composition tab between Overview and Sport and switches to it", async () => {
    mockFetch(MEASUREMENTS);
    render(<DashboardClient initialTab="overview" />);
    const overview = await screen.findByTestId("tab-overview");
    const body = screen.getByTestId("tab-body");
    const sport = screen.getByTestId("tab-sport");
    expect(overview.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(body.compareDocumentPosition(sport) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await userEvent.click(body);
    expect(await screen.findByTestId("body-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("overview-panel")).not.toBeInTheDocument();
  });

  it("opens directly on the body tab when initialTab is body", async () => {
    mockFetch(MEASUREMENTS);
    render(<DashboardClient initialTab="body" />);
    expect(await screen.findByTestId("body-panel")).toBeInTheDocument();
  });
});

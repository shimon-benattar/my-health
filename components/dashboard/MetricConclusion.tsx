interface Props {
  title: string;
  summary: string;
  trend: string;
  action: string;
}

export default function MetricConclusion({ title, summary, trend, action }: Props) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800" data-testid={`metric-conclusion-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">What this tells me</p>
      <p className="mt-2 font-medium text-slate-900">{summary}</p>
      <p className="mt-3"><span className="font-semibold text-slate-900">Trend:</span> {trend}</p>
      <p className="mt-2"><span className="font-semibold text-slate-900">What to do:</span> {action}</p>
    </div>
  );
}

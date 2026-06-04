interface Props {
  score: number;
}

function getBandColor(score: number): string {
  if (score <= 39) return "text-red-600";
  if (score <= 69) return "text-amber-600";
  return "text-green-600";
}

function getStrokeColor(score: number): string {
  if (score <= 39) return "#dc2626";
  if (score <= 69) return "#d97706";
  return "#16a34a";
}

export default function ReadinessGauge({ score }: Props) {
  const bounded = Math.max(0, Math.min(100, Math.round(score)));
  const circumference = 2 * Math.PI * 40;
  const progress = (bounded / 100) * circumference;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm" data-testid="readiness-gauge">
      <h3 className="text-sm font-semibold text-gray-900">Readiness Score</h3>
      <div className="mt-4 flex items-center gap-4">
        <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true">
          <circle cx="48" cy="48" r="40" fill="none" stroke="#e5e7eb" strokeWidth="10" />
          <circle
            cx="48"
            cy="48"
            r="40"
            fill="none"
            stroke={getStrokeColor(bounded)}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${progress} ${circumference}`}
            transform="rotate(-90 48 48)"
          />
        </svg>
        <div>
          <p className={`text-3xl font-extrabold ${getBandColor(bounded)}`} data-testid="readiness-value">{bounded}</p>
          <p className="text-xs text-gray-500">Based on HRV and yesterday sleep</p>
        </div>
      </div>
    </div>
  );
}

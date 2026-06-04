import Link from "next/link";
import UploadForm from "@/components/UploadForm";

const STAT_CARDS = [
  { label: "Steps", value: "9,243", icon: "🚶", color: "blue", pos: "top-24 left-8", anim: "animate-float" },
  { label: "Sleep", value: "7h 23m", icon: "😴", color: "purple", pos: "top-32 right-8", anim: "animate-float-slow" },
  { label: "Heart Rate", value: "52–89 bpm", icon: "❤️", color: "red", pos: "bottom-40 left-8", anim: "animate-float-delay" },
  { label: "Calories", value: "487 kcal", icon: "🔥", color: "orange", pos: "bottom-32 right-8", anim: "animate-float-slow" },
] as const;

const COLOR = {
  blue: "border-blue-200 bg-blue-50 text-blue-800",
  purple: "border-purple-200 bg-purple-50 text-purple-800",
  red: "border-red-200 bg-red-50 text-red-800",
  orange: "border-orange-200 bg-orange-50 text-orange-800",
} as const;

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
      {/* Ambient glow blobs */}
      <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-blue-600 opacity-20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-indigo-500 opacity-20 blur-3xl" />

      {/* Floating stat cards — hidden on small screens */}
      {STAT_CARDS.map((card) => (
        <div
          key={card.label}
          className={`absolute hidden lg:block ${card.pos} ${card.anim}`}
          aria-hidden="true"
        >
          <div className={`rounded-xl border px-4 py-3 shadow-lg backdrop-blur-sm ${COLOR[card.color]} min-w-[130px]`}>
            <div className="text-xl">{card.icon}</div>
            <div className="mt-1 text-xs font-medium opacity-70">{card.label}</div>
            <div className="text-base font-bold">{card.value}</div>
          </div>
        </div>
      ))}

      {/* Hero content */}
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 text-center">
        {/* Badge */}
        <div className="animate-fade-in-up mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-blue-200 backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
          Apple Health · CSV Import · MongoDB
        </div>

        {/* Title */}
        <h1 className="animate-fade-in-up-delay bg-gradient-to-r from-white via-blue-100 to-blue-300 bg-clip-text text-6xl font-extrabold tracking-tight text-transparent sm:text-7xl">
          my-health
        </h1>

        {/* Subtitle */}
        <p className="animate-fade-in-up-delay-2 mt-4 max-w-md text-lg text-blue-200/80">
          Your personal health dashboard. Import Apple Health exports and track
          steps, sleep, heart rate, and more.
        </p>

        {/* CTAs */}
        <div className="animate-fade-in-up-delay-2 mt-10 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/dashboard"
            data-testid="view-dashboard-link"
            className="rounded-xl bg-white px-8 py-3.5 text-sm font-semibold text-slate-900 shadow-lg transition hover:bg-blue-50 hover:shadow-blue-500/20 hover:shadow-xl"
          >
            View Dashboard →
          </Link>
          <Link
            href="/dashboard"
            data-testid="import-data-link"
            className="rounded-xl border border-white/20 bg-white/10 px-8 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"
          >
            Import Health Data
          </Link>
        </div>

        <div className="mt-10 w-full max-w-2xl animate-fade-in-up-delay-2 text-left">
          <UploadForm compact />
        </div>
      </div>
    </div>
  );
}


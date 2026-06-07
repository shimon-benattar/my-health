import Link from "next/link";

const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
const BUILD_DATE_RAW = process.env.NEXT_PUBLIC_BUILD_DATE;

function formatBuildDate(input?: string): string {
  if (!input) return "Local development";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  return date.toUTCString();
}

export default function AboutMenu() {
  return (
    <details className="group relative">
      <summary className="list-none cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
        About
      </summary>

      <div className="absolute right-0 z-50 mt-2 w-[22rem] rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-xl">
        <h2 className="text-base font-semibold text-slate-900">my-health</h2>
        <p className="mt-2 leading-relaxed">
          A personal Apple Health ingestion dashboard that turns exported ZIP data into daily metrics and workout insights.
        </p>

        <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">How it works</h3>
        <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm">
          <li>Upload your Apple Health export ZIP.</li>
          <li>Large files upload to Vercel Blob, then the server imports from Blob.</li>
          <li>Data is parsed, normalized, and stored in MongoDB.</li>
          <li>Dashboard endpoints aggregate entries into trend and readiness views.</li>
        </ol>

        <div className="mt-3 rounded-md bg-slate-50 p-3 text-xs text-slate-600">
          <p>
            <span className="font-semibold text-slate-800">Build:</span> {BUILD_ID}
          </p>
          <p className="mt-1">
            <span className="font-semibold text-slate-800">Built at:</span> {formatBuildDate(BUILD_DATE_RAW)}
          </p>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs">
          <Link href="/" className="font-medium text-blue-700 hover:text-blue-800">
            Home
          </Link>
          <Link href="/dashboard" className="font-medium text-blue-700 hover:text-blue-800">
            Dashboard
          </Link>
        </div>
      </div>
    </details>
  );
}

import Link from "next/link";
import { connectDB } from "@/lib/db";
import HealthEntry from "@/lib/models/HealthEntry";
import EntriesTable from "@/components/EntriesTable";
import UploadForm from "@/components/UploadForm";
import type { HealthEntryDoc } from "@/types/health";

export const dynamic = "force-dynamic";

async function getEntries(): Promise<HealthEntryDoc[]> {
  try {
    await connectDB();
    return await HealthEntry.find({}).sort({ date: -1 }).lean() as unknown as HealthEntryDoc[];
  } catch {
    return [];
  }
}

export default async function DashboardPage() {
  const entries = await getEntries();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/" className="flex items-center gap-2 text-blue-600 hover:text-blue-700">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm font-medium">Home</span>
          </Link>
          <h1 className="text-lg font-bold text-gray-900">Health Dashboard</h1>
          <span className="text-sm text-gray-400">{entries.length} entries</span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 space-y-8">
        {/* Import section */}
        <section aria-labelledby="import-heading">
          <h2 id="import-heading" className="mb-4 text-xl font-semibold text-gray-800">
            Import Health Data
          </h2>
          <div className="max-w-lg">
            <UploadForm />
          </div>
        </section>

        {/* Entries section */}
        <section aria-labelledby="entries-heading">
          <h2 id="entries-heading" className="mb-4 text-xl font-semibold text-gray-800">
            Health Entries
          </h2>
          <EntriesTable entries={entries} />
        </section>
      </main>
    </div>
  );
}

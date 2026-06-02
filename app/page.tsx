import UploadForm from "@/components/UploadForm";

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-2 text-3xl font-bold text-gray-900">my-health</h1>
      <p className="mb-8 text-sm text-gray-500">Personal health dashboard</p>
      <UploadForm />
    </main>
  );
}

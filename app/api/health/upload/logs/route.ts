import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import ImportLog from "@/lib/models/ImportLog";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const requestId = params.get("requestId")?.trim() || null;
    const sourceType = params.get("sourceType")?.trim() || null;
    const status = params.get("status")?.trim() || null;
    const limitRaw = Number(params.get("limit") || "25");
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 25;

    await connectDB();

    if (requestId) {
      const log = await ImportLog.findOne({ requestId }).lean();
      if (!log) {
        return NextResponse.json({ error: "Import log not found" }, { status: 404 });
      }
      return NextResponse.json({ log }, { status: 200 });
    }

    const filter: Record<string, unknown> = {};
    if (sourceType) filter.sourceType = sourceType;
    if (status) filter.status = status;

    const logs = await ImportLog.find(filter).sort({ startedAt: -1 }).limit(limit).lean();
    return NextResponse.json({ logs }, { status: 200 });
  } catch (err) {
    console.error("[upload/logs] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

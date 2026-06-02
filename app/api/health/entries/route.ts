import { NextResponse } from "next/server";
import clientPromise from "@/lib/db";
import HealthEntry from "@/lib/models/HealthEntry";

export async function GET() {
  try {
    await clientPromise;

    const entries = await HealthEntry.find({})
      .sort({ date: -1 })
      .lean();

    return NextResponse.json(entries, { status: 200 });
  } catch (err) {
    console.error("[entries] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

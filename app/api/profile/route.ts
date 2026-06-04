import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import UserProfile from "@/lib/models/UserProfile";

const DEFAULT_PROFILE = {
  key: "primary",
  name: "Shimon",
  birthdate: "21/04/1979",
  weightKg: 85,
  heightCm: 177,
};

export async function GET() {
  try {
    await connectDB();

    const doc = await UserProfile.findOneAndUpdate(
      { key: "primary" },
      { $setOnInsert: DEFAULT_PROFILE },
      { upsert: true, returnDocument: "after", lean: true }
    );

    return NextResponse.json(doc, { status: 200 });
  } catch (err) {
    console.error("[profile] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const weightKgRaw = Number((body as { weightKg?: number }).weightKg);

    if (!Number.isFinite(weightKgRaw) || weightKgRaw <= 0 || weightKgRaw > 400) {
      return NextResponse.json({ error: "Invalid weightKg" }, { status: 400 });
    }

    await connectDB();

    const doc = await UserProfile.findOneAndUpdate(
      { key: "primary" },
      { $set: { weightKg: weightKgRaw }, $setOnInsert: DEFAULT_PROFILE },
      { upsert: true, returnDocument: "after", lean: true }
    );

    return NextResponse.json(doc, { status: 200 });
  } catch (err) {
    console.error("[profile] PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import UserProfile from "@/lib/models/UserProfile";

const DEFAULT_PROFILE = {
  key: "primary",
  name: "Shimon",
  birthdate: "21/04/1979",
  weightKg: 85,
  heightCm: 177,
  imageUrl: null,
  sex: null,
  timezone: "Asia/Jerusalem",
  notes: null,
};

function normalizeBirthdate(value: string): string {
  const raw = value.trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    return raw;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split("-");
    return `${d}/${m}/${y}`;
  }
  return raw;
}

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
    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      birthdate?: string;
      weightKg?: number;
      heightCm?: number;
      imageUrl?: string | null;
      sex?: "female" | "male" | "other" | null;
      timezone?: string;
      notes?: string | null;
    };

    const updates: Record<string, unknown> = {};

    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (name.length < 2 || name.length > 80) {
        return NextResponse.json({ error: "Invalid name" }, { status: 400 });
      }
      updates.name = name;
    }

    if (typeof body.birthdate === "string") {
      const normalized = normalizeBirthdate(body.birthdate);
      if (!/^\d{2}\/\d{2}\/\d{4}$/.test(normalized)) {
        return NextResponse.json({ error: "Invalid birthdate" }, { status: 400 });
      }
      updates.birthdate = normalized;
    }

    if (body.weightKg !== undefined) {
      const weightKgRaw = Number(body.weightKg);
      if (!Number.isFinite(weightKgRaw) || weightKgRaw <= 0 || weightKgRaw > 400) {
        return NextResponse.json({ error: "Invalid weightKg" }, { status: 400 });
      }
      updates.weightKg = Math.round(weightKgRaw * 10) / 10;
    }

    if (body.heightCm !== undefined) {
      const heightCmRaw = Number(body.heightCm);
      if (!Number.isFinite(heightCmRaw) || heightCmRaw <= 50 || heightCmRaw > 260) {
        return NextResponse.json({ error: "Invalid heightCm" }, { status: 400 });
      }
      updates.heightCm = Math.round(heightCmRaw);
    }

    if (body.imageUrl !== undefined) {
      if (body.imageUrl === null || body.imageUrl.trim() === "") {
        updates.imageUrl = null;
      } else if (/^https?:\/\//i.test(body.imageUrl.trim())) {
        updates.imageUrl = body.imageUrl.trim();
      } else {
        return NextResponse.json({ error: "Invalid imageUrl" }, { status: 400 });
      }
    }

    if (body.sex !== undefined) {
      if (body.sex === null || body.sex === "female" || body.sex === "male" || body.sex === "other") {
        updates.sex = body.sex;
      } else {
        return NextResponse.json({ error: "Invalid sex" }, { status: 400 });
      }
    }

    if (typeof body.timezone === "string") {
      const timezone = body.timezone.trim();
      if (timezone.length < 3 || timezone.length > 80) {
        return NextResponse.json({ error: "Invalid timezone" }, { status: 400 });
      }
      updates.timezone = timezone;
    }

    if (body.notes !== undefined) {
      if (body.notes === null || body.notes.trim() === "") {
        updates.notes = null;
      } else if (body.notes.length <= 800) {
        updates.notes = body.notes;
      } else {
        return NextResponse.json({ error: "Notes too long" }, { status: 400 });
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No profile fields provided" }, { status: 400 });
    }

    await connectDB();

    const doc = await UserProfile.findOneAndUpdate(
      { key: "primary" },
      { $set: updates, $setOnInsert: DEFAULT_PROFILE },
      { upsert: true, returnDocument: "after", lean: true }
    );

    return NextResponse.json(doc, { status: 200 });
  } catch (err) {
    console.error("[profile] PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

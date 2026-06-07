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

function makeRequestId(): string {
  return `profile_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function errorJson(status: number, error: string, code: string, requestId: string) {
  return NextResponse.json({ error, code, requestId }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

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
  const requestId = makeRequestId();
  try {
    await connectDB();

    const doc = await UserProfile.findOneAndUpdate(
      { key: "primary" },
      { $setOnInsert: DEFAULT_PROFILE },
      { upsert: true, returnDocument: "after", lean: true }
    );

    return NextResponse.json(doc, { status: 200 });
  } catch (err) {
    console.error("[profile][GET] request failed", {
      requestId,
      message: err instanceof Error ? err.message : String(err),
    });
    return errorJson(500, "Failed to load profile", "PROFILE_GET_FAILED", requestId);
  }
}

export async function PATCH(request: NextRequest) {
  const requestId = makeRequestId();
  try {
    const parsed = await request.json().catch(() => ({}));
    if (!isRecord(parsed)) {
      return errorJson(400, "Invalid JSON body", "PROFILE_INVALID_BODY", requestId);
    }
    const body = parsed;

    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) {
      if (typeof body.name !== "string") {
        return errorJson(400, "Invalid name", "PROFILE_INVALID_NAME", requestId);
      }
      const name = body.name.trim();
      if (name.length < 2 || name.length > 80) {
        return errorJson(400, "Invalid name", "PROFILE_INVALID_NAME", requestId);
      }
      updates.name = name;
    }

    if (body.birthdate !== undefined) {
      if (typeof body.birthdate !== "string") {
        return errorJson(400, "Invalid birthdate", "PROFILE_INVALID_BIRTHDATE", requestId);
      }
      const normalized = normalizeBirthdate(body.birthdate);
      if (!/^\d{2}\/\d{2}\/\d{4}$/.test(normalized)) {
        return errorJson(400, "Invalid birthdate", "PROFILE_INVALID_BIRTHDATE", requestId);
      }
      updates.birthdate = normalized;
    }

    if (body.weightKg !== undefined) {
      const weightKgRaw = Number(body.weightKg);
      if (!Number.isFinite(weightKgRaw) || weightKgRaw <= 0 || weightKgRaw > 400) {
        return errorJson(400, "Invalid weight", "PROFILE_INVALID_WEIGHT", requestId);
      }
      updates.weightKg = Math.round(weightKgRaw * 10) / 10;
    }

    if (body.heightCm !== undefined) {
      const heightCmRaw = Number(body.heightCm);
      if (!Number.isFinite(heightCmRaw) || heightCmRaw <= 50 || heightCmRaw > 260) {
        return errorJson(400, "Invalid height", "PROFILE_INVALID_HEIGHT", requestId);
      }
      updates.heightCm = Math.round(heightCmRaw);
    }

    if (body.imageUrl !== undefined) {
      if (body.imageUrl === null) {
        updates.imageUrl = null;
      } else if (typeof body.imageUrl === "string") {
        const imageUrl = body.imageUrl.trim();
        if (imageUrl === "") {
          updates.imageUrl = null;
        } else if (/^https?:\/\//i.test(imageUrl)) {
          updates.imageUrl = imageUrl;
        } else {
          return errorJson(400, "Invalid image URL", "PROFILE_INVALID_IMAGE_URL", requestId);
        }
      } else {
        return errorJson(400, "Invalid image URL", "PROFILE_INVALID_IMAGE_URL", requestId);
      }
    }

    if (body.sex !== undefined) {
      if (body.sex === null || body.sex === "female" || body.sex === "male" || body.sex === "other") {
        updates.sex = body.sex;
      } else {
        return errorJson(400, "Invalid sex", "PROFILE_INVALID_SEX", requestId);
      }
    }

    if (body.timezone !== undefined) {
      if (typeof body.timezone !== "string") {
        return errorJson(400, "Invalid timezone", "PROFILE_INVALID_TIMEZONE", requestId);
      }
      const timezone = body.timezone.trim();
      if (timezone.length < 3 || timezone.length > 80) {
        return errorJson(400, "Invalid timezone", "PROFILE_INVALID_TIMEZONE", requestId);
      }
      updates.timezone = timezone;
    }

    if (body.notes !== undefined) {
      if (body.notes === null) {
        updates.notes = null;
      } else if (typeof body.notes === "string") {
        const notes = body.notes.trim();
        if (notes === "") {
          updates.notes = null;
        } else if (notes.length <= 800) {
          updates.notes = notes;
        } else {
          return errorJson(400, "Notes too long", "PROFILE_NOTES_TOO_LONG", requestId);
        }
      } else {
        return errorJson(400, "Invalid notes", "PROFILE_INVALID_NOTES", requestId);
      }
    }

    if (Object.keys(updates).length === 0) {
      return errorJson(400, "No profile fields provided", "PROFILE_EMPTY_PATCH", requestId);
    }

    await connectDB();

    const doc = await UserProfile.findOneAndUpdate(
      { key: "primary" },
      { $set: updates, $setOnInsert: DEFAULT_PROFILE },
      { upsert: true, returnDocument: "after", lean: true }
    );

    return NextResponse.json(doc, { status: 200 });
  } catch (err) {
    console.error("[profile][PATCH] request failed", {
      requestId,
      message: err instanceof Error ? err.message : String(err),
    });
    return errorJson(500, "Failed to save profile", "PROFILE_PATCH_FAILED", requestId);
  }
}

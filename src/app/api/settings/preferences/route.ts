import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { SNOOZE_PRESETS } from "@/lib/snooze";
import { logError } from "@/lib/logger";
import { z } from "zod";

const PREFS_KEY = "user_preferences";
const DEFAULTS = { defaultSnoozePreset: "3_days" as const };

const PrefsSchema = z.object({
  defaultSnoozePreset: z.enum(SNOOZE_PRESETS),
});

export async function GET(_request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, PREFS_KEY)).limit(1);
    if (!row) return NextResponse.json(DEFAULTS);

    const parsed = PrefsSchema.safeParse(row.value);
    if (!parsed.success) return NextResponse.json(DEFAULTS);
    return NextResponse.json(parsed.data);
  } catch (err) {
    logError("preferences_get_failed", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = PrefsSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });

  try {
    const now = new Date();
    const [existing] = await db.select().from(appSettings).where(eq(appSettings.key, PREFS_KEY)).limit(1);
    if (existing) {
      await db.update(appSettings).set({ value: parsed.data, updatedAt: now }).where(eq(appSettings.key, PREFS_KEY));
    } else {
      await db.insert(appSettings).values({ key: PREFS_KEY, value: parsed.data });
    }
    return NextResponse.json({ success: true, ...parsed.data });
  } catch (err) {
    logError("preferences_put_failed", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

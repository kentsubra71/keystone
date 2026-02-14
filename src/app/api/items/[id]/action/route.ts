import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { markItemDone, snoozeItem, ignoreItem } from "@/lib/services/learning";
import { z } from "zod";

const ActionSchema = z.object({
  action: z.enum(["done", "snooze", "ignore"]),
  snoozeDays: z.number().optional(),
});

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = ActionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }

    const { action, snoozeDays } = parsed.data;

    switch (action) {
      case "done":
        await markItemDone(id);
        break;
      case "snooze":
        await snoozeItem(id, snoozeDays || 1);
        break;
      case "ignore":
        await ignoreItem(id);
        break;
    }

    return NextResponse.json({ success: true, action });
  } catch (error) {
    console.error("Item action error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

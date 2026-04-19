import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { markItemDone, snoozeItem, ignoreItem } from "@/lib/services/learning";
import { ItemNotFoundError } from "@/lib/errors";
import { logError } from "@/lib/logger";
import { z } from "zod";

const ActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("done") }),
  z.object({ action: z.literal("ignore") }),
  z.object({ action: z.literal("snooze"), snoozedUntil: z.string().datetime() }),
]);

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    switch (parsed.data.action) {
      case "done":
        await markItemDone(id);
        break;
      case "snooze":
        await snoozeItem(id, new Date(parsed.data.snoozedUntil));
        break;
      case "ignore":
        await ignoreItem(id);
        break;
    }
    return NextResponse.json({ success: true, action: parsed.data.action });
  } catch (error) {
    if (error instanceof ItemNotFoundError) {
      return NextResponse.json(
        { error: "item_not_found", itemId: error.itemId },
        { status: 404 }
      );
    }
    logError("item_action_failed", error, { itemId: id, action: parsed.data.action });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

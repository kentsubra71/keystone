import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { dueFromMeItems } from "@/lib/db/schema";
import { eq, and, sql, ne } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get("filter"); // "due" | "blocking" | "all"

    // Select with dynamically computed aging fields
    const selectFields = {
      id: dueFromMeItems.id,
      type: dueFromMeItems.type,
      status: dueFromMeItems.status,
      title: dueFromMeItems.title,
      source: dueFromMeItems.source,
      sourceId: dueFromMeItems.sourceId,
      blockingWho: dueFromMeItems.blockingWho,
      ownerEmail: dueFromMeItems.ownerEmail,
      firstSeenAt: dueFromMeItems.firstSeenAt,
      lastSeenAt: dueFromMeItems.lastSeenAt,
      statusChangedAt: dueFromMeItems.statusChangedAt,
      confidenceScore: dueFromMeItems.confidenceScore,
      rationale: dueFromMeItems.rationale,
      suggestedAction: dueFromMeItems.suggestedAction,
      notes: dueFromMeItems.notes,
      createdAt: dueFromMeItems.createdAt,
      // Dynamic aging: compute from first_seen_at instead of using stored value
      agingDays: sql<number>`EXTRACT(DAY FROM NOW() - ${dueFromMeItems.firstSeenAt})::int`.as("aging_days"),
      daysInCurrentStatus: sql<number>`EXTRACT(DAY FROM NOW() - ${dueFromMeItems.statusChangedAt})::int`.as("days_in_current_status"),
    };

    let items;

    if (filter === "blocking") {
      items = await db
        .select(selectFields)
        .from(dueFromMeItems)
        .where(
          and(
            sql`${dueFromMeItems.blockingWho} IS NOT NULL`,
            ne(dueFromMeItems.status, "done"),
            ne(dueFromMeItems.status, "deferred")
          )
        );
    } else if (filter === "due") {
      items = await db
        .select(selectFields)
        .from(dueFromMeItems)
        .where(
          and(
            ne(dueFromMeItems.status, "done"),
            ne(dueFromMeItems.status, "deferred")
          )
        );
    } else {
      items = await db.select(selectFields).from(dueFromMeItems);
    }

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Due from me API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

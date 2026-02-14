import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sheetItems } from "@/lib/db/schema";
import { and, sql, ne } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const userEmail = session.user?.email || "";

    // Compute overdue and at-risk dynamically instead of relying on stale stored flags
    const items = await db
      .select({
        id: sheetItems.id,
        commitment: sheetItems.commitment,
        ownerLabel: sheetItems.ownerLabel,
        ownerEmail: sheetItems.ownerEmail,
        dueDate: sheetItems.dueDate,
        status: sheetItems.status,
        rawStatus: sheetItems.rawStatus,
        comments: sheetItems.comments,
        firstSeenAt: sheetItems.firstSeenAt,
        lastSeenAt: sheetItems.lastSeenAt,
        needsOwnerMapping: sheetItems.needsOwnerMapping,
        // Dynamic computation: overdue if due_date < now
        isOverdue: sql<boolean>`CASE WHEN ${sheetItems.dueDate} IS NOT NULL AND ${sheetItems.dueDate} < NOW() THEN true ELSE false END`.as("is_overdue"),
        // Dynamic computation: at-risk if due within 3 days
        isAtRisk: sql<boolean>`CASE WHEN ${sheetItems.dueDate} IS NOT NULL AND ${sheetItems.dueDate} >= NOW() AND ${sheetItems.dueDate} < NOW() + INTERVAL '3 days' THEN true ELSE false END`.as("is_at_risk"),
        // Dynamic aging
        agingDays: sql<number>`EXTRACT(DAY FROM NOW() - ${sheetItems.firstSeenAt})::int`.as("aging_days"),
      })
      .from(sheetItems)
      .where(
        and(
          sql`${sheetItems.ownerEmail} IS NOT NULL`,
          sql`LOWER(${sheetItems.ownerEmail}) != LOWER(${userEmail})`,
          ne(sheetItems.status, "done" as any)
        )
      );

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Waiting on API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

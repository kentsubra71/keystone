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

    let items;

    if (filter === "blocking") {
      // Items where I am blocking others
      items = await db
        .select()
        .from(dueFromMeItems)
        .where(
          and(
            sql`${dueFromMeItems.blockingWho} IS NOT NULL`,
            ne(dueFromMeItems.status, "done")
          )
        );
    } else if (filter === "due") {
      // Items due from me (not done)
      items = await db
        .select()
        .from(dueFromMeItems)
        .where(ne(dueFromMeItems.status, "done"));
    } else {
      // All items
      items = await db.select().from(dueFromMeItems);
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

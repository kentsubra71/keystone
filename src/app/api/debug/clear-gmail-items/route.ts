import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { dueFromMeItems, gmailThreads } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Delete due-from-me items that came from Gmail
    await db.delete(dueFromMeItems).where(eq(dueFromMeItems.source, "gmail"));
    
    // Delete Gmail thread records
    await db.delete(gmailThreads);

    return NextResponse.json({
      success: true,
      message: "Gmail items cleared. Run Sync Gmail to re-import with new filters.",
    });
  } catch (error) {
    console.error("Clear Gmail items error:", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sheetItems } from "@/lib/db/schema";

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Delete all sheet items to allow fresh sync
    await db.delete(sheetItems);

    return NextResponse.json({
      success: true,
      message: "All sheet items cleared. Run Sync Now to re-import.",
    });
  } catch (error) {
    console.error("Clear error:", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}

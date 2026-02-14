import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { syncSheetItems } from "@/lib/services/sheet-sync";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncSheetItems(session.accessToken || undefined);

    if (!result.success) {
      return NextResponse.json(
        { error: "Sync failed", details: result.errors },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: "Sheet sync completed",
      added: result.added,
      updated: result.updated,
      unchanged: result.unchanged,
      disappeared: result.disappeared,
    });
  } catch (error) {
    console.error("Sheet sync API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

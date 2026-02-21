import { NextRequest, NextResponse } from "next/server";
import { syncSheetItems } from "@/lib/services/sheet-sync";
import { verifyCronSecret } from "@/lib/cron-auth";

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncSheetItems();

    return NextResponse.json({
      message: "Cron: Sheet sync completed",
      added: result.added,
      updated: result.updated,
      unchanged: result.unchanged,
      disappeared: result.disappeared,
    });
  } catch (error) {
    console.error("Cron Sheet sync error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

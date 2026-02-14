import { NextRequest, NextResponse } from "next/server";
import { syncSheetItems } from "@/lib/services/sheet-sync";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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

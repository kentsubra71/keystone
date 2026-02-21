import { NextRequest, NextResponse } from "next/server";
import { syncGmailThreads } from "@/lib/services/gmail-sync";
import { refreshStoredToken, verifyCronSecret } from "@/lib/cron-auth";

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { accessToken, userEmail } = await refreshStoredToken();
    const result = await syncGmailThreads(accessToken, userEmail);

    return NextResponse.json({
      message: "Cron: Gmail sync completed",
      ...result,
    });
  } catch (error) {
    console.error("Cron Gmail sync error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

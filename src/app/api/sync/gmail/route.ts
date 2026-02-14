import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { syncGmailThreads } from "@/lib/services/gmail-sync";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.accessToken) {
    return NextResponse.json(
      { error: "No access token - please re-authenticate with Google" },
      { status: 401 }
    );
  }

  try {
    const result = await syncGmailThreads(session.accessToken, session.user?.email || undefined);

    if (!result.success) {
      return NextResponse.json(
        { error: "Gmail sync failed", details: result.errors },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: "Gmail sync completed",
      threadsProcessed: result.threadsProcessed,
      dueItemsCreated: result.dueItemsCreated,
      skippedMailingList: (result as any).skippedMailingList || 0,
    });
  } catch (error) {
    console.error("Gmail sync API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

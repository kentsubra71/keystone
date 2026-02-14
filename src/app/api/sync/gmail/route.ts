import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { syncGmailThreads } from "@/lib/services/gmail-sync";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check for token refresh errors
  if (session.error === "RefreshTokenError") {
    return NextResponse.json(
      { error: "Session expired - please sign out and sign in again" },
      { status: 401 }
    );
  }

  if (!session.accessToken) {
    return NextResponse.json(
      { error: "No access token - please re-authenticate with Google" },
      { status: 401 }
    );
  }

  const userEmail = session.user?.email;
  if (!userEmail) {
    return NextResponse.json(
      { error: "No user email in session" },
      { status: 400 }
    );
  }

  try {
    const result = await syncGmailThreads(session.accessToken, userEmail);

    if (!result.success) {
      return NextResponse.json(
        { error: "Gmail sync failed", details: result.errors },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: "Gmail sync completed",
      threadsFetched: result.threadsFetched,
      threadsProcessed: result.threadsProcessed,
      threadsSkipped: result.threadsSkipped,
      dueItemsCreated: result.dueItemsCreated,
      dueItemsUpdated: result.dueItemsUpdated,
    });
  } catch (error) {
    console.error("Gmail sync API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

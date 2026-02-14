import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getWaitingOnOthers } from "@/lib/services/sheet-sync";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const userEmail = session.user?.email || "";
    const items = await getWaitingOnOthers(userEmail);

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Waiting on API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

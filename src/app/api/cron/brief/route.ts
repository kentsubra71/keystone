import { NextRequest, NextResponse } from "next/server";
import { generateDailyBrief } from "@/lib/services/daily-brief";
import { refreshStoredToken } from "@/lib/cron-auth";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Brief uses accessToken for Calendar API
    const { accessToken } = await refreshStoredToken();
    const brief = await generateDailyBrief(accessToken);

    return NextResponse.json({
      message: "Cron: Daily brief generated",
      brief,
    });
  } catch (error) {
    console.error("Cron brief generation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

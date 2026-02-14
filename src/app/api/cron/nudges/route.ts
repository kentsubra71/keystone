import { NextRequest, NextResponse } from "next/server";
import { generateNudges } from "@/lib/services/nudges";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const nudges = await generateNudges();

    return NextResponse.json({
      message: `Cron: Generated ${nudges.length} nudge(s)`,
      nudges,
    });
  } catch (error) {
    console.error("Cron nudges generation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

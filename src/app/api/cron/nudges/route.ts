import { NextRequest, NextResponse } from "next/server";
import { generateNudges } from "@/lib/services/nudges";
import { verifyCronSecret } from "@/lib/cron-auth";

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
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

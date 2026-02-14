import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generateNudges, getActiveNudges } from "@/lib/services/nudges";

// GET - Get active nudges
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const nudges = await getActiveNudges();
    return NextResponse.json({ nudges });
  } catch (error) {
    console.error("Nudges GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST - Generate new nudges
export async function POST() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const nudges = await generateNudges();
    return NextResponse.json({
      nudges,
      message: `Generated ${nudges.length} nudge(s)`,
    });
  } catch (error) {
    console.error("Nudges POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

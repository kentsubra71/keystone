import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generateDailyBrief, getLatestBrief } from "@/lib/services/daily-brief";

// GET - Fetch latest brief
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const brief = await getLatestBrief();
    return NextResponse.json({ brief });
  } catch (error) {
    console.error("Brief GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST - Generate new brief
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const brief = await generateDailyBrief(session.accessToken);
    return NextResponse.json({ brief });
  } catch (error) {
    console.error("Brief POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

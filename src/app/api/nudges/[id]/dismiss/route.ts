import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dismissNudge } from "@/lib/services/nudges";

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    await dismissNudge(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Dismiss nudge error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

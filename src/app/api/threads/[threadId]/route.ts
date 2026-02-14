import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getGmailClient, fetchThreadDetail } from "@/lib/google/gmail";

type RouteParams = {
  params: Promise<{ threadId: string }>;
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { threadId } = await params;
  const gmail = getGmailClient(session.accessToken as string);
  const thread = await fetchThreadDetail(gmail, threadId);

  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  return NextResponse.json({ thread });
}

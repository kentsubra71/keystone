import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { gmailThreads } from "@/lib/db/schema";
import { generateDraftBody } from "@/lib/services/draft-generator";
import { eq } from "drizzle-orm";
import { z } from "zod";

const PolishSchema = z.object({
  threadId: z.string().min(1),
  transcript: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = PolishSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }

    const { threadId, transcript } = parsed.data;

    const [thread] = await db
      .select()
      .from(gmailThreads)
      .where(eq(gmailThreads.threadId, threadId))
      .limit(1);

    if (!thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    const polished = await generateDraftBody({
      threadId,
      transcript,
      to: [thread.fromAddress],
      cc: (thread.ccAddresses as string[]) || [],
      subject: thread.subject,
      snippet: thread.snippet || "",
    });

    return NextResponse.json({ polished });
  } catch (error) {
    console.error("Polish error:", error);
    return NextResponse.json(
      { error: "Failed to polish text" },
      { status: 500 }
    );
  }
}

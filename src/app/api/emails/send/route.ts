import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { gmailThreads, draftTranscripts } from "@/lib/db/schema";
import { getGmailClient } from "@/lib/google/gmail";
import { sendGmailReply } from "@/lib/services/draft-generator";
import { eq } from "drizzle-orm";
import { z } from "zod";

const SendEmailSchema = z.object({
  threadId: z.string().min(1),
  transcript: z.string().min(1),
  polishedBody: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.accessToken) {
    return NextResponse.json(
      { error: "No access token - please re-authenticate" },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const parsed = SendEmailSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }

    const { threadId, transcript, polishedBody } = parsed.data;

    const [thread] = await db
      .select()
      .from(gmailThreads)
      .where(eq(gmailThreads.threadId, threadId))
      .limit(1);

    if (!thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    const gmail = getGmailClient(session.accessToken);
    const messageId = await sendGmailReply(
      gmail,
      {
        threadId,
        transcript,
        to: [thread.fromAddress],
        cc: (thread.ccAddresses as string[]) || [],
        subject: thread.subject,
        snippet: thread.snippet || "",
      },
      polishedBody,
    );

    // Store the transcript for history
    await db.insert(draftTranscripts).values({
      threadId,
      transcript,
      generatedDraftId: messageId,
    });

    return NextResponse.json({
      success: true,
      messageId,
      message: "Reply sent successfully",
    });
  } catch (error) {
    console.error("Send email error:", error);
    return NextResponse.json(
      { error: "Failed to send reply" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { gmailThreads, draftTranscripts } from "@/lib/db/schema";
import { getGmailClient } from "@/lib/google/gmail";
import { createGmailDraft } from "@/lib/services/draft-generator";
import { eq } from "drizzle-orm";
import { z } from "zod";

const CreateDraftSchema = z.object({
  threadId: z.string().min(1),
  transcript: z.string().min(1),
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
    const parsed = CreateDraftSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }

    const { threadId, transcript } = parsed.data;

    // Get thread info from our database
    const [thread] = await db
      .select()
      .from(gmailThreads)
      .where(eq(gmailThreads.threadId, threadId))
      .limit(1);

    if (!thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    // Create the draft via Gmail API
    const gmail = getGmailClient(session.accessToken);
    const draftId = await createGmailDraft(gmail, {
      threadId,
      transcript,
      to: [thread.fromAddress], // Reply to sender
      cc: (thread.ccAddresses as string[]) || [],
      subject: thread.subject,
      snippet: thread.snippet || "",
    });

    // Store the transcript (text only, per contract)
    await db.insert(draftTranscripts).values({
      threadId,
      transcript,
      generatedDraftId: draftId,
    });

    return NextResponse.json({
      success: true,
      draftId,
      message: "Draft created successfully",
    });
  } catch (error) {
    console.error("Create draft error:", error);
    return NextResponse.json(
      { error: "Failed to create draft" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { gmailThreads, dueFromMeItems } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const threads = await db
      .select()
      .from(gmailThreads)
      .orderBy(desc(gmailThreads.receivedAt))
      .limit(50);

    const items = await db
      .select()
      .from(dueFromMeItems)
      .limit(50);

    // Summarize classification results
    const classified = threads.filter((t) => t.dueFromMeType !== null);
    const unclassified = threads.filter((t) => t.dueFromMeType === null);

    return NextResponse.json({
      summary: {
        totalThreads: threads.length,
        classified: classified.length,
        unclassified: unclassified.length,
        dueItems: items.length,
      },
      classifiedThreads: classified.map((t) => ({
        subject: t.subject,
        from: t.fromAddress,
        to: t.toAddresses,
        type: t.dueFromMeType,
        confidence: t.confidenceScore,
        rationale: t.rationale,
        snippet: t.snippet?.substring(0, 100),
      })),
      unclassifiedSamples: unclassified.slice(0, 10).map((t) => ({
        subject: t.subject,
        from: t.fromAddress,
        to: t.toAddresses,
        snippet: t.snippet?.substring(0, 100),
      })),
      dueItems: items.map((i) => ({
        id: i.id,
        title: i.title,
        type: i.type,
        status: i.status,
        confidence: i.confidenceScore,
      })),
    });
  } catch (error) {
    console.error("Debug gmail threads error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

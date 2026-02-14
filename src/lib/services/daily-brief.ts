import { db } from "@/lib/db";
import { dueFromMeItems, sheetItems, dailyBriefs } from "@/lib/db/schema";
import { getCalendarClient, getTodaysMeetings } from "@/lib/google/calendar";
import { eq, ne, desc, asc, and, sql } from "drizzle-orm";

export type DailyBriefContent = {
  topDueItems: {
    id: string;
    title: string;
    type: string;
    agingDays: number;
    rationale: string;
  }[];
  overdueItems: {
    id: string;
    title: string;
    type: string;
    agingDays: number;
  }[];
  meetingsNeedingPrep: {
    id: string;
    summary: string;
    startTime: string;
    relatedItems: string[];
  }[];
  slippingCommitments: {
    id: string;
    commitment: string;
    ownerEmail: string | null;
    dueDate: string | null;
  }[];
  generatedAt: string;
};

// Dynamic aging computation — consistent with /api/due-from-me route
const dynamicAgingDays = sql<number>`EXTRACT(DAY FROM NOW() - ${dueFromMeItems.firstSeenAt})::int`;

export async function generateDailyBrief(
  accessToken?: string
): Promise<DailyBriefContent> {
  const now = new Date();

  // Get top 5 Due-From-Me items (not done, highest aging — computed dynamically)
  const topItems = await db
    .select({
      id: dueFromMeItems.id,
      title: dueFromMeItems.title,
      type: dueFromMeItems.type,
      rationale: dueFromMeItems.rationale,
      ownerEmail: dueFromMeItems.ownerEmail,
      agingDays: dynamicAgingDays,
    })
    .from(dueFromMeItems)
    .where(and(ne(dueFromMeItems.status, "done"), ne(dueFromMeItems.status, "deferred")))
    .orderBy(asc(dueFromMeItems.firstSeenAt))
    .limit(5);

  // Get overdue items (aging > 3 days for approvals/replies — computed dynamically)
  const overdueItems = await db
    .select({
      id: dueFromMeItems.id,
      title: dueFromMeItems.title,
      type: dueFromMeItems.type,
      agingDays: dynamicAgingDays,
    })
    .from(dueFromMeItems)
    .where(
      and(
        ne(dueFromMeItems.status, "done"),
        ne(dueFromMeItems.status, "deferred"),
        sql`EXTRACT(DAY FROM NOW() - ${dueFromMeItems.firstSeenAt}) > 3`,
        sql`${dueFromMeItems.type} IN ('reply', 'approval')`
      )
    )
    .orderBy(asc(dueFromMeItems.firstSeenAt));

  // Get slipping commitments from sheet (overdue or at risk)
  const slipping = await db
    .select()
    .from(sheetItems)
    .where(
      and(
        ne(sheetItems.status, "done"),
        sql`(${sheetItems.isOverdue} = true OR ${sheetItems.isAtRisk} = true)`
      )
    )
    .limit(10);

  // Get today's meetings if we have access token
  let meetingsNeedingPrep: DailyBriefContent["meetingsNeedingPrep"] = [];

  if (accessToken) {
    try {
      const calendar = getCalendarClient(accessToken);
      const meetings = await getTodaysMeetings(calendar);

      // Find meetings that have related Due-From-Me items
      for (const meeting of meetings) {
        const attendeeEmails = meeting.attendees;

        // Check if any due items are from meeting attendees
        const relatedItems = topItems.filter(
          (item) =>
            item.ownerEmail && attendeeEmails.includes(item.ownerEmail)
        );

        if (relatedItems.length > 0 || attendeeEmails.length > 2) {
          meetingsNeedingPrep.push({
            id: meeting.id,
            summary: meeting.summary,
            startTime: meeting.start.toISOString(),
            relatedItems: relatedItems.map((item) => item.title),
          });
        }
      }
    } catch (error) {
      console.error("Failed to fetch calendar:", error);
    }
  }

  const briefContent: DailyBriefContent = {
    topDueItems: topItems.map((item) => ({
      id: item.id,
      title: item.title,
      type: item.type,
      agingDays: item.agingDays,
      rationale: item.rationale,
    })),
    overdueItems: overdueItems.map((item) => ({
      id: item.id,
      title: item.title,
      type: item.type,
      agingDays: item.agingDays,
    })),
    meetingsNeedingPrep,
    slippingCommitments: slipping.map((item) => ({
      id: item.id,
      commitment: item.commitment,
      ownerEmail: item.ownerEmail,
      dueDate: item.dueDate?.toISOString() || null,
    })),
    generatedAt: now.toISOString(),
  };

  // Store the brief
  await db.insert(dailyBriefs).values({
    generatedAt: now,
    content: briefContent,
  });

  return briefContent;
}

export async function getLatestBrief(): Promise<DailyBriefContent | null> {
  const [latest] = await db
    .select()
    .from(dailyBriefs)
    .orderBy(desc(dailyBriefs.generatedAt))
    .limit(1);

  if (!latest) {
    return null;
  }

  return latest.content as DailyBriefContent;
}

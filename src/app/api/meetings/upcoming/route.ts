import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { dueFromMeItems, sheetItems, gmailThreads, ownerDirectory } from "@/lib/db/schema";
import { getCalendarClient, getUpcomingMeetings } from "@/lib/google/calendar";
import { eq, ne, desc, inArray } from "drizzle-orm";

export type EnrichedAttendee = {
  email: string;
  displayName: string | null;
  dueFromMe: { id: string; title: string; type: string; agingDays: number }[];
  theyOweMe: { id: string; commitment: string; dueDate: string | null; isOverdue: boolean }[];
  recentThreads: { threadId: string; subject: string; receivedAt: string }[];
};

export type EnrichedMeeting = {
  id: string;
  summary: string;
  start: string;
  end: string;
  description: string | null;
  attendees: EnrichedAttendee[];
};

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.accessToken) {
    return NextResponse.json({ meetings: [] });
  }

  try {
    const calendar = getCalendarClient(session.accessToken);
    const rawMeetings = await getUpcomingMeetings(calendar, 36);
    console.log(`[meetings/upcoming] Found ${rawMeetings.length} meetings in next 36h`);

    if (rawMeetings.length === 0) {
      return NextResponse.json({ meetings: [] });
    }

    const userEmail = session.user?.email?.toLowerCase() || "";

    // Collect all unique attendee emails (excluding the user and empty strings)
    const allAttendeeEmails = new Set<string>();
    for (const meeting of rawMeetings) {
      for (const email of meeting.attendees) {
        if (!email) continue;
        if (email.toLowerCase() !== userEmail) {
          allAttendeeEmails.add(email.toLowerCase());
        }
      }
    }

    const attendeeList = Array.from(allAttendeeEmails);
    if (attendeeList.length === 0) {
      // Meetings with no attendees besides user — return basic meeting info
      return NextResponse.json({
        meetings: rawMeetings.map((m) => ({
          id: m.id,
          summary: m.summary,
          start: m.start.toISOString(),
          end: m.end.toISOString(),
          description: m.description,
          attendees: [],
        })),
      });
    }

    // Batch query all data for all attendees at once
    const [dueItems, waitingItems, threads, owners] = await Promise.all([
      db
        .select({
          id: dueFromMeItems.id,
          title: dueFromMeItems.title,
          type: dueFromMeItems.type,
          ownerEmail: dueFromMeItems.ownerEmail,
          agingDays: dueFromMeItems.agingDays,
        })
        .from(dueFromMeItems)
        .where(ne(dueFromMeItems.status, "done")),
      db
        .select({
          id: sheetItems.id,
          commitment: sheetItems.commitment,
          ownerEmail: sheetItems.ownerEmail,
          dueDate: sheetItems.dueDate,
          isOverdue: sheetItems.isOverdue,
        })
        .from(sheetItems)
        .where(ne(sheetItems.status, "done")),
      db
        .select({
          threadId: gmailThreads.threadId,
          subject: gmailThreads.subject,
          fromAddress: gmailThreads.fromAddress,
          receivedAt: gmailThreads.receivedAt,
        })
        .from(gmailThreads)
        .where(inArray(gmailThreads.fromAddress, attendeeList))
        .orderBy(desc(gmailThreads.receivedAt))
        .limit(attendeeList.length * 5),
      db
        .select({ email: ownerDirectory.email, displayName: ownerDirectory.displayName })
        .from(ownerDirectory),
    ]);

    // Index data by email for fast lookup
    const ownerMap = new Map(owners.map((o) => [o.email.toLowerCase(), o.displayName]));

    const dueByEmail = new Map<string, typeof dueItems>();
    for (const item of dueItems) {
      if (!item.ownerEmail) continue;
      const key = item.ownerEmail.toLowerCase();
      if (!dueByEmail.has(key)) dueByEmail.set(key, []);
      dueByEmail.get(key)!.push(item);
    }

    const waitingByEmail = new Map<string, typeof waitingItems>();
    for (const item of waitingItems) {
      if (!item.ownerEmail) continue;
      const key = item.ownerEmail.toLowerCase();
      if (!waitingByEmail.has(key)) waitingByEmail.set(key, []);
      waitingByEmail.get(key)!.push(item);
    }

    const threadsByEmail = new Map<string, typeof threads>();
    for (const thread of threads) {
      const key = thread.fromAddress.toLowerCase();
      if (!threadsByEmail.has(key)) threadsByEmail.set(key, []);
      const list = threadsByEmail.get(key)!;
      if (list.length < 5) list.push(thread);
    }

    // Build enriched meetings
    const enriched: EnrichedMeeting[] = rawMeetings.map((meeting) => {
      const meetingAttendees: EnrichedAttendee[] = meeting.attendees
        .filter((email) => email.toLowerCase() !== userEmail)
        .map((email) => {
          const key = email.toLowerCase();
          return {
            email,
            displayName: ownerMap.get(key) || null,
            dueFromMe: (dueByEmail.get(key) || []).map((d) => ({
              id: d.id,
              title: d.title,
              type: d.type,
              agingDays: d.agingDays,
            })),
            theyOweMe: (waitingByEmail.get(key) || []).map((w) => ({
              id: w.id,
              commitment: w.commitment,
              dueDate: w.dueDate?.toISOString() || null,
              isOverdue: w.isOverdue,
            })),
            recentThreads: (threadsByEmail.get(key) || []).map((t) => ({
              threadId: t.threadId,
              subject: t.subject,
              receivedAt: t.receivedAt.toISOString(),
            })),
          };
        });

      return {
        id: meeting.id,
        summary: meeting.summary,
        start: meeting.start.toISOString(),
        end: meeting.end.toISOString(),
        description: meeting.description,
        attendees: meetingAttendees,
      };
    });

    console.log(`[meetings/upcoming] Returning ${enriched.length} enriched meetings`);
    return NextResponse.json({ meetings: enriched });
  } catch (error) {
    console.error("[meetings/upcoming] Failed to fetch upcoming meetings:", error);
    return NextResponse.json(
      { error: "Failed to fetch meetings" },
      { status: 500 }
    );
  }
}

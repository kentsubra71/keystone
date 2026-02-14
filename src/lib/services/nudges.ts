import { db } from "@/lib/db";
import { nudges, dueFromMeItems, appSettings } from "@/lib/db/schema";
import { eq, and, sql, desc, gte, ne } from "drizzle-orm";

const MAX_NUDGES_PER_DAY = 3;

export type NudgeType = "blocking_others" | "overdue" | "critical_due_soon";

export type NudgeResult = {
  id: string;
  type: NudgeType;
  itemId: string;
  itemTitle: string;
  reason: string;
};

export async function generateNudges(): Promise<NudgeResult[]> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Check how many nudges we've already sent today
  const todaysNudges = await db
    .select()
    .from(nudges)
    .where(
      and(
        sql`${nudges.sentAt} IS NOT NULL`,
        gte(nudges.sentAt, startOfDay)
      )
    );

  if (todaysNudges.length >= MAX_NUDGES_PER_DAY) {
    return [];
  }

  const remainingSlots = MAX_NUDGES_PER_DAY - todaysNudges.length;
  const newNudges: NudgeResult[] = [];

  // Priority 1: Items where user is blocking others
  const blockingItems = await db
    .select()
    .from(dueFromMeItems)
    .where(
      and(
        sql`${dueFromMeItems.blockingWho} IS NOT NULL`,
        ne(dueFromMeItems.status, "done"),
        sql`${dueFromMeItems.agingDays} >= 1`
      )
    )
    .orderBy(desc(dueFromMeItems.agingDays))
    .limit(remainingSlots);

  for (const item of blockingItems) {
    if (newNudges.length >= remainingSlots) break;

    // Check if we already nudged for this item today
    const existingNudge = todaysNudges.find((n) => n.itemId === item.id);
    if (existingNudge) continue;

    const [nudge] = await db
      .insert(nudges)
      .values({
        type: "blocking_others",
        itemId: item.id,
        reason: `You are blocking ${item.blockingWho} - this ${item.type.replace("_", " ")} has been waiting ${item.agingDays} days`,
        sentAt: now,
      })
      .returning();

    newNudges.push({
      id: nudge.id,
      type: "blocking_others",
      itemId: item.id,
      itemTitle: item.title,
      reason: nudge.reason,
    });
  }

  // Priority 2: Overdue approvals/replies
  if (newNudges.length < remainingSlots) {
    const overdueItems = await db
      .select()
      .from(dueFromMeItems)
      .where(
        and(
          ne(dueFromMeItems.status, "done"),
          sql`${dueFromMeItems.agingDays} >= 3`,
          sql`${dueFromMeItems.type} IN ('reply', 'approval')`
        )
      )
      .orderBy(desc(dueFromMeItems.agingDays))
      .limit(remainingSlots - newNudges.length);

    for (const item of overdueItems) {
      if (newNudges.length >= remainingSlots) break;

      const existingNudge = todaysNudges.find((n) => n.itemId === item.id);
      if (existingNudge) continue;

      // Check if we already added a nudge for this item
      if (newNudges.find((n) => n.itemId === item.id)) continue;

      const [nudge] = await db
        .insert(nudges)
        .values({
          type: "overdue",
          itemId: item.id,
          reason: `This ${item.type.replace("_", " ")} is overdue by ${item.agingDays} days`,
          sentAt: now,
        })
        .returning();

      newNudges.push({
        id: nudge.id,
        type: "overdue",
        itemId: item.id,
        itemTitle: item.title,
        reason: nudge.reason,
      });
    }
  }

  return newNudges;
}

export async function dismissNudge(nudgeId: string): Promise<void> {
  await db
    .update(nudges)
    .set({ dismissedAt: new Date() })
    .where(eq(nudges.id, nudgeId));
}

export async function getActiveNudges(): Promise<NudgeResult[]> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const activeNudges = await db
    .select({
      nudge: nudges,
      item: dueFromMeItems,
    })
    .from(nudges)
    .innerJoin(dueFromMeItems, eq(nudges.itemId, dueFromMeItems.id))
    .where(
      and(
        sql`${nudges.dismissedAt} IS NULL`,
        gte(nudges.createdAt, startOfDay)
      )
    );

  return activeNudges.map(({ nudge, item }) => ({
    id: nudge.id,
    type: nudge.type as NudgeType,
    itemId: item.id,
    itemTitle: item.title,
    reason: nudge.reason,
  }));
}

import { db } from "@/lib/db";
import { userActions, dueFromMeItems } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

export type UserActionType =
  | "done"
  | "snooze"
  | "delegate"
  | "ignore"
  | "priority_override";

export async function recordUserAction(
  itemId: string,
  itemSource: "gmail" | "sheet" | "calendar",
  action: UserActionType,
  previousValue?: string,
  newValue?: string
): Promise<void> {
  await db.insert(userActions).values({
    itemId,
    itemSource,
    action,
    previousValue: previousValue || null,
    newValue: newValue || null,
  });
}

export async function markItemDone(itemId: string): Promise<void> {
  const [item] = await db
    .select()
    .from(dueFromMeItems)
    .where(eq(dueFromMeItems.id, itemId))
    .limit(1);

  if (!item) return;

  // Record the action
  await recordUserAction(itemId, item.source, "done", item.status, "done");

  // Update the item
  await db
    .update(dueFromMeItems)
    .set({
      status: "done",
      statusChangedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(dueFromMeItems.id, itemId));
}

export async function snoozeItem(itemId: string, days: number): Promise<void> {
  const [item] = await db
    .select()
    .from(dueFromMeItems)
    .where(eq(dueFromMeItems.id, itemId))
    .limit(1);

  if (!item) return;

  // Record the action
  await recordUserAction(
    itemId,
    item.source,
    "snooze",
    undefined,
    `${days} days`
  );

  // Update the item status to deferred with snooze expiry
  const snoozedUntil = new Date();
  snoozedUntil.setDate(snoozedUntil.getDate() + days);

  await db
    .update(dueFromMeItems)
    .set({
      status: "deferred",
      snoozedUntil,
      statusChangedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(dueFromMeItems.id, itemId));
}

export async function ignoreItem(itemId: string): Promise<void> {
  const [item] = await db
    .select()
    .from(dueFromMeItems)
    .where(eq(dueFromMeItems.id, itemId))
    .limit(1);

  if (!item) return;

  // Record the action
  await recordUserAction(itemId, item.source, "ignore");

  // Update the item - we mark as done but with ignore action for learning
  await db
    .update(dueFromMeItems)
    .set({
      status: "done",
      statusChangedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(dueFromMeItems.id, itemId));
}

export async function getActionHistory(itemId: string) {
  return db
    .select()
    .from(userActions)
    .where(eq(userActions.itemId, itemId))
    .orderBy(desc(userActions.createdAt));
}

// Learning analytics
export async function getUserActionPatterns() {
  const actions = await db.select().from(userActions);

  const patterns = {
    totalActions: actions.length,
    byAction: {} as Record<string, number>,
    bySource: {} as Record<string, number>,
  };

  for (const action of actions) {
    patterns.byAction[action.action] =
      (patterns.byAction[action.action] || 0) + 1;
    patterns.bySource[action.itemSource] =
      (patterns.bySource[action.itemSource] || 0) + 1;
  }

  return patterns;
}

import { db } from "@/lib/db";
import { userActions, dueFromMeItems } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { ItemNotFoundError } from "@/lib/errors";

export type UserActionType =
  | "done"
  | "snooze"
  | "delegate"
  | "ignore"
  | "priority_override"
  | "resurfaced";

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

async function loadItemOrThrow(itemId: string) {
  const [item] = await db
    .select()
    .from(dueFromMeItems)
    .where(eq(dueFromMeItems.id, itemId))
    .limit(1);
  if (!item) throw new ItemNotFoundError(itemId);
  return item;
}

export async function markItemDone(itemId: string): Promise<void> {
  const item = await loadItemOrThrow(itemId);
  await recordUserAction(itemId, item.source, "done", item.status, "done");
  await db
    .update(dueFromMeItems)
    .set({ status: "done", statusChangedAt: new Date(), updatedAt: new Date() })
    .where(eq(dueFromMeItems.id, itemId));
}

export async function snoozeItem(itemId: string, snoozedUntil: Date): Promise<void> {
  const item = await loadItemOrThrow(itemId);
  await recordUserAction(
    itemId,
    item.source,
    "snooze",
    undefined,
    snoozedUntil.toISOString()
  );
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
  const item = await loadItemOrThrow(itemId);
  await recordUserAction(itemId, item.source, "ignore");
  await db
    .update(dueFromMeItems)
    .set({ status: "done", statusChangedAt: new Date(), updatedAt: new Date() })
    .where(eq(dueFromMeItems.id, itemId));
}

export async function getActionHistory(itemId: string) {
  return db
    .select()
    .from(userActions)
    .where(eq(userActions.itemId, itemId))
    .orderBy(desc(userActions.createdAt));
}

export async function getUserActionPatterns() {
  const actions = await db.select().from(userActions);
  const patterns = {
    totalActions: actions.length,
    byAction: {} as Record<string, number>,
    bySource: {} as Record<string, number>,
  };
  for (const action of actions) {
    patterns.byAction[action.action] = (patterns.byAction[action.action] || 0) + 1;
    patterns.bySource[action.itemSource] = (patterns.bySource[action.itemSource] || 0) + 1;
  }
  return patterns;
}

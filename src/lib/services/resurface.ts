import { db } from "@/lib/db";
import { dueFromMeItems, userActions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { ItemNotFoundError } from "@/lib/errors";
import type { DueFromMeType } from "@/types";

export type ResurfaceClassification = {
  type: DueFromMeType;
  confidence: number;
  rationale: string;
  suggestedAction: string | null;
  blockingWho: string | null;
};

export async function resurfaceItem(
  itemId: string,
  newClassification: ResurfaceClassification,
  newFirstSeenAt: Date
): Promise<void> {
  const [item] = await db
    .select({ source: dueFromMeItems.source, status: dueFromMeItems.status })
    .from(dueFromMeItems)
    .where(eq(dueFromMeItems.id, itemId))
    .limit(1);
  if (!item) throw new ItemNotFoundError(itemId);

  const now = new Date();
  await db
    .update(dueFromMeItems)
    .set({
      status: "not_started",
      type: newClassification.type,
      confidenceScore: newClassification.confidence,
      rationale: newClassification.rationale,
      suggestedAction: newClassification.suggestedAction,
      blockingWho: newClassification.blockingWho,
      firstSeenAt: newFirstSeenAt,
      statusChangedAt: now,
      snoozedUntil: null,
      updatedAt: now,
    })
    .where(eq(dueFromMeItems.id, itemId));

  await db.insert(userActions).values({
    itemId,
    itemSource: item.source,
    action: "resurfaced",
    previousValue: item.status,
    newValue: "not_started",
  });
}

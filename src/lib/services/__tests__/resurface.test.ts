import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testDb, truncateAll } from "@/test/db-helpers";
import { dueFromMeItems, userActions } from "@/lib/db/schema";
import { resurfaceItem } from "@/lib/services/resurface";
import { eq } from "drizzle-orm";

const { db, pool } = testDb();
afterAll(async () => { await pool.end(); });

describe("resurfaceItem", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("flips done item back to not_started, resets firstSeenAt, logs audit", async () => {
    const originalFirstSeen = new Date("2026-04-01T09:00:00Z");
    const [inserted] = await db.insert(dueFromMeItems).values({
      type: "approval",
      status: "done",
      title: "Old item",
      source: "gmail",
      sourceId: "thread-1",
      rationale: "old rationale",
      firstSeenAt: originalFirstSeen,
      statusChangedAt: new Date("2026-04-10T10:00:00Z"),
    }).returning();

    const newFirstSeen = new Date("2026-04-15T15:00:00Z");
    await resurfaceItem(inserted.id, {
      type: "reply",
      confidence: 88,
      rationale: "new rationale",
      suggestedAction: "Reply asap",
      blockingWho: "ceo@x.com",
    }, newFirstSeen);

    const [updated] = await db.select().from(dueFromMeItems)
      .where(eq(dueFromMeItems.id, inserted.id)).limit(1);
    expect(updated.status).toBe("not_started");
    expect(updated.snoozedUntil).toBeNull();
    expect(updated.firstSeenAt.toISOString()).toBe(newFirstSeen.toISOString());
    expect(updated.type).toBe("reply");
    expect(updated.rationale).toBe("new rationale");
    expect(updated.suggestedAction).toBe("Reply asap");
    expect(updated.blockingWho).toBe("ceo@x.com");
    expect(updated.confidenceScore).toBe(88);

    const audits = await db.select().from(userActions)
      .where(eq(userActions.itemId, inserted.id));
    expect(audits.length).toBe(1);
    expect(audits[0].action).toBe("resurfaced");
  });

  it("clears snoozedUntil when resurfacing from deferred", async () => {
    const [inserted] = await db.insert(dueFromMeItems).values({
      type: "approval",
      status: "deferred",
      title: "Snoozed",
      source: "gmail",
      sourceId: "thread-2",
      rationale: "old",
      snoozedUntil: new Date("2026-04-30T09:00:00Z"),
    }).returning();

    await resurfaceItem(inserted.id, {
      type: "decision",
      confidence: 70,
      rationale: "decision needed",
      suggestedAction: null,
      blockingWho: null,
    }, new Date());

    const [updated] = await db.select().from(dueFromMeItems)
      .where(eq(dueFromMeItems.id, inserted.id)).limit(1);
    expect(updated.status).toBe("not_started");
    expect(updated.snoozedUntil).toBeNull();
  });
});

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testDb, truncateAll } from "@/test/db-helpers";
import { dueFromMeItems } from "@/lib/db/schema";
import { generateNudges } from "@/lib/services/nudges";

const { db, pool } = testDb();
afterAll(async () => { await pool.end(); });

describe("nudges deferred filter", () => {
  beforeEach(async () => { await truncateAll(); });

  it("does not nudge for deferred (snoozed) items even when blocking or overdue", async () => {
    await db.insert(dueFromMeItems).values({
      type: "approval",
      status: "deferred",
      title: "Snoozed approval blocking Alice",
      source: "gmail",
      sourceId: "t-deferred",
      rationale: "blocks alice",
      blockingWho: "alice@x.com",
      agingDays: 5,
      snoozedUntil: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    });

    const nudges = await generateNudges();
    expect(nudges.find(n => n.itemTitle.includes("Snoozed approval"))).toBeUndefined();
  });

  it("still nudges for active blocking items", async () => {
    await db.insert(dueFromMeItems).values({
      type: "approval",
      status: "not_started",
      title: "Active approval",
      source: "gmail",
      sourceId: "t-active",
      rationale: "blocks bob",
      blockingWho: "bob@x.com",
      agingDays: 5,
    });

    const nudges = await generateNudges();
    expect(nudges.find(n => n.itemTitle === "Active approval")).toBeDefined();
  });
});

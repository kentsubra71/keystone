import { describe, it, expect, beforeEach, vi, afterAll } from "vitest";
import { testDb, truncateAll } from "@/test/db-helpers";
import { dueFromMeItems, gmailThreads, userActions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { ParsedThread } from "@/lib/google/gmail";

// Mock Gmail fetching + classifier
vi.mock("@/lib/google/gmail", async () => {
  const actual = await vi.importActual<typeof import("@/lib/google/gmail")>("@/lib/google/gmail");
  return {
    ...actual,
    getGmailClient: vi.fn(() => ({})),
    fetchRecentThreads: vi.fn(),
  };
});

vi.mock("@/lib/services/gmail-classifier", () => ({
  classifyThreads: vi.fn(),
  getSuggestedAction: vi.fn(() => "Handle it"),
}));

import { syncGmailThreads } from "@/lib/services/gmail-sync";
import { fetchRecentThreads } from "@/lib/google/gmail";
import { classifyThreads } from "@/lib/services/gmail-classifier";

const { db, pool } = testDb();

afterAll(async () => { await pool.end(); });

function makeThread(overrides: Partial<ParsedThread>): ParsedThread {
  return {
    threadId: "t1",
    subject: "Test",
    snippet: "snippet",
    messages: [],
    labels: [],
    isMailingList: false,
    ...overrides,
  };
}

describe("gmail sync thread revival", () => {
  beforeEach(async () => {
    await truncateAll();
    vi.clearAllMocks();
  });

  it("skips done item when no new inbound message", async () => {
    await db.insert(dueFromMeItems).values({
      type: "approval",
      status: "done",
      title: "Old",
      source: "gmail",
      sourceId: "t1",
      rationale: "old",
      statusChangedAt: new Date("2026-04-10T10:00:00Z"),
    });

    const thread = makeThread({
      threadId: "t1",
      messages: [{
        messageId: "m1",
        from: "alice@x.com",
        to: ["user@x.com"],
        cc: [],
        body: "ok",
        receivedAt: new Date("2026-04-05T10:00:00Z"), // before statusChangedAt
      }],
    });
    vi.mocked(fetchRecentThreads).mockResolvedValue([thread]);
    vi.mocked(classifyThreads).mockResolvedValue(new Map());

    const result = await syncGmailThreads("tok", "user@x.com");

    // Classifier should NOT have been called — thread is pre-action and has no new messages
    expect(classifyThreads).not.toHaveBeenCalled();
    expect(result.success).toBe(true);

    const [item] = await db.select().from(dueFromMeItems).where(eq(dueFromMeItems.sourceId, "t1"));
    expect(item.status).toBe("done");
  });

  it("resurfaces done item when new non-ack inbound arrives", async () => {
    const [inserted] = await db.insert(dueFromMeItems).values({
      type: "approval",
      status: "done",
      title: "Old",
      source: "gmail",
      sourceId: "t1",
      rationale: "old",
      firstSeenAt: new Date("2026-04-01T00:00:00Z"),
      statusChangedAt: new Date("2026-04-10T10:00:00Z"),
    }).returning();

    const newMsgDate = new Date("2026-04-15T08:30:00Z");
    const thread = makeThread({
      threadId: "t1",
      messages: [
        { messageId: "m2", from: "alice@x.com", to: ["user@x.com"], cc: [], body: "please approve the new version",
          receivedAt: newMsgDate },
      ],
    });

    vi.mocked(fetchRecentThreads).mockResolvedValue([thread]);
    vi.mocked(classifyThreads).mockResolvedValue(new Map([["t1", {
      type: "approval",
      confidence: 88,
      rationale: "new approval needed",
      suggestedAction: "Approve the new version",
      blockingWho: "alice@x.com",
    }]]));

    await syncGmailThreads("tok", "user@x.com");

    const [item] = await db.select().from(dueFromMeItems).where(eq(dueFromMeItems.id, inserted.id));
    expect(item.status).toBe("not_started");
    expect(item.firstSeenAt.toISOString()).toBe(newMsgDate.toISOString());
    expect(item.rationale).toBe("new approval needed");

    const audits = await db.select().from(userActions).where(eq(userActions.itemId, inserted.id));
    expect(audits.some(a => a.action === "resurfaced")).toBe(true);
  });

  it("leaves done item alone when classifier returns null for new message", async () => {
    const [inserted] = await db.insert(dueFromMeItems).values({
      type: "approval",
      status: "done",
      title: "Old",
      source: "gmail",
      sourceId: "t1",
      rationale: "old",
      statusChangedAt: new Date("2026-04-10T10:00:00Z"),
    }).returning();

    const thread = makeThread({
      threadId: "t1",
      messages: [
        { messageId: "m2", from: "alice@x.com", to: ["user@x.com"], cc: [], body: "thanks!",
          receivedAt: new Date("2026-04-15T10:00:00Z") },
      ],
    });

    vi.mocked(fetchRecentThreads).mockResolvedValue([thread]);
    vi.mocked(classifyThreads).mockResolvedValue(new Map([["t1", {
      type: null, confidence: 0, rationale: "just ack", suggestedAction: null, blockingWho: null,
    }]]));

    await syncGmailThreads("tok", "user@x.com");

    const [item] = await db.select().from(dueFromMeItems).where(eq(dueFromMeItems.id, inserted.id));
    expect(item.status).toBe("done");
    const audits = await db.select().from(userActions).where(eq(userActions.itemId, inserted.id));
    expect(audits.some(a => a.action === "resurfaced")).toBe(false);
  });

  it("unique constraint prevents duplicate sourceId inserts", async () => {
    await db.insert(dueFromMeItems).values({
      type: "approval", status: "not_started", title: "A", source: "gmail", sourceId: "dup", rationale: "r",
    });
    await expect(
      db.insert(dueFromMeItems).values({
        type: "reply", status: "not_started", title: "B", source: "gmail", sourceId: "dup", rationale: "r",
      })
    ).rejects.toThrow();
  });
});

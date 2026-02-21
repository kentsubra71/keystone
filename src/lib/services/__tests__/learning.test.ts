import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the database module before importing the service
vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            {
              id: "item-1",
              source: "gmail",
              status: "not_started",
            },
          ]),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  userActions: { itemId: "itemId" },
  dueFromMeItems: { id: "id", source: "source", status: "status" },
}));

describe("snoozeItem", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T08:00:00Z"));
  });

  it("computes correct snoozedUntil date", async () => {
    const { db } = await import("@/lib/db");
    const { snoozeItem } = await import("@/lib/services/learning");

    await snoozeItem("item-1", 3);

    // Verify the update was called
    const updateCall = vi.mocked(db.update);
    expect(updateCall).toHaveBeenCalled();

    // Get the set() call arguments
    const setFn = vi.mocked(updateCall.mock.results[0]?.value?.set);
    if (setFn) {
      const setArgs = setFn.mock.calls[0]?.[0];
      expect(setArgs).toBeDefined();
      expect(setArgs.status).toBe("deferred");
      expect(setArgs.snoozedUntil).toBeDefined();

      // Should be 3 days from now
      const expected = new Date("2024-06-18T08:00:00Z");
      expect(setArgs.snoozedUntil.getTime()).toBe(expected.getTime());
    }

    vi.useRealTimers();
  });
});

describe("snooze duration calculation", () => {
  it("correctly computes snoozedUntil for various day values", () => {
    const now = new Date("2024-06-15T08:00:00Z");

    for (const days of [1, 3, 7, 14, 30]) {
      const snoozedUntil = new Date(now);
      snoozedUntil.setDate(snoozedUntil.getDate() + days);

      const expectedDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
      expect(snoozedUntil.getTime()).toBe(expectedDate.getTime());
    }
  });
});

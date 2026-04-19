import { describe, it, expect, beforeEach } from "vitest";
import { markItemDone, snoozeItem, ignoreItem } from "@/lib/services/learning";
import { ItemNotFoundError } from "@/lib/errors";
import { truncateAll } from "@/test/db-helpers";

describe("learning service error handling", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("markItemDone throws ItemNotFoundError for missing item", async () => {
    await expect(markItemDone("00000000-0000-0000-0000-000000000000"))
      .rejects
      .toBeInstanceOf(ItemNotFoundError);
  });

  it("snoozeItem throws ItemNotFoundError for missing item", async () => {
    await expect(snoozeItem("00000000-0000-0000-0000-000000000000", new Date()))
      .rejects
      .toBeInstanceOf(ItemNotFoundError);
  });

  it("ignoreItem throws ItemNotFoundError for missing item", async () => {
    await expect(ignoreItem("00000000-0000-0000-0000-000000000000"))
      .rejects
      .toBeInstanceOf(ItemNotFoundError);
  });
});

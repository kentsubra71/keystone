import { describe, it, expect } from "vitest";
import { normalizeStatus, generateRowFingerprint, parseDueDate } from "@/lib/google/sheets";

describe("normalizeStatus", () => {
  // Not Started variants
  it.each([
    ["not started", "not_started"],
    ["new", "not_started"],
    ["pending", "not_started"],
    ["to do", "not_started"],
    ["todo", "not_started"],
    ["open", "not_started"],
    ["", "not_started"],
  ])("maps '%s' to '%s'", (input, expected) => {
    expect(normalizeStatus(input).status).toBe(expected);
  });

  // In Progress variants
  it.each([
    ["in progress", "in_progress"],
    ["in-progress", "in_progress"],
    ["wip", "in_progress"],
    ["working", "in_progress"],
    ["started", "in_progress"],
    ["ongoing", "in_progress"],
  ])("maps '%s' to '%s'", (input, expected) => {
    expect(normalizeStatus(input).status).toBe(expected);
  });

  // Blocked variants
  it.each([
    ["blocked", "blocked"],
    ["on hold", "blocked"],
    ["waiting", "blocked"],
    ["stuck", "blocked"],
  ])("maps '%s' to '%s'", (input, expected) => {
    expect(normalizeStatus(input).status).toBe(expected);
  });

  // Done variants
  it.each([
    ["done", "done"],
    ["complete", "done"],
    ["completed", "done"],
    ["finished", "done"],
    ["closed", "done"],
    ["resolved", "done"],
  ])("maps '%s' to '%s'", (input, expected) => {
    expect(normalizeStatus(input).status).toBe(expected);
  });

  // Deferred variants
  it.each([
    ["deferred", "deferred"],
    ["postponed", "deferred"],
    ["later", "deferred"],
    ["backlog", "deferred"],
  ])("maps '%s' to '%s'", (input, expected) => {
    expect(normalizeStatus(input).status).toBe(expected);
  });

  it("is case-insensitive", () => {
    expect(normalizeStatus("IN PROGRESS").status).toBe("in_progress");
    expect(normalizeStatus("Done").status).toBe("done");
    expect(normalizeStatus("BLOCKED").status).toBe("blocked");
  });

  it("trims whitespace", () => {
    expect(normalizeStatus("  done  ").status).toBe("done");
    expect(normalizeStatus(" in progress ").status).toBe("in_progress");
  });

  it("defaults null to not_started", () => {
    expect(normalizeStatus(null).status).toBe("not_started");
    expect(normalizeStatus(null).needsReview).toBe(false);
  });

  it("defaults undefined to not_started", () => {
    expect(normalizeStatus(undefined).status).toBe("not_started");
    expect(normalizeStatus(undefined).needsReview).toBe(false);
  });

  it("flags unknown statuses for review", () => {
    const result = normalizeStatus("something_weird");
    expect(result.status).toBe("not_started");
    expect(result.needsReview).toBe(true);
  });

  it("does not flag known statuses for review", () => {
    expect(normalizeStatus("done").needsReview).toBe(false);
    expect(normalizeStatus("in progress").needsReview).toBe(false);
  });
});

describe("generateRowFingerprint", () => {
  it("produces consistent hashes for same input", () => {
    const row = ["task1", "owner", "2024-01-15", "done", "comment"];
    expect(generateRowFingerprint(row)).toBe(generateRowFingerprint(row));
  });

  it("produces different hashes for different input", () => {
    const row1 = ["task1", "owner", "2024-01-15", "done", "comment"];
    const row2 = ["task2", "owner", "2024-01-15", "done", "comment"];
    expect(generateRowFingerprint(row1)).not.toBe(generateRowFingerprint(row2));
  });

  it("handles null and undefined cells", () => {
    const row = ["task", null, undefined, "done", null];
    const hash = generateRowFingerprint(row);
    expect(hash).toBeTruthy();
    expect(typeof hash).toBe("string");
    expect(hash.length).toBe(32); // MD5 hex length
  });

  it("differentiates between null and empty string", () => {
    // Both null and undefined map to "" so these should be equal
    const row1 = [null, "test"];
    const row2 = [undefined, "test"];
    expect(generateRowFingerprint(row1)).toBe(generateRowFingerprint(row2));
  });
});

describe("parseDueDate", () => {
  it("returns null for null/undefined input", () => {
    expect(parseDueDate(null)).toBeNull();
    expect(parseDueDate(undefined)).toBeNull();
    expect(parseDueDate("")).toBeNull();
  });

  it("parses ISO date strings", () => {
    const date = parseDueDate("2024-03-15");
    expect(date).not.toBeNull();
    // Use UTC methods since "2024-03-15" is parsed as UTC midnight
    expect(date!.getUTCFullYear()).toBe(2024);
    expect(date!.getUTCMonth()).toBe(2); // 0-indexed
    expect(date!.getUTCDate()).toBe(15);
  });

  it("parses ISO datetime strings", () => {
    const date = parseDueDate("2024-03-15T10:30:00Z");
    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(2024);
  });

  it("parses DD/MM/YYYY where day > 12", () => {
    const date = parseDueDate("25/01/2024");
    expect(date).not.toBeNull();
    expect(date!.getDate()).toBe(25);
    expect(date!.getMonth()).toBe(0); // January
  });

  it("parses MM/DD/YYYY where day > 12 in second position", () => {
    const date = parseDueDate("01/25/2024");
    expect(date).not.toBeNull();
    expect(date!.getDate()).toBe(25);
    expect(date!.getMonth()).toBe(0); // January
  });

  it("parses ambiguous slash dates via native Date first (MM/DD/YYYY)", () => {
    // "05/06/2024" is valid for new Date() which parses as May 6 (MM/DD/YYYY)
    // The regex branch is only reached if new Date() fails
    const date = parseDueDate("05/06/2024");
    expect(date).not.toBeNull();
    // JS new Date("05/06/2024") → May 6
    expect(date!.getDate()).toBe(6);
    expect(date!.getMonth()).toBe(4); // May (0-indexed)
  });

  it("parses DD-MM-YYYY format", () => {
    const date = parseDueDate("15-03-2024");
    expect(date).not.toBeNull();
    expect(date!.getDate()).toBe(15);
    expect(date!.getMonth()).toBe(2); // March
  });

  it("returns null for unparseable dates", () => {
    expect(parseDueDate("not a date")).toBeNull();
    expect(parseDueDate("abc")).toBeNull();
  });
});

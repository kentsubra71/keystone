import { describe, it, expect } from "vitest";
import { computeSnoozeUntil, SNOOZE_PRESETS } from "@/lib/snooze";

describe("computeSnoozeUntil", () => {
  // 2026-04-19 is a Sunday
  const sunday = new Date("2026-04-19T14:30:00-05:00");
  // 2026-04-20 is a Monday
  const monday = new Date("2026-04-20T09:15:00-05:00");
  // 2026-04-24 is a Friday
  const friday = new Date("2026-04-24T16:45:00-05:00");

  it("tomorrow returns next calendar day at 9:00 local", () => {
    const result = computeSnoozeUntil("tomorrow", sunday);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(3); // April
    expect(result.getDate()).toBe(20);
    expect(result.getHours()).toBe(9);
    expect(result.getMinutes()).toBe(0);
  });

  it("3_days returns 72 hours from now, preserving time-of-day", () => {
    const result = computeSnoozeUntil("3_days", sunday);
    const diffMs = result.getTime() - sunday.getTime();
    expect(diffMs).toBe(3 * 24 * 60 * 60 * 1000);
  });

  it("next_week returns 7 days from now", () => {
    const result = computeSnoozeUntil("next_week", sunday);
    const diffMs = result.getTime() - sunday.getTime();
    expect(diffMs).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("next_monday when today is Sunday returns tomorrow at 9am", () => {
    const result = computeSnoozeUntil("next_monday", sunday);
    expect(result.getDate()).toBe(20);
    expect(result.getDay()).toBe(1); // Monday
    expect(result.getHours()).toBe(9);
  });

  it("next_monday when today is Monday returns NEXT Monday (7 days out)", () => {
    const result = computeSnoozeUntil("next_monday", monday);
    expect(result.getDate()).toBe(27);
    expect(result.getDay()).toBe(1);
    expect(result.getHours()).toBe(9);
  });

  it("next_monday when today is Friday returns following Monday", () => {
    const result = computeSnoozeUntil("next_monday", friday);
    expect(result.getDate()).toBe(27);
    expect(result.getDay()).toBe(1);
  });

  it("SNOOZE_PRESETS contains exactly the four presets", () => {
    expect(SNOOZE_PRESETS).toEqual(["tomorrow", "3_days", "next_week", "next_monday"]);
  });
});

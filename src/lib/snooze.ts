export const SNOOZE_PRESETS = ["tomorrow", "3_days", "next_week", "next_monday"] as const;
export type SnoozePreset = typeof SNOOZE_PRESETS[number];

export function computeSnoozeUntil(preset: SnoozePreset, now: Date = new Date()): Date {
  const result = new Date(now);

  switch (preset) {
    case "tomorrow": {
      result.setDate(result.getDate() + 1);
      result.setHours(9, 0, 0, 0);
      return result;
    }
    case "3_days": {
      return new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    }
    case "next_week": {
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    }
    case "next_monday": {
      // 0 = Sun, 1 = Mon ... 6 = Sat
      const dayOfWeek = now.getDay();
      // Days to add: if today is Monday, add 7; else ((8 - dayOfWeek) % 7) gives Mon→Mon=7, Sun→Mon=1, Tue→Mon=6 ...
      const daysToAdd = dayOfWeek === 1 ? 7 : (8 - dayOfWeek) % 7;
      result.setDate(result.getDate() + daysToAdd);
      result.setHours(9, 0, 0, 0);
      return result;
    }
  }
}

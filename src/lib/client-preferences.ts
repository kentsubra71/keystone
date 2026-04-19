import type { SnoozePreset } from "./snooze";

export type UserPreferences = {
  defaultSnoozePreset: SnoozePreset;
};

const DEFAULTS: UserPreferences = { defaultSnoozePreset: "3_days" };

let cache: Promise<UserPreferences> | null = null;

export function getUserPreferences(): Promise<UserPreferences> {
  if (!cache) {
    cache = fetch("/api/settings/preferences")
      .then((r) => (r.ok ? r.json() : DEFAULTS))
      .catch(() => DEFAULTS);
  }
  return cache;
}

export function invalidateUserPreferences(): void {
  cache = null;
}

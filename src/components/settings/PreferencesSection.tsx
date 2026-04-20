"use client";

import { useEffect, useState } from "react";
import { SNOOZE_PRESETS, type SnoozePreset } from "@/lib/snooze";
import { getUserPreferences, invalidateUserPreferences } from "@/lib/client-preferences";
import { Toast } from "@/components/ui/Toast";
import { logError } from "@/lib/logger";

const LABELS: Record<SnoozePreset, string> = {
  tomorrow: "Tomorrow",
  "3_days": "3 days",
  next_week: "Next week (7d)",
  next_monday: "Next Monday",
};

export function PreferencesSection() {
  const [preset, setPreset] = useState<SnoozePreset>("3_days");
  const [initialPreset, setInitialPreset] = useState<SnoozePreset>("3_days");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ state: "passive" | "error"; message: string } | null>(null);

  useEffect(() => {
    getUserPreferences().then(p => {
      setPreset(p.defaultSnoozePreset);
      setInitialPreset(p.defaultSnoozePreset);
    });
  }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultSnoozePreset: preset }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      invalidateUserPreferences();
      setInitialPreset(preset);
      setToast({ state: "passive", message: "Preferences saved" });
    } catch (err) {
      logError("preferences_save_failed", err);
      setToast({ state: "error", message: "Couldn't save preferences." });
    } finally {
      setSaving(false);
    }
  }

  const dirty = preset !== initialPreset;

  return (
    <div>
      <fieldset>
        <legend className="text-sm font-medium text-gray-900 dark:text-white mb-3">Default snooze duration</legend>
        <div className="space-y-2">
          {SNOOZE_PRESETS.map((p) => (
            <label key={p} className="flex items-center gap-3 text-sm text-gray-800 dark:text-gray-200 cursor-pointer">
              <input
                type="radio"
                name="default-snooze"
                value={p}
                checked={preset === p}
                onChange={() => setPreset(p)}
                className="h-4 w-4 text-brand-600 focus:ring-brand-500 border-gray-300"
              />
              {LABELS[p]}
            </label>
          ))}
        </div>
      </fieldset>
      <button
        onClick={save}
        disabled={!dirty || saving}
        className="mt-4 px-4 py-2 text-sm font-medium rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
      >
        {saving ? "Saving…" : "Save"}
      </button>

      {toast && (
        <Toast
          state={toast.state}
          message={toast.message}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}

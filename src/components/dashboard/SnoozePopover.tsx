"use client";

import { useEffect } from "react";
import { computeSnoozeUntil, SNOOZE_PRESETS, type SnoozePreset } from "@/lib/snooze";

type SnoozePopoverProps = {
  defaultPreset: SnoozePreset;
  onPick: (snoozedUntil: Date) => void;
  onClose: () => void;
};

const LABELS: Record<SnoozePreset, string> = {
  tomorrow: "Tomorrow",
  "3_days": "3 days",
  next_week: "Next week (7d)",
  next_monday: "Next Monday",
};

export function SnoozePopover({ defaultPreset, onPick, onClose }: SnoozePopoverProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); return; }
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= SNOOZE_PRESETS.length) {
        e.preventDefault();
        const preset = SNOOZE_PRESETS[n - 1];
        onPick(computeSnoozeUntil(preset));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onPick, onClose]);

  return (
    <div className="absolute z-20 mt-1 w-56 rounded-lg border border-gray-200 dark:border-gray-700/40 bg-white dark:bg-gray-900 shadow-lg p-1">
      {SNOOZE_PRESETS.map((preset, idx) => {
        const isDefault = preset === defaultPreset;
        return (
          <button
            key={preset}
            data-default={isDefault ? "true" : undefined}
            onClick={() => onPick(computeSnoozeUntil(preset))}
            className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-md hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors ${
              isDefault ? "font-semibold text-gray-900 dark:text-white" : "text-gray-700 dark:text-gray-200"
            }`}
          >
            <span className="flex items-center gap-2">
              {isDefault && <span aria-hidden className="text-brand-600 dark:text-brand-400">✓</span>}
              {LABELS[preset]}
            </span>
            <kbd className="text-xs text-gray-500 dark:text-gray-400">{idx + 1}</kbd>
          </button>
        );
      })}
    </div>
  );
}

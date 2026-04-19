"use client";

import { useEffect, useState } from "react";

export type ToastState = "action" | "passive" | "error";

type ToastProps = {
  state: ToastState;
  message: string;
  duration?: number;
  onDismiss: () => void;
  undoAction?: () => void;
  action?: { label: string; onClick: () => void };
};

const DEFAULT_DURATION: Record<ToastState, number | null> = {
  action: 5000,
  passive: 2000,
  error: null, // persistent
};

export function Toast({ state, message, duration, onDismiss, undoAction, action }: ToastProps) {
  const [isVisible, setIsVisible] = useState(true);
  const effectiveDuration = duration ?? DEFAULT_DURATION[state];

  useEffect(() => {
    if (effectiveDuration === null) return;
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onDismiss, 300);
    }, effectiveDuration);
    return () => clearTimeout(timer);
  }, [effectiveDuration, onDismiss]);

  const containerClasses =
    state === "error"
      ? "bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800/60 text-rose-900 dark:text-rose-200"
      : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700/40 text-gray-900 dark:text-white";

  return (
    <div
      role={state === "error" ? "alert" : "status"}
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      }`}
    >
      <div className={`border px-5 py-3 rounded-xl shadow-lg flex items-center gap-4 ${containerClasses}`}>
        <span className="text-sm">{message}</span>
        {state === "action" && undoAction && (
          <button
            onClick={() => {
              undoAction();
              onDismiss();
            }}
            className="text-sm font-semibold text-brand-700 dark:text-brand-300 hover:text-brand-600 dark:hover:text-brand-200 transition-colors"
          >
            Undo
          </button>
        )}
        {state === "error" && action && (
          <button
            onClick={action.onClick}
            className="text-sm font-semibold text-rose-800 dark:text-rose-300 hover:text-rose-700 dark:hover:text-rose-200 transition-colors"
          >
            {action.label}
          </button>
        )}
        {state === "error" && (
          <button
            onClick={onDismiss}
            aria-label="Dismiss"
            className="text-sm text-rose-700 dark:text-rose-300 hover:text-rose-900 dark:hover:text-rose-100 transition-colors"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

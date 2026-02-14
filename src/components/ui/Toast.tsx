"use client";

import { useEffect, useState } from "react";

type ToastProps = {
  message: string;
  undoAction?: () => void;
  duration?: number;
  onDismiss: () => void;
};

export function Toast({ message, undoAction, duration = 5000, onDismiss }: ToastProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onDismiss, 300);
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onDismiss]);

  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      }`}
    >
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700/40 text-gray-900 dark:text-white px-5 py-3 rounded-xl shadow-lg dark:shadow-glow-brand flex items-center gap-4">
        <span className="text-sm">{message}</span>
        {undoAction && (
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
      </div>
    </div>
  );
}

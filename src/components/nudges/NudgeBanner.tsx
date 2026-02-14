"use client";

import { useState, useEffect } from "react";

type Nudge = {
  id: string;
  type: string;
  itemId: string;
  itemTitle: string;
  reason: string;
};

export function NudgeBanner() {
  const [nudges, setNudges] = useState<Nudge[]>([]);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    fetchNudges();
  }, []);

  async function fetchNudges() {
    try {
      const res = await fetch("/api/nudges");
      if (res.ok) {
        const data = await res.json();
        setNudges(data.nudges || []);
      }
    } catch (err) {
      console.error("Failed to fetch nudges:", err);
    }
  }

  async function dismissNudge(nudgeId: string) {
    try {
      await fetch(`/api/nudges/${nudgeId}/dismiss`, { method: "POST" });
      setNudges(nudges.filter((n) => n.id !== nudgeId));
    } catch (err) {
      console.error("Failed to dismiss nudge:", err);
    }
  }

  if (nudges.length === 0 || !isVisible) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50">
      {nudges.map((nudge) => (
        <div
          key={nudge.id}
          className={`p-4 flex items-center justify-between ${
            nudge.type === "blocking_others"
              ? "bg-red-600 text-white"
              : nudge.type === "overdue"
              ? "bg-amber-500 text-white"
              : "bg-blue-600 text-white"
          }`}
        >
          <div className="flex items-center gap-3">
            <AlertIcon className="h-5 w-5" />
            <div>
              <p className="font-medium">{nudge.itemTitle}</p>
              <p className="text-sm opacity-90">{nudge.reason}</p>
            </div>
          </div>
          <button
            onClick={() => dismissNudge(nudge.id)}
            className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded text-sm transition-colors"
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
      />
    </svg>
  );
}

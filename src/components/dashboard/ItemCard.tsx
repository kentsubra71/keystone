"use client";

import { useState } from "react";
import { MeetingBadge } from "./MeetingBadge";
import type { DueFromMeItem } from "@/types";
import type { EnrichedMeeting } from "@/app/api/meetings/upcoming/route";

type ItemCardProps = {
  item: DueFromMeItem;
  showBlockedPerson?: boolean;
  showOwner?: boolean;
  meetings?: EnrichedMeeting[];
  onSelect?: (item: DueFromMeItem) => void;
  onAction?: (itemId: string, action: "done" | "snooze" | "ignore", snoozeDays?: number) => void;
  onActionComplete?: () => void;
};

const typeBorderColors = {
  reply: "border-l-blue-500",
  approval: "border-l-amber-500",
  decision: "border-l-violet-500",
  follow_up: "border-l-emerald-500",
};

const typeBadgeStyles = {
  reply: "bg-blue-500/15 text-blue-800 dark:text-blue-300",
  approval: "bg-amber-500/15 text-amber-800 dark:text-amber-400",
  decision: "bg-violet-500/15 text-violet-800 dark:text-violet-300",
  follow_up: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-400",
};

const typeLabels = {
  reply: "Reply",
  approval: "Approval",
  decision: "Decision",
  follow_up: "Follow-up",
};

export function ItemCard({ item, showBlockedPerson, showOwner, meetings, onSelect, onAction, onActionComplete }: ItemCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showSnoozePicker, setShowSnoozePicker] = useState(false);

  async function handleAction(action: "done" | "snooze" | "ignore", snoozeDays?: number) {
    if (onAction) {
      onAction(item.id, action, snoozeDays);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`/api/items/${item.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, snoozeDays: snoozeDays || 1 }),
      });

      if (res.ok) {
        onActionComplete?.();
      } else {
        console.error("Action failed");
      }
    } catch (err) {
      console.error("Action error:", err);
    } finally {
      setIsLoading(false);
    }
  }

  const gmailUrl = item.source === "gmail"
    ? `https://mail.google.com/mail/u/0/#inbox/${item.sourceId}`
    : null;

  return (
    <div
      onClick={() => onSelect?.(item)}
      className={`bg-surface-card rounded-xl border-l-[3px] border border-gray-200 dark:border-gray-700/40 ${typeBorderColors[item.type]} p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 hover:shadow-glow-brand transition-all duration-200 animate-fade-in ${
        onSelect ? "cursor-pointer" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${typeBadgeStyles[item.type]}`}
            >
              {typeLabels[item.type]}
            </span>
            <span className="text-xs text-gray-600 dark:text-gray-300">
              {item.agingDays}d ago
            </span>
            {meetings && <MeetingBadge meetings={meetings} itemId={item.id} />}
          </div>

          <h3 className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
            {item.title}
          </h3>

          {showBlockedPerson && item.blockingWho && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Blocking: <span className="text-rose-800 dark:text-rose-300">{item.blockingWho}</span>
            </p>
          )}
          {showOwner && item.ownerEmail && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Owner: {item.ownerEmail}
            </p>
          )}

          <p className="text-xs text-gray-600 dark:text-gray-300 mt-2 line-clamp-2">
            {item.rationale}
          </p>
        </div>

        <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
          {item.suggestedAction && (
            <span className="px-3 py-1.5 text-xs font-medium rounded-lg bg-brand-500/10 text-brand-700 dark:text-brand-300 text-center max-w-[180px] truncate">
              {item.suggestedAction}
            </span>
          )}
        </div>
      </div>

      <div
        className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700/40 flex items-center justify-between"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-600 dark:text-gray-300">
            {item.confidenceScore}% confidence
          </span>
          {gmailUrl && (
            <a
              href={gmailUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-brand-700 dark:text-brand-300 hover:text-brand-600 dark:hover:text-brand-200 inline-flex items-center gap-1 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              Gmail
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </a>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => handleAction("done")}
            disabled={isLoading}
            className="text-xs font-medium text-emerald-800 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 disabled:opacity-50 transition-colors"
          >
            Done
          </button>

          {showSnoozePicker ? (
            <div className="flex items-center gap-1.5">
              {[
                { label: "1d", days: 1 },
                { label: "3d", days: 3 },
                { label: "1w", days: 7 },
              ].map((opt) => (
                <button
                  key={opt.days}
                  onClick={() => {
                    handleAction("snooze", opt.days);
                    setShowSnoozePicker(false);
                  }}
                  disabled={isLoading}
                  className="text-xs px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-800 dark:text-amber-400 hover:bg-amber-500/25 disabled:opacity-50 transition-colors"
                >
                  {opt.label}
                </button>
              ))}
              <button
                onClick={() => setShowSnoozePicker(false)}
                className="text-xs text-gray-600 dark:text-gray-300 hover:text-gray-500"
              >
                x
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowSnoozePicker(true)}
              disabled={isLoading}
              className="text-xs text-gray-600 dark:text-gray-300 hover:text-amber-500 dark:hover:text-amber-400 disabled:opacity-50 transition-colors"
            >
              Snooze
            </button>
          )}

          <button
            onClick={() => handleAction("ignore")}
            disabled={isLoading}
            className="text-xs text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-50 transition-colors"
          >
            Ignore
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import type { DueFromMeItem } from "@/types";

type ThreadMessage = {
  messageId: string;
  from: string;
  to: string[];
  cc: string[];
  receivedAt: string;
  body: string;
};

type Thread = {
  threadId: string;
  subject: string;
  snippet: string;
  messages: ThreadMessage[];
  labels: string[];
  isMailingList: boolean;
};

type ItemDetailDrawerProps = {
  item: DueFromMeItem;
  onClose: () => void;
  onAction: (itemId: string, action: "done" | "snooze" | "ignore", snoozeDays?: number) => void;
};

const typeBadgeStyles: Record<string, string> = {
  reply: "bg-blue-500/15 text-blue-800 dark:text-blue-300",
  approval: "bg-amber-500/15 text-amber-800 dark:text-amber-400",
  decision: "bg-violet-500/15 text-violet-800 dark:text-violet-300",
  follow_up: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-400",
};

const typeLabels: Record<string, string> = {
  reply: "Reply",
  approval: "Approval",
  decision: "Decision",
  follow_up: "Follow-up",
};

export function ItemDetailDrawer({ item, onClose, onAction }: ItemDetailDrawerProps) {
  const [thread, setThread] = useState<Thread | null>(null);
  const [isLoadingThread, setIsLoadingThread] = useState(true);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [polishedText, setPolishedText] = useState<string | null>(null);
  const [isPolishing, setIsPolishing] = useState(false);
  const [isCreatingDraft, setIsCreatingDraft] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [draftStatus, setDraftStatus] = useState<string | null>(null);
  const [showSnoozePicker, setShowSnoozePicker] = useState(false);

  const gmailUrl = `https://mail.google.com/mail/u/0/#inbox/${item.sourceId}`;

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    if (item.source !== "gmail") {
      setIsLoadingThread(false);
      return;
    }

    async function fetchThread() {
      try {
        const res = await fetch(`/api/threads/${item.sourceId}`);
        if (res.ok) {
          const data = await res.json();
          setThread(data.thread);
        } else {
          setThreadError("Could not load email thread");
        }
      } catch {
        setThreadError("Failed to fetch thread");
      } finally {
        setIsLoadingThread(false);
      }
    }

    fetchThread();
  }, [item.sourceId, item.source]);

  async function handleCreateDraft() {
    if (!replyText.trim()) return;
    setIsCreatingDraft(true);
    setDraftStatus("Creating draft...");

    try {
      const res = await fetch("/api/drafts/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: item.sourceId, transcript: replyText.trim() }),
      });

      if (res.ok) {
        setDraftStatus("Draft created! Check Gmail.");
        setReplyText("");
      } else {
        const data = await res.json();
        setDraftStatus(data.error || "Failed to create draft");
      }
    } catch {
      setDraftStatus("Failed to create draft");
    } finally {
      setIsCreatingDraft(false);
    }
  }

  async function handlePolish() {
    if (!replyText.trim()) return;
    setIsPolishing(true);
    setDraftStatus(null);

    try {
      const res = await fetch("/api/emails/polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: item.sourceId, transcript: replyText.trim() }),
      });

      if (res.ok) {
        const data = await res.json();
        setPolishedText(data.polished);
      } else {
        setDraftStatus("Failed to polish text");
      }
    } catch {
      setDraftStatus("Failed to polish text");
    } finally {
      setIsPolishing(false);
    }
  }

  async function handleConfirmSend() {
    if (!polishedText) return;
    setIsSending(true);
    setDraftStatus("Sending...");

    try {
      const res = await fetch("/api/emails/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: item.sourceId,
          transcript: replyText.trim(),
          polishedBody: polishedText,
        }),
      });

      if (res.ok) {
        setDraftStatus("Reply sent!");
        setReplyText("");
        setPolishedText(null);
      } else {
        const data = await res.json();
        setDraftStatus(data.error || "Failed to send reply");
      }
    } catch {
      setDraftStatus("Failed to send reply");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-fade-in" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 w-full max-w-xl bg-surface-drawer shadow-2xl z-50 flex flex-col animate-slide-in-right border-l border-gray-200 dark:border-gray-700/40">
        {/* Header with gradient bar */}
        <div className="flex-shrink-0">
          <div className="h-1 bg-gradient-brand" />
          <div className="border-b border-gray-200 dark:border-gray-700/40 p-5 flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${typeBadgeStyles[item.type]}`}>
                  {typeLabels[item.type]}
                </span>
                <span className="text-xs text-gray-600 dark:text-gray-300">{item.agingDays}d ago</span>
              </div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white leading-snug">
                {item.title}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="flex-shrink-0 p-1.5 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* Open in Gmail */}
          {item.source === "gmail" && (
            <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700/40">
              <a
                href={gmailUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-brand-700 dark:text-brand-300 hover:text-brand-600 dark:hover:text-brand-200 inline-flex items-center gap-1.5 transition-colors"
              >
                Open in Gmail
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </a>
            </div>
          )}

          {/* AI Assessment */}
          <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/40 bg-brand-500/5">
            <h3 className="text-xs font-medium text-brand-700 dark:text-brand-300 uppercase tracking-wider mb-1.5">
              AI Assessment
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">{item.rationale}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-600 dark:text-gray-300">
              <span>Confidence: {item.confidenceScore}%</span>
              {item.suggestedAction && <span>Suggested: {item.suggestedAction}</span>}
              {item.blockingWho && <span>Blocking: <span className="text-rose-800 dark:text-rose-300">{item.blockingWho}</span></span>}
            </div>
          </div>

          {/* Email Thread */}
          {item.source === "gmail" && (
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/40">
              <h3 className="text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-3">
                Email Thread
              </h3>
              {isLoadingThread ? (
                <div className="py-6 text-center">
                  <div className="inline-block h-5 w-5 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">Loading thread...</p>
                </div>
              ) : threadError ? (
                <p className="text-sm text-gray-600 dark:text-gray-300">{threadError}</p>
              ) : thread ? (
                <div className="border border-gray-200 dark:border-gray-700/40 rounded-xl overflow-hidden divide-y divide-gray-200 dark:divide-gray-700/40">
                  {thread.messages.map((msg, i) => (
                    <MessageBlock
                      key={msg.messageId || i}
                      message={msg}
                      defaultExpanded={i === thread.messages.length - 1}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-600 dark:text-gray-300">No thread data</p>
              )}
            </div>
          )}

          {/* Quick Reply */}
          {item.source === "gmail" && (item.type === "reply" || item.type === "follow_up") && (
            <div className="px-5 py-4">
              <h3 className="text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-3">
                Quick Reply
              </h3>

              {/* Step 1: Type your reply */}
              <textarea
                value={replyText}
                onChange={(e) => {
                  setReplyText(e.target.value);
                  setDraftStatus(null);
                  setPolishedText(null);
                }}
                placeholder="Type your reply... GPT will polish it into a professional email."
                className="w-full p-3 text-sm border border-gray-200 dark:border-gray-700/40 rounded-xl bg-surface-card text-gray-900 dark:text-white placeholder-gray-500 resize-none focus:ring-2 focus:ring-brand-500/50 focus:border-transparent transition-all"
                rows={3}
              />

              {/* Step 2: Preview polished text */}
              {polishedText && (
                <div className="mt-3 p-3 rounded-xl border border-brand-500/30 bg-brand-500/5">
                  <div className="flex items-center gap-1.5 mb-2">
                    <svg className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                    </svg>
                    <span className="text-xs font-medium text-brand-700 dark:text-brand-300">GPT-polished preview</span>
                  </div>
                  <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{polishedText}</p>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-3 mt-2">
                {polishedText ? (
                  <>
                    <button
                      onClick={handleConfirmSend}
                      disabled={isSending}
                      className="px-4 py-2 text-xs font-medium rounded-lg bg-gradient-brand text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      {isSending ? "Sending..." : "Confirm & Send"}
                    </button>
                    <button
                      onClick={() => setPolishedText(null)}
                      className="px-4 py-2 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700/40 bg-gray-50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-all"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={handlePolish}
                      disabled={!replyText.trim() || isPolishing || isCreatingDraft}
                      className="px-4 py-2 text-xs font-medium rounded-lg bg-gradient-brand text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      {isPolishing ? "Polishing..." : "Send Reply"}
                    </button>
                    <button
                      onClick={handleCreateDraft}
                      disabled={!replyText.trim() || isCreatingDraft || isPolishing}
                      className="px-4 py-2 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700/40 bg-gray-50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      {isCreatingDraft ? "Creating..." : "Save Draft"}
                    </button>
                  </>
                )}
              </div>

              {draftStatus && (
                <p className={`text-xs mt-2 ${draftStatus.includes("sent") || draftStatus.includes("created") ? "text-emerald-800 dark:text-emerald-400" : draftStatus.includes("Failed") ? "text-rose-700 dark:text-rose-400" : "text-gray-600 dark:text-gray-300"}`}>
                  {draftStatus}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Sticky Action Bar */}
        <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700/40 p-4 bg-surface-drawer">
          <div className="flex items-center gap-3">
            <button
              onClick={() => onAction(item.id, "done")}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 transition-colors"
            >
              Done
            </button>

            {showSnoozePicker ? (
              <div className="flex items-center gap-2">
                {[
                  { label: "1 day", days: 1 },
                  { label: "3 days", days: 3 },
                  { label: "1 week", days: 7 },
                ].map((opt) => (
                  <button
                    key={opt.days}
                    onClick={() => {
                      onAction(item.id, "snooze", opt.days);
                      setShowSnoozePicker(false);
                    }}
                    className="px-3 py-2 text-xs font-medium rounded-lg bg-amber-500/15 text-amber-800 dark:text-amber-400 hover:bg-amber-500/25 transition-colors"
                  >
                    {opt.label}
                  </button>
                ))}
                <button
                  onClick={() => setShowSnoozePicker(false)}
                  className="text-xs text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowSnoozePicker(true)}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                Snooze
              </button>
            )}

            <button
              onClick={() => onAction(item.id, "ignore")}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 dark:bg-gray-800/50 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              Ignore
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function MessageBlock({
  message,
  defaultExpanded,
}: {
  message: ThreadMessage;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const date = new Date(message.receivedAt);
  const dateStr = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const fromDisplay = message.from.replace(/<[^>]+>/, "").trim() || message.from;

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-4 py-3 flex items-center justify-between gap-2 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <svg
            className={`h-3.5 w-3.5 flex-shrink-0 text-gray-600 dark:text-gray-400 transition-transform ${expanded ? "rotate-90" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
            {fromDisplay}
          </span>
        </div>
        <span className="text-xs text-gray-600 dark:text-gray-400 flex-shrink-0">{dateStr}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-3">
          <div className="text-xs text-gray-600 dark:text-gray-400 mb-2 space-y-0.5">
            <div>To: {message.to.join(", ")}</div>
            {message.cc.length > 0 && <div>Cc: {message.cc.join(", ")}</div>}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-words leading-relaxed max-h-96 overflow-y-auto">
            {message.body || "(No text content)"}
          </div>
        </div>
      )}
    </div>
  );
}

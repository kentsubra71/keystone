"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ItemCard } from "./ItemCard";
import { ItemDetailDrawer } from "./ItemDetailDrawer";
import { Toast, type ToastState } from "@/components/ui/Toast";
import { logError } from "@/lib/logger";
import type { DueFromMeItem } from "@/types";
import type { EnrichedMeeting } from "@/app/api/meetings/upcoming/route";

type ActionKind = "done" | "snooze" | "ignore";

type ToastData =
  | { state: "action"; message: string }
  | { state: "passive"; message: string }
  | { state: "error"; message: string; retry: () => void };

type PendingAction = {
  itemId: string;
  action: ActionKind;
  snoozedUntil?: Date;
  timeoutId: ReturnType<typeof setTimeout>;
};

const UNDO_WINDOW_MS = 5000;

type BlockingOthersSectionProps = {
  meetings?: EnrichedMeeting[];
};

export function BlockingOthersSection({ meetings }: BlockingOthersSectionProps) {
  const [items, setItems] = useState<DueFromMeItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [selectedItem, setSelectedItem] = useState<DueFromMeItem | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const itemsRef = useRef<DueFromMeItem[]>([]);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch("/api/due-from-me?filter=blocking");
      if (res.ok) {
        const data = await res.json();
        const fetched = data.items || [];
        setItems(fetched);
        itemsRef.current = fetched;
      }
    } catch (err) {
      logError("fetch_blocking_items_failed", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  function commitAction(itemId: string, action: ActionKind, snoozedUntil?: Date) {
    const body: Record<string, unknown> = { action };
    if (action === "snooze" && snoozedUntil) body.snoozedUntil = snoozedUntil.toISOString();
    return fetch(`/api/items/${itemId}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function runCommit(itemId: string, action: ActionKind, snoozedUntil?: Date) {
    try {
      const res = await commitAction(itemId, action, snoozedUntil);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setToast({ state: "passive", message: "Saved" });
    } catch (err) {
      logError("item_action_commit_failed", err, { itemId, action });
      setItems(itemsRef.current); // restore
      setToast({
        state: "error",
        message: "Couldn't save. Try again.",
        retry: () => {
          setItems((prev) => prev.filter((i) => i.id !== itemId));
          setToast(null);
          void runCommit(itemId, action, snoozedUntil);
        },
      });
    } finally {
      setPending(null);
    }
  }

  function handleActionWithUndo(itemId: string, action: ActionKind, snoozedUntil?: Date) {
    setSelectedItem(null);
    if (pending) clearTimeout(pending.timeoutId);

    setItems((prev) => prev.filter((i) => i.id !== itemId));

    const timeoutId = setTimeout(() => {
      void runCommit(itemId, action, snoozedUntil);
    }, UNDO_WINDOW_MS);
    setPending({ itemId, action, snoozedUntil, timeoutId });

    const label =
      action === "done" ? "Marked as done" : action === "snooze" ? "Snoozed" : "Ignored";
    setToast({ state: "action", message: label });
  }

  function handleUndo() {
    if (!pending) return;
    clearTimeout(pending.timeoutId);
    setPending(null);
    setItems(itemsRef.current);
    setToast(null);
  }

  return (
    <section>
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex items-center justify-between mb-4 w-full group"
      >
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Blocking Others
          </h2>
          {items.length > 0 && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-800 dark:text-rose-300">
              {items.length}
            </span>
          )}
        </div>
        <svg
          className={`h-5 w-5 text-gray-600 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200 transition-transform duration-200 ${isCollapsed ? "-rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {isCollapsed ? null : isLoading ? (
        <div className="bg-surface-card rounded-xl border border-gray-200 dark:border-gray-700/40 p-8 text-center">
          <div className="inline-block h-5 w-5 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
          <p className="text-gray-600 dark:text-gray-300 mt-2">Loading...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-surface-card rounded-xl border border-gray-200 dark:border-gray-700/40 p-8 text-center">
          <p className="text-gray-600 dark:text-gray-300">
            You are not blocking anyone
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              showBlockedPerson
              meetings={meetings}
              onSelect={setSelectedItem}
              onAction={handleActionWithUndo}
            />
          ))}
        </div>
      )}

      {selectedItem && (
        <ItemDetailDrawer
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onAction={handleActionWithUndo}
        />
      )}

      {toast && (
        <Toast
          state={toast.state as ToastState}
          message={toast.message}
          undoAction={toast.state === "action" ? handleUndo : undefined}
          action={
            toast.state === "error"
              ? { label: "Retry", onClick: toast.retry }
              : undefined
          }
          onDismiss={() => setToast(null)}
        />
      )}
    </section>
  );
}

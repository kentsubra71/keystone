"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ItemCard } from "./ItemCard";
import { ItemDetailDrawer } from "./ItemDetailDrawer";
import { Toast } from "@/components/ui/Toast";
import type { DueFromMeItem } from "@/types";

type PendingAction = {
  itemId: string;
  action: "done" | "snooze" | "ignore";
  snoozeDays?: number;
  timeoutId: ReturnType<typeof setTimeout>;
};

export function BlockingOthersSection() {
  const [items, setItems] = useState<DueFromMeItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [selectedItem, setSelectedItem] = useState<DueFromMeItem | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
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
      console.error("Failed to fetch blocking items:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  function handleActionWithUndo(itemId: string, action: "done" | "snooze" | "ignore", snoozeDays?: number) {
    setSelectedItem(null);

    if (pendingAction) {
      clearTimeout(pendingAction.timeoutId);
    }

    setItems((prev) => prev.filter((i) => i.id !== itemId));

    const timeoutId = setTimeout(async () => {
      try {
        await fetch(`/api/items/${itemId}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, snoozeDays: snoozeDays || 1 }),
        });
      } catch (err) {
        console.error("Action commit failed:", err);
      }
      setPendingAction(null);
    }, 5000);

    setPendingAction({ itemId, action, snoozeDays, timeoutId });
  }

  function handleUndo() {
    if (!pendingAction) return;
    clearTimeout(pendingAction.timeoutId);
    setPendingAction(null);
    setItems(itemsRef.current);
  }

  const actionLabel = pendingAction
    ? pendingAction.action === "done" ? "Marked as done"
    : pendingAction.action === "snooze" ? `Snoozed for ${pendingAction.snoozeDays || 1} day${(pendingAction.snoozeDays || 1) > 1 ? "s" : ""}`
    : "Ignored"
    : "";

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

      {pendingAction && (
        <Toast
          message={actionLabel}
          undoAction={handleUndo}
          onDismiss={() => setPendingAction(null)}
        />
      )}
    </section>
  );
}

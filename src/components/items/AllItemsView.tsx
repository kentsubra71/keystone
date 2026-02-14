"use client";

import { useState, useEffect } from "react";
import type { DueFromMeItem } from "@/types";

const typeBadgeStyles = {
  reply: "bg-blue-500/15 text-blue-800 dark:text-blue-300",
  approval: "bg-amber-500/15 text-amber-800 dark:text-amber-400",
  decision: "bg-violet-500/15 text-violet-800 dark:text-violet-300",
  follow_up: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-400",
};

const statusBadgeStyles = {
  not_started: "bg-gray-500/15 text-gray-700 dark:text-gray-300",
  in_progress: "bg-blue-500/15 text-blue-800 dark:text-blue-300",
  blocked: "bg-rose-500/15 text-rose-800 dark:text-rose-300",
  done: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-400",
  deferred: "bg-gray-500/10 text-gray-700 dark:text-gray-300",
};

export function AllItemsView() {
  const [items, setItems] = useState<DueFromMeItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "due" | "done">("all");

  useEffect(() => {
    fetchItems();
  }, []);

  async function fetchItems() {
    try {
      const res = await fetch("/api/due-from-me");
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch (err) {
      console.error("Failed to fetch items:", err);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAction(itemId: string, action: "done" | "snooze" | "ignore") {
    try {
      const res = await fetch(`/api/items/${itemId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, snoozeDays: 1 }),
      });

      if (res.ok) {
        fetchItems();
      }
    } catch (err) {
      console.error("Failed to perform action:", err);
    }
  }

  const filteredItems = items.filter((item) => {
    if (filter === "due") return item.status !== "done";
    if (filter === "done") return item.status === "done";
    return true;
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="inline-block h-5 w-5 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-2">
        {(["all", "due", "done"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
              filter === f
                ? "bg-brand-500/15 text-brand-700 dark:text-brand-300 font-medium"
                : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800/50"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Items table */}
      {filteredItems.length === 0 ? (
        <div className="bg-surface-card rounded-xl border border-gray-200 dark:border-gray-700/40 p-8 text-center">
          <p className="text-gray-600 dark:text-gray-300">No items found</p>
        </div>
      ) : (
        <div className="bg-surface-card rounded-xl border border-gray-200 dark:border-gray-700/40 overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-gray-200 dark:border-gray-700/40">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">
                  Title
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">
                  Age
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">
                  Confidence
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700/30">
              {filteredItems.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-800 dark:text-gray-100">
                      {item.title}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-300 line-clamp-1">
                      {item.rationale}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${typeBadgeStyles[item.type]}`}
                    >
                      {item.type.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${statusBadgeStyles[item.status]}`}
                    >
                      {item.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {item.agingDays}d
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {item.confidenceScore}%
                  </td>
                  <td className="px-4 py-3 text-right">
                    {item.status !== "done" && (
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleAction(item.id, "done")}
                          className="text-xs font-medium text-emerald-800 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
                        >
                          Done
                        </button>
                        <button
                          onClick={() => handleAction(item.id, "snooze")}
                          className="text-xs text-amber-800 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
                        >
                          Snooze
                        </button>
                        <button
                          onClick={() => handleAction(item.id, "ignore")}
                          className="text-xs text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                        >
                          Ignore
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import type { DueFromMeItem } from "@/types";

const typeColors = {
  reply: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  approval: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  decision: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  follow_up: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
};

const statusColors = {
  not_started: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  blocked: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  done: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  deferred: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
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
    return <div className="text-gray-500 dark:text-gray-400">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-2">
        {(["all", "due", "done"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              filter === f
                ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Items table */}
      {filteredItems.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400">No items found</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Title
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Age
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Confidence
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredItems.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {item.title}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {item.rationale}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${typeColors[item.type]}`}
                    >
                      {item.type.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${statusColors[item.status]}`}
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
                          className="text-xs text-green-600 hover:text-green-800 dark:text-green-400"
                        >
                          Done
                        </button>
                        <button
                          onClick={() => handleAction(item.id, "snooze")}
                          className="text-xs text-amber-600 hover:text-amber-800 dark:text-amber-400"
                        >
                          Snooze
                        </button>
                        <button
                          onClick={() => handleAction(item.id, "ignore")}
                          className="text-xs text-gray-600 hover:text-gray-800 dark:text-gray-400"
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

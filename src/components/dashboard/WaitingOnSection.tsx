"use client";

import { useState, useEffect } from "react";
import type { SheetItem } from "@/types";

export function WaitingOnSection() {
  const [items, setItems] = useState<SheetItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    async function fetchItems() {
      try {
        const res = await fetch("/api/waiting-on");
        if (res.ok) {
          const data = await res.json();
          setItems(data.items || []);
        }
      } catch (err) {
        console.error("Failed to fetch waiting-on items:", err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchItems();
  }, []);

  return (
    <section>
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex items-center justify-between mb-4 w-full group"
      >
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Waiting On Others
          </h2>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-400">
            {items.length}
          </span>
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
            Not waiting on anyone
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <SheetItemCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}

function SheetItemCard({ item }: { item: SheetItem }) {
  const daysSinceFirstSeen = Math.floor(
    (Date.now() - new Date(item.firstSeenAt).getTime()) / (1000 * 60 * 60 * 24)
  );

  return (
    <div className="bg-surface-card rounded-xl border border-gray-200 dark:border-gray-700/40 p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all duration-200">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            {item.isOverdue && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-rose-500/15 text-rose-800 dark:text-rose-300">
                Overdue
              </span>
            )}
            {item.isAtRisk && !item.isOverdue && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-amber-500/15 text-amber-800 dark:text-amber-400">
                At Risk
              </span>
            )}
            {item.needsOwnerMapping && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-gray-500/15 text-gray-700 dark:text-gray-400">
                Needs Owner
              </span>
            )}
            <span className="text-xs text-gray-600 dark:text-gray-300">
              {daysSinceFirstSeen}d ago
            </span>
          </div>

          <h3 className="text-sm font-medium text-gray-800 dark:text-gray-100">
            {item.commitment}
          </h3>

          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Owner: {item.ownerEmail || item.ownerLabel || "Unassigned"}
          </p>

          {item.dueDate && (
            <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
              Due: {new Date(item.dueDate).toLocaleDateString()}
            </p>
          )}
        </div>

        <div className="text-xs text-gray-600 dark:text-gray-300 capitalize px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800/50">
          {item.status.replace("_", " ")}
        </div>
      </div>
    </div>
  );
}

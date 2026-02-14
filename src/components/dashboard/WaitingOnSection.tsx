"use client";

import { useState, useEffect } from "react";
import type { SheetItem } from "@/types";

export function WaitingOnSection() {
  const [items, setItems] = useState<SheetItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Waiting On Others
        </h2>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {items.length} items
        </span>
      </div>

      {isLoading ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400">Loading...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400">
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
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Status badges */}
          <div className="flex items-center gap-2 mb-2">
            {item.isOverdue && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                Overdue
              </span>
            )}
            {item.isAtRisk && !item.isOverdue && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                At Risk
              </span>
            )}
            {item.needsOwnerMapping && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200">
                Needs Owner
              </span>
            )}
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {daysSinceFirstSeen} days
            </span>
          </div>

          {/* Commitment text */}
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">
            {item.commitment}
          </h3>

          {/* Owner */}
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Owner: {item.ownerEmail || item.ownerLabel || "Unassigned"}
          </p>

          {/* Due date */}
          {item.dueDate && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Due: {new Date(item.dueDate).toLocaleDateString()}
            </p>
          )}
        </div>

        {/* Status */}
        <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">
          {item.status.replace("_", " ")}
        </div>
      </div>
    </div>
  );
}

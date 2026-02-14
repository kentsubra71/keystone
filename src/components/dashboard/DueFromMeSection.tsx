"use client";

import { useState, useEffect, useCallback } from "react";
import { ItemCard } from "./ItemCard";
import type { DueFromMeItem } from "@/types";

export function DueFromMeSection() {
  const [items, setItems] = useState<DueFromMeItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch("/api/due-from-me?filter=due");
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch (err) {
      console.error("Failed to fetch due-from-me items:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Due From Me (Now)
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
            No items due from you right now
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} onActionComplete={fetchItems} />
          ))}
        </div>
      )}
    </section>
  );
}

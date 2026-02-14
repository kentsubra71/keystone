"use client";

import { useState } from "react";

export function SyncSettings() {
  const [isSheetSyncing, setIsSheetSyncing] = useState(false);
  const [isGmailSyncing, setIsGmailSyncing] = useState(false);
  const [sheetResult, setSheetResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [gmailResult, setGmailResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  async function handleSheetSync() {
    setIsSheetSyncing(true);
    setSheetResult(null);

    try {
      const res = await fetch("/api/sync/sheet", {
        method: "POST",
      });

      const data = await res.json();

      if (res.ok) {
        setSheetResult({
          success: true,
          message: `Sync complete: ${data.added} added, ${data.updated} updated`,
        });
      } else {
        setSheetResult({
          success: false,
          message: data.error || "Sync failed",
        });
      }
    } catch (err) {
      setSheetResult({
        success: false,
        message: "Failed to sync",
      });
    } finally {
      setIsSheetSyncing(false);
    }
  }

  async function handleGmailSync() {
    setIsGmailSyncing(true);
    setGmailResult(null);

    try {
      const res = await fetch("/api/sync/gmail", {
        method: "POST",
      });

      const data = await res.json();

      if (res.ok) {
        setGmailResult({
          success: true,
          message: `Gmail sync complete: ${data.threadsProcessed} threads processed, ${data.dueItemsCreated} due items created`,
        });
      } else {
        setGmailResult({
          success: false,
          message: data.error || "Gmail sync failed",
        });
      }
    } catch (err) {
      setGmailResult({
        success: false,
        message: "Failed to sync Gmail",
      });
    } finally {
      setIsGmailSyncing(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Sheet Sync */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white">
          Google Sheets
        </h3>
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Sync commitments from your Google Sheet.
          </p>
          <button
            onClick={handleSheetSync}
            disabled={isSheetSyncing}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-gradient-brand text-white hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSheetSyncing ? "Syncing..." : "Sync Sheets"}
          </button>
        </div>

        {sheetResult && (
          <div
            className={`p-3 rounded-lg text-sm ${
              sheetResult.success
                ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 border border-emerald-500/20"
                : "bg-rose-500/10 text-rose-800 dark:text-rose-400 border border-rose-500/20"
            }`}
          >
            {sheetResult.message}
          </div>
        )}
      </div>

      {/* Gmail Sync */}
      <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700/40">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white">
          Gmail
        </h3>
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Scan inbox for items needing your reply, approval, or decision.
          </p>
          <button
            onClick={handleGmailSync}
            disabled={isGmailSyncing}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-gradient-brand text-white hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGmailSyncing ? "Syncing..." : "Sync Gmail"}
          </button>
        </div>

        {gmailResult && (
          <div
            className={`p-3 rounded-lg text-sm ${
              gmailResult.success
                ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 border border-emerald-500/20"
                : "bg-rose-500/10 text-rose-800 dark:text-rose-400 border border-rose-500/20"
            }`}
          >
            {gmailResult.message}
          </div>
        )}
      </div>

      {/* Configuration */}
      <div className="pt-4 border-t border-gray-200 dark:border-gray-700/40">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
          Sheet Configuration
        </h3>
        <div className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
          <p>Tab: Sorted</p>
          <p>Columns: B=Task, C=Date, E=Owner, F=Status, G=Comments</p>
          <p>Sync frequency: Every 6 hours</p>
        </div>
      </div>
    </div>
  );
}

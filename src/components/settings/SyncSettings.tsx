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
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Sync commitments from your Google Sheet.
            </p>
          </div>
          <button
            onClick={handleSheetSync}
            disabled={isSheetSyncing}
            className="px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg hover:bg-gray-700 dark:hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSheetSyncing ? "Syncing..." : "Sync Sheets"}
          </button>
        </div>

        {sheetResult && (
          <div
            className={`p-3 rounded-lg text-sm ${
              sheetResult.success
                ? "bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                : "bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-300"
            }`}
          >
            {sheetResult.message}
          </div>
        )}
      </div>

      {/* Gmail Sync */}
      <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white">
          Gmail
        </h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Scan inbox for items needing your reply, approval, or decision.
            </p>
          </div>
          <button
            onClick={handleGmailSync}
            disabled={isGmailSyncing}
            className="px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg hover:bg-gray-700 dark:hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGmailSyncing ? "Syncing..." : "Sync Gmail"}
          </button>
        </div>

        {gmailResult && (
          <div
            className={`p-3 rounded-lg text-sm ${
              gmailResult.success
                ? "bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                : "bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-300"
            }`}
          >
            {gmailResult.message}
          </div>
        )}
      </div>

      {/* Configuration */}
      <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
          Sheet Configuration
        </h3>
        <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
          <p>Tab: Sorted</p>
          <p>Columns: B=Task, C=Date, E=Owner, F=Status, G=Comments</p>
          <p>Sync frequency: Every 6 hours</p>
        </div>
      </div>
    </div>
  );
}

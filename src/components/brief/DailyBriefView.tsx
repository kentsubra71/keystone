"use client";

import { useState, useEffect } from "react";

type BriefContent = {
  topDueItems: {
    id: string;
    title: string;
    type: string;
    agingDays: number;
    rationale: string;
  }[];
  overdueItems: {
    id: string;
    title: string;
    type: string;
    agingDays: number;
  }[];
  meetingsNeedingPrep: {
    id: string;
    summary: string;
    startTime: string;
    relatedItems: string[];
  }[];
  slippingCommitments: {
    id: string;
    commitment: string;
    ownerEmail: string | null;
    dueDate: string | null;
  }[];
  generatedAt: string;
};

export function DailyBriefView() {
  const [brief, setBrief] = useState<BriefContent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    fetchBrief();
  }, []);

  async function fetchBrief() {
    try {
      const res = await fetch("/api/brief");
      if (res.ok) {
        const data = await res.json();
        setBrief(data.brief);
      }
    } catch (err) {
      console.error("Failed to fetch brief:", err);
    } finally {
      setIsLoading(false);
    }
  }

  async function generateNewBrief() {
    setIsGenerating(true);
    try {
      const res = await fetch("/api/brief", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setBrief(data.brief);
      }
    } catch (err) {
      console.error("Failed to generate brief:", err);
    } finally {
      setIsGenerating(false);
    }
  }

  if (isLoading) {
    return <div className="text-gray-500 dark:text-gray-400">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Generate button */}
      <div className="flex justify-end">
        <button
          onClick={generateNewBrief}
          disabled={isGenerating}
          className="px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg hover:bg-gray-700 dark:hover:bg-gray-200 transition-colors disabled:opacity-50"
        >
          {isGenerating ? "Generating..." : "Generate New Brief"}
        </button>
      </div>

      {!brief ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400">
            No brief generated yet. Click "Generate New Brief" to create one.
          </p>
        </div>
      ) : (
        <>
          {/* Generated timestamp */}
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Generated: {new Date(brief.generatedAt).toLocaleString()}
          </p>

          {/* Top Due Items */}
          <section className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Top Due From You
            </h2>
            {brief.topDueItems.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400">
                Nothing due from you!
              </p>
            ) : (
              <ul className="space-y-3">
                {brief.topDueItems.map((item, index) => (
                  <li key={item.id} className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-sm font-medium text-gray-600 dark:text-gray-300">
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-gray-900 dark:text-white font-medium">
                        {item.title}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {item.type.replace("_", " ")} • {item.agingDays} days
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Overdue Items */}
          {brief.overdueItems.length > 0 && (
            <section className="bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 p-6">
              <h2 className="text-lg font-semibold text-red-900 dark:text-red-200 mb-4">
                Overdue
              </h2>
              <ul className="space-y-2">
                {brief.overdueItems.map((item) => (
                  <li
                    key={item.id}
                    className="text-red-800 dark:text-red-300"
                  >
                    {item.title} ({item.agingDays} days)
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Meetings Needing Prep */}
          {brief.meetingsNeedingPrep.length > 0 && (
            <section className="bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 p-6">
              <h2 className="text-lg font-semibold text-blue-900 dark:text-blue-200 mb-4">
                Meetings Needing Prep
              </h2>
              <ul className="space-y-3">
                {brief.meetingsNeedingPrep.map((meeting) => (
                  <li key={meeting.id}>
                    <p className="text-blue-900 dark:text-blue-200 font-medium">
                      {meeting.summary}
                    </p>
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      {new Date(meeting.startTime).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    {meeting.relatedItems.length > 0 && (
                      <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                        Related: {meeting.relatedItems.join(", ")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Slipping Commitments */}
          {brief.slippingCommitments.length > 0 && (
            <section className="bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800 p-6">
              <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-200 mb-4">
                Slipping Commitments
              </h2>
              <ul className="space-y-2">
                {brief.slippingCommitments.map((item) => (
                  <li key={item.id}>
                    <p className="text-amber-900 dark:text-amber-200">
                      {item.commitment}
                    </p>
                    <p className="text-sm text-amber-700 dark:text-amber-300">
                      Owner: {item.ownerEmail || "Unassigned"}
                      {item.dueDate &&
                        ` • Due: ${new Date(item.dueDate).toLocaleDateString()}`}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

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
    return (
      <div className="flex justify-center py-12">
        <div className="inline-block h-5 w-5 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Generate button */}
      <div className="flex justify-end">
        <button
          onClick={generateNewBrief}
          disabled={isGenerating}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-gradient-brand text-white hover:opacity-90 transition-all disabled:opacity-50"
        >
          {isGenerating ? "Generating..." : "Generate New Brief"}
        </button>
      </div>

      {!brief ? (
        <div className="bg-surface-card rounded-xl border border-gray-200 dark:border-gray-700/40 p-8 text-center">
          <p className="text-gray-600 dark:text-gray-300">
            No brief generated yet. Click &quot;Generate New Brief&quot; to create one.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Generated: {new Date(brief.generatedAt).toLocaleString()}
          </p>

          {/* Top Due Items */}
          <section className="bg-surface-card rounded-xl border border-gray-200 dark:border-gray-700/40 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Top Due From You
            </h2>
            {brief.topDueItems.length === 0 ? (
              <p className="text-gray-600 dark:text-gray-300">
                Nothing due from you!
              </p>
            ) : (
              <ul className="space-y-3">
                {brief.topDueItems.map((item, index) => (
                  <li key={item.id} className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-500/15 flex items-center justify-center text-sm font-medium text-brand-700 dark:text-brand-300">
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-gray-900 dark:text-white font-medium">
                        {item.title}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        {item.type.replace("_", " ")} &bull; {item.agingDays} days
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Overdue Items */}
          {brief.overdueItems.length > 0 && (
            <section className="bg-rose-500/5 rounded-xl border border-rose-500/20 p-6">
              <h2 className="text-lg font-semibold text-rose-800 dark:text-rose-300 mb-4">
                Overdue
              </h2>
              <ul className="space-y-2">
                {brief.overdueItems.map((item) => (
                  <li
                    key={item.id}
                    className="text-rose-800 dark:text-rose-300"
                  >
                    {item.title} ({item.agingDays} days)
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Meetings Needing Prep */}
          {brief.meetingsNeedingPrep.length > 0 && (
            <section className="bg-blue-500/5 rounded-xl border border-blue-500/20 p-6">
              <h2 className="text-lg font-semibold text-blue-800 dark:text-blue-300 mb-4">
                Meetings Needing Prep
              </h2>
              <ul className="space-y-3">
                {brief.meetingsNeedingPrep.map((meeting) => (
                  <li key={meeting.id}>
                    <p className="text-blue-800 dark:text-blue-300 font-medium">
                      {meeting.summary}
                    </p>
                    <p className="text-sm text-blue-800/80 dark:text-blue-400/70">
                      {new Date(meeting.startTime).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    {meeting.relatedItems.length > 0 && (
                      <p className="text-sm text-blue-800/60 dark:text-blue-400/50 mt-1">
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
            <section className="bg-amber-500/5 rounded-xl border border-amber-500/20 p-6">
              <h2 className="text-lg font-semibold text-amber-800 dark:text-amber-400 mb-4">
                Slipping Commitments
              </h2>
              <ul className="space-y-2">
                {brief.slippingCommitments.map((item) => (
                  <li key={item.id}>
                    <p className="text-amber-800 dark:text-amber-300">
                      {item.commitment}
                    </p>
                    <p className="text-sm text-amber-800/80 dark:text-amber-400/70">
                      Owner: {item.ownerEmail || "Unassigned"}
                      {item.dueDate &&
                        ` \u2022 Due: ${new Date(item.dueDate).toLocaleDateString()}`}
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

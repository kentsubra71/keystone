"use client";

import { useState, useEffect } from "react";
import type { EnrichedMeeting } from "@/app/api/meetings/upcoming/route";

type MeetingBriefingSectionProps = {
  meetings: EnrichedMeeting[];
  isLoading?: boolean;
};

function formatRelativeTime(startIso: string): string {
  const start = new Date(startIso);
  const now = new Date();
  const diffMs = start.getTime() - now.getTime();
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));

  if (diffHours < 1) return "now";
  if (diffHours === 1) return "in 1h";
  if (diffHours < 24) return `in ${diffHours}h`;

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (start.toDateString() === tomorrow.toDateString()) {
    return `tomorrow ${start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  }

  return `in ${diffHours}h`;
}

function isToday(iso: string): boolean {
  return new Date(iso).toDateString() === new Date().toDateString();
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function daysAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

function meetingHasContext(meeting: EnrichedMeeting): boolean {
  return meeting.attendees.some(
    (a) => a.dueFromMe.length > 0 || a.theyOweMe.length > 0 || a.recentThreads.length > 0,
  ) || !!meeting.description;
}

export function MeetingBriefingSection({ meetings, isLoading }: MeetingBriefingSectionProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Auto-expand meetings with context when data arrives
  useEffect(() => {
    if (meetings.length > 0) {
      setExpandedIds(new Set(meetings.filter(meetingHasContext).map((m) => m.id)));
    }
  }, [meetings]);

  if (isLoading) return null;

  if (meetings.length === 0) {
    return (
      <section className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Meetings Coming Up
          </h2>
        </div>
        <div className="bg-surface-card rounded-xl border border-gray-200 dark:border-gray-700/40 p-8 text-center">
          <p className="text-gray-600 dark:text-gray-300">
            No meetings in the next 36 hours
          </p>
        </div>
      </section>
    );
  }

  const todayMeetings = meetings.filter((m) => isToday(m.start));
  const tomorrowMeetings = meetings.filter((m) => !isToday(m.start));

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className="mb-10">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Meetings Coming Up
        </h2>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-800 dark:text-blue-300">
          {meetings.length}
        </span>
      </div>

      <div className="space-y-6">
        {todayMeetings.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-3">
              Today
            </h3>
            <div className="space-y-3">
              {todayMeetings.map((meeting) => (
                <MeetingCard
                  key={meeting.id}
                  meeting={meeting}
                  expanded={expandedIds.has(meeting.id)}
                  onToggle={() => toggleExpanded(meeting.id)}
                />
              ))}
            </div>
          </div>
        )}

        {tomorrowMeetings.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-3">
              Tomorrow
            </h3>
            <div className="space-y-3">
              {tomorrowMeetings.map((meeting) => (
                <MeetingCard
                  key={meeting.id}
                  meeting={meeting}
                  expanded={expandedIds.has(meeting.id)}
                  onToggle={() => toggleExpanded(meeting.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function MeetingCard({
  meeting,
  expanded,
  onToggle,
}: {
  meeting: EnrichedMeeting;
  expanded: boolean;
  onToggle: () => void;
}) {
  const hasContext = meetingHasContext(meeting);
  const relTime = formatRelativeTime(meeting.start);
  const time = formatTime(meeting.start);

  // Flatten all due items across attendees for the badge count
  const totalDue = meeting.attendees.reduce((sum, a) => sum + a.dueFromMe.length, 0);
  const totalOwed = meeting.attendees.reduce((sum, a) => sum + a.theyOweMe.length, 0);

  if (!hasContext) {
    // Compact card for meetings with no prep context
    return (
      <div className="bg-surface-card rounded-xl border border-gray-200 dark:border-gray-700/40 px-4 py-3 flex items-center justify-between opacity-60">
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-600 dark:text-gray-400 w-16">{time}</span>
          <span className="text-sm text-gray-700 dark:text-gray-300">{meeting.summary}</span>
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-500">{relTime}</span>
      </div>
    );
  }

  return (
    <div className="bg-surface-card rounded-xl border-l-[3px] border-l-brand-500 border border-gray-200 dark:border-gray-700/40 overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xs font-medium text-brand-700 dark:text-brand-300 w-16 flex-shrink-0">
            {time}
          </span>
          <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
            {meeting.summary}
          </span>
          {totalDue > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-800 dark:text-amber-400 flex-shrink-0">
              {totalDue} due
            </span>
          )}
          {totalOwed > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-md bg-blue-500/15 text-blue-800 dark:text-blue-300 flex-shrink-0">
              {totalOwed} owed
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-gray-500 dark:text-gray-500">{relTime}</span>
          <svg
            className={`h-4 w-4 text-gray-500 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </button>

      {/* Expanded briefing */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-200 dark:border-gray-700/40">
          {/* Agenda */}
          {meeting.description && (
            <div className="pt-3">
              <h4 className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1">
                Agenda
              </h4>
              <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap line-clamp-4">
                {meeting.description}
              </p>
            </div>
          )}

          {/* Per-attendee briefing */}
          {meeting.attendees
            .filter((a) => a.dueFromMe.length > 0 || a.theyOweMe.length > 0 || a.recentThreads.length > 0)
            .map((attendee) => (
              <AttendeeSection key={attendee.email} attendee={attendee} />
            ))}
        </div>
      )}
    </div>
  );
}

function AttendeeSection({ attendee }: { attendee: EnrichedMeeting["attendees"][0] }) {
  const name = attendee.displayName || attendee.email.split("@")[0];

  return (
    <div className="pt-3 border-t border-gray-100 dark:border-gray-700/20">
      <h4 className="text-xs font-semibold text-gray-800 dark:text-gray-200 mb-2">
        {name}
      </h4>

      {/* What I owe them */}
      {attendee.dueFromMe.length > 0 && (
        <div className="mb-2">
          <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">You owe:</span>
          <ul className="mt-1 space-y-0.5">
            {attendee.dueFromMe.map((item) => (
              <li key={item.id} className="text-xs text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-amber-500 flex-shrink-0" />
                <span className="truncate">{item.title}</span>
                <span className="text-gray-500 dark:text-gray-500 flex-shrink-0">
                  ({item.type.replace("_", "-")}, {item.agingDays}d)
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* What they owe me */}
      {attendee.theyOweMe.length > 0 && (
        <div className="mb-2">
          <span className="text-xs text-blue-700 dark:text-blue-400 font-medium">They owe you:</span>
          <ul className="mt-1 space-y-0.5">
            {attendee.theyOweMe.map((item) => (
              <li key={item.id} className="text-xs text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                <span className={`w-1 h-1 rounded-full flex-shrink-0 ${item.isOverdue ? "bg-rose-500" : "bg-blue-500"}`} />
                <span className="truncate">{item.commitment}</span>
                {item.isOverdue && <span className="text-rose-700 dark:text-rose-400 flex-shrink-0">(overdue)</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recent threads */}
      {attendee.recentThreads.length > 0 && (
        <div>
          <span className="text-xs text-gray-600 dark:text-gray-400 font-medium">Recent emails:</span>
          <ul className="mt-1 space-y-0.5">
            {attendee.recentThreads.slice(0, 3).map((thread) => (
              <li key={thread.threadId} className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-600 flex-shrink-0" />
                <a
                  href={`https://mail.google.com/mail/u/0/#inbox/${thread.threadId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate hover:text-brand-600 dark:hover:text-brand-300 transition-colors"
                >
                  {thread.subject}
                </a>
                <span className="flex-shrink-0">{daysAgo(thread.receivedAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

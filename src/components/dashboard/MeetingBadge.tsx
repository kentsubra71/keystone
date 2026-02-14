"use client";

import type { EnrichedMeeting } from "@/app/api/meetings/upcoming/route";

type MeetingBadgeProps = {
  meetings: EnrichedMeeting[];
  itemId: string;
};

export function MeetingBadge({ meetings, itemId }: MeetingBadgeProps) {
  // Find the nearest meeting that contains this item in any attendee's dueFromMe
  let nearestMeeting: EnrichedMeeting | null = null;

  for (const meeting of meetings) {
    for (const attendee of meeting.attendees) {
      if (attendee.dueFromMe.some((d) => d.id === itemId)) {
        if (!nearestMeeting || new Date(meeting.start) < new Date(nearestMeeting.start)) {
          nearestMeeting = meeting;
        }
      }
    }
  }

  if (!nearestMeeting) return null;

  const start = new Date(nearestMeeting.start);
  const now = new Date();
  const diffHours = Math.round((start.getTime() - now.getTime()) / (1000 * 60 * 60));
  const isTodayMeeting = start.toDateString() === now.toDateString();

  let label: string;
  if (diffHours < 1) {
    label = "Meeting now";
  } else if (isTodayMeeting) {
    label = `Meeting in ${diffHours}h`;
  } else {
    label = `Meeting tomorrow ${start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  }

  const badgeClass = isTodayMeeting
    ? "bg-amber-500/15 text-amber-800 dark:text-amber-400"
    : "bg-blue-500/15 text-blue-800 dark:text-blue-300";

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${badgeClass}`}>
      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
      </svg>
      {label}
    </span>
  );
}

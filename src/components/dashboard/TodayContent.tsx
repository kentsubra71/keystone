"use client";

import { useState, useEffect } from "react";
import { MeetingBriefingSection } from "./MeetingBriefingSection";
import { DueFromMeSection } from "./DueFromMeSection";
import { WaitingOnSection } from "./WaitingOnSection";
import type { EnrichedMeeting } from "@/app/api/meetings/upcoming/route";

export function TodayContent() {
  const [meetings, setMeetings] = useState<EnrichedMeeting[]>([]);
  const [isLoadingMeetings, setIsLoadingMeetings] = useState(true);
  const [meetingsError, setMeetingsError] = useState(false);

  useEffect(() => {
    async function fetchMeetings() {
      try {
        const res = await fetch("/api/meetings/upcoming");
        if (!res.ok) {
          console.error("Meetings fetch failed:", res.status);
          setMeetingsError(true);
          return;
        }
        const data = await res.json();
        setMeetings(data.meetings || []);
      } catch (err) {
        console.error("Failed to fetch meetings:", err);
        setMeetingsError(true);
      } finally {
        setIsLoadingMeetings(false);
      }
    }
    fetchMeetings();
  }, []);

  return (
    <div className="space-y-10">
      <MeetingBriefingSection meetings={meetings} isLoading={isLoadingMeetings} error={meetingsError} />
      <DueFromMeSection meetings={meetings} />
      <WaitingOnSection />
    </div>
  );
}

import { google, calendar_v3 } from "googleapis";

export function getCalendarClient(accessToken: string): calendar_v3.Calendar {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.calendar({ version: "v3", auth });
}

export type CalendarEvent = {
  id: string;
  summary: string;
  start: Date;
  end: Date;
  attendees: string[];
  description: string | null;
};

export async function getTodaysMeetings(
  calendar: calendar_v3.Calendar
): Promise<CalendarEvent[]> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  const response = await calendar.events.list({
    calendarId: "primary",
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
  });

  const events = response.data.items || [];

  return events
    .filter((event) => event.start?.dateTime) // Only timed events
    .map((event) => ({
      id: event.id || "",
      summary: event.summary || "(No title)",
      start: new Date(event.start?.dateTime || event.start?.date || ""),
      end: new Date(event.end?.dateTime || event.end?.date || ""),
      attendees: (event.attendees || []).map((a) => a.email || ""),
      description: event.description || null,
    }));
}

export async function getUpcomingMeetings(
  calendar: calendar_v3.Calendar,
  hours: number = 24
): Promise<CalendarEvent[]> {
  const now = new Date();
  const future = new Date(now.getTime() + hours * 60 * 60 * 1000);

  const response = await calendar.events.list({
    calendarId: "primary",
    timeMin: now.toISOString(),
    timeMax: future.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
  });

  const events = response.data.items || [];

  return events
    .filter((event) => event.start?.dateTime)
    .map((event) => ({
      id: event.id || "",
      summary: event.summary || "(No title)",
      start: new Date(event.start?.dateTime || event.start?.date || ""),
      end: new Date(event.end?.dateTime || event.end?.date || ""),
      attendees: (event.attendees || []).map((a) => a.email || ""),
      description: event.description || null,
    }));
}

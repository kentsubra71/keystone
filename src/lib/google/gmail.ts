import { google, gmail_v1 } from "googleapis";

export function getGmailClient(accessToken: string): gmail_v1.Gmail {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.gmail({ version: "v1", auth });
}

export type ParsedEmail = {
  threadId: string;
  messageId: string;
  subject: string;
  snippet: string;
  from: string;
  to: string[];
  cc: string[];
  receivedAt: Date;
  labels: string[];
};

export async function fetchRecentThreads(
  gmail: gmail_v1.Gmail,
  maxResults: number = 50
): Promise<ParsedEmail[]> {
  // Fetch recent threads from inbox
  const threadsResponse = await gmail.users.threads.list({
    userId: "me",
    maxResults,
    q: "in:inbox", // Only inbox messages
  });

  const threads = threadsResponse.data.threads || [];
  const parsedEmails: ParsedEmail[] = [];

  for (const thread of threads) {
    if (!thread.id) continue;

    try {
      const threadDetail = await gmail.users.threads.get({
        userId: "me",
        id: thread.id,
        format: "metadata",
        metadataHeaders: ["From", "To", "Cc", "Subject", "Date"],
      });

      const messages = threadDetail.data.messages || [];
      if (messages.length === 0) continue;

      // Get the latest message in the thread
      const latestMessage = messages[messages.length - 1];
      const headers = latestMessage.payload?.headers || [];

      const getHeader = (name: string) =>
        headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())
          ?.value || "";

      parsedEmails.push({
        threadId: thread.id,
        messageId: latestMessage.id || "",
        subject: getHeader("Subject") || "(No Subject)",
        snippet: threadDetail.data.snippet || "",
        from: getHeader("From"),
        to: parseEmailList(getHeader("To")),
        cc: parseEmailList(getHeader("Cc")),
        receivedAt: new Date(parseInt(latestMessage.internalDate || "0")),
        labels: latestMessage.labelIds || [],
      });
    } catch (error) {
      console.error(`Failed to fetch thread ${thread.id}:`, error);
    }
  }

  return parsedEmails;
}

function parseEmailList(emailString: string): string[] {
  if (!emailString) return [];
  // Simple parsing - handles "Name <email>" format
  return emailString.split(",").map((e) => {
    const match = e.match(/<([^>]+)>/);
    return match ? match[1].trim() : e.trim();
  });
}

export function extractEmailAddress(fromString: string): string {
  const match = fromString.match(/<([^>]+)>/);
  return match ? match[1] : fromString;
}

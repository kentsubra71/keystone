import { google, gmail_v1 } from "googleapis";

export function getGmailClient(accessToken: string): gmail_v1.Gmail {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  auth.setCredentials({ access_token: accessToken });
  return google.gmail({ version: "v1", auth });
}

// A single message within a thread
export type ParsedMessage = {
  messageId: string;
  from: string;
  to: string[];
  cc: string[];
  receivedAt: Date;
  body: string; // plaintext body (full, not snippet)
};

// A full thread with all messages
export type ParsedThread = {
  threadId: string;
  subject: string;
  snippet: string;
  messages: ParsedMessage[];
  labels: string[];
  // Whether thread has List-Unsubscribe or List-Id headers (mailing list indicator)
  isMailingList: boolean;
};

const MAX_CONCURRENT = 10;

/**
 * Fetch threads from inbox with pagination.
 * Fetches up to `maxThreads` threads (default 500), covering recent email.
 */
export async function fetchRecentThreads(
  gmail: gmail_v1.Gmail,
  maxThreads: number = 500
): Promise<ParsedThread[]> {
  // Step 1: Collect thread IDs with pagination
  const threadIds: string[] = [];
  let pageToken: string | undefined;

  while (threadIds.length < maxThreads) {
    const response = await gmail.users.threads.list({
      userId: "me",
      maxResults: Math.min(100, maxThreads - threadIds.length),
      q: "in:inbox newer_than:7d",
      pageToken,
    });

    const threads = response.data.threads || [];
    for (const t of threads) {
      if (t.id) threadIds.push(t.id);
    }

    pageToken = response.data.nextPageToken ?? undefined;
    if (!pageToken) break;
  }

  // Step 2: Fetch thread details in parallel (concurrency-limited)
  const parsedThreads: ParsedThread[] = [];

  for (let i = 0; i < threadIds.length; i += MAX_CONCURRENT) {
    const batch = threadIds.slice(i, i + MAX_CONCURRENT);
    const results = await Promise.allSettled(
      batch.map((id) => fetchThreadDetail(gmail, id))
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        parsedThreads.push(result.value);
      }
    }
  }

  return parsedThreads;
}

/**
 * Fetch a single thread with full message bodies.
 */
export async function fetchThreadDetail(
  gmail: gmail_v1.Gmail,
  threadId: string
): Promise<ParsedThread | null> {
  try {
    const threadDetail = await gmail.users.threads.get({
      userId: "me",
      id: threadId,
      format: "full",
    });

    const rawMessages = threadDetail.data.messages || [];
    if (rawMessages.length === 0) return null;

    const messages: ParsedMessage[] = [];
    let isMailingList = false;

    for (const msg of rawMessages) {
      const headers = msg.payload?.headers || [];
      const getHeader = (name: string) =>
        headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";

      // Check for mailing list headers on any message in the thread
      if (getHeader("List-Unsubscribe") || getHeader("List-Id")) {
        isMailingList = true;
      }

      const body = extractPlainTextBody(msg.payload);

      messages.push({
        messageId: msg.id || "",
        from: getHeader("From"),
        to: parseEmailList(getHeader("To")),
        cc: parseEmailList(getHeader("Cc")),
        receivedAt: new Date(parseInt(msg.internalDate || "0")),
        body,
      });
    }

    // Subject from the first message
    const firstHeaders = rawMessages[0].payload?.headers || [];
    const subject =
      firstHeaders.find((h) => h.name?.toLowerCase() === "subject")?.value || "(No Subject)";

    // Labels from the first message
    const labels = rawMessages[0].labelIds || [];

    return {
      threadId,
      subject,
      snippet: threadDetail.data.snippet || "",
      messages,
      labels,
      isMailingList,
    };
  } catch (error) {
    console.error(`Failed to fetch thread ${threadId}:`, error);
    return null;
  }
}

/**
 * Extract plaintext body from a Gmail message payload.
 * Walks the MIME tree to find text/plain parts.
 */
function extractPlainTextBody(
  payload: gmail_v1.Schema$MessagePart | undefined
): string {
  if (!payload) return "";

  // Single-part message
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  // Multipart message — recurse into parts
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
      // Recurse for nested multipart
      if (part.parts) {
        const nested = extractPlainTextBody(part);
        if (nested) return nested;
      }
    }
  }

  return "";
}

function decodeBase64Url(encoded: string): string {
  // Gmail uses URL-safe base64
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

function parseEmailList(emailString: string): string[] {
  if (!emailString) return [];
  return emailString.split(",").map((e) => {
    const match = e.match(/<([^>]+)>/);
    return match ? match[1].trim() : e.trim();
  });
}

export function extractEmailAddress(fromString: string): string {
  const match = fromString.match(/<([^>]+)>/);
  return match ? match[1] : fromString;
}

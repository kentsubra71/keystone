import OpenAI from "openai";
import type { DueFromMeType } from "@/types";
import type { ParsedThread } from "@/lib/google/gmail";
import { extractEmailAddress } from "@/lib/google/gmail";

export type ClassificationResult = {
  type: DueFromMeType | null;
  confidence: number;
  rationale: string;
  blockingWho: string | null;
  suggestedAction: string | null;
};

const SYSTEM_PROMPT = `You are an executive assistant analyzing email threads to determine if the user has an outstanding action item.

An item is "Due From Me" ONLY if:
- The user is the last required dependency, AND
- Someone else cannot proceed until the user acts

There are exactly 4 types of Due-From-Me items:

1. REPLY – someone explicitly requested a response from the user
2. APPROVAL – someone needs a yes/no or sign-off from the user
3. DECISION – someone needs the user to choose between options
4. FOLLOW_UP – the user themselves committed to an action (e.g., "I'll check", "I'll get back to you") and hasn't fulfilled it yet

Important rules:
- Only flag items where the USER specifically needs to act. If the request is to a group or someone else, it's NOT due from the user.
- For FOLLOW_UP: only flag if the USER (identified by their email) made the commitment, not someone else.
- Newsletters, automated notifications, marketing emails, and FYI-only messages are NEVER due-from-me items.
- If the user has already replied to the request in a later message in the thread, it is NOT due from them anymore.
- Be conservative: when in doubt, classify as null (not actionable). A false negative is better than a false positive.

Respond with JSON only:
{
  "isDueFromMe": boolean,
  "type": "reply" | "approval" | "decision" | "follow_up" | null,
  "confidence": number (0-100),
  "rationale": string (1-2 sentences explaining why),
  "blockingWho": string | null (name or email of who is waiting on the user),
  "suggestedAction": string | null (one sentence: what the user should do)
}`;

function formatThreadForLLM(thread: ParsedThread, userEmail: string): string {
  const lines: string[] = [];
  lines.push(`Subject: ${thread.subject}`);
  lines.push(`User's email: ${userEmail}`);
  lines.push(`Thread has ${thread.messages.length} message(s).`);
  lines.push("");

  for (let i = 0; i < thread.messages.length; i++) {
    const msg = thread.messages[i];
    const fromAddr = extractEmailAddress(msg.from);
    const isUser = fromAddr.toLowerCase() === userEmail.toLowerCase();
    lines.push(`--- Message ${i + 1} ${isUser ? "(FROM USER)" : ""} ---`);
    lines.push(`From: ${msg.from}`);
    lines.push(`To: ${msg.to.join(", ")}`);
    if (msg.cc.length > 0) lines.push(`CC: ${msg.cc.join(", ")}`);
    lines.push(`Date: ${msg.receivedAt.toISOString()}`);
    // Truncate very long bodies to stay within token limits
    const body = msg.body.length > 2000 ? msg.body.substring(0, 2000) + "\n[...truncated]" : msg.body;
    lines.push(`Body:\n${body}`);
    lines.push("");
  }

  return lines.join("\n");
}

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

/**
 * Classify an email thread using GPT-4o-mini.
 */
export async function classifyThread(
  thread: ParsedThread,
  userEmail: string
): Promise<ClassificationResult> {
  try {
    const client = getOpenAIClient();
    const threadText = formatThreadForLLM(thread, userEmail);

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: threadText },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 300,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { type: null, confidence: 0, rationale: "Empty LLM response", blockingWho: null, suggestedAction: null };
    }

    const parsed = JSON.parse(content);

    if (!parsed.isDueFromMe || !parsed.type) {
      return {
        type: null,
        confidence: parsed.confidence ?? 0,
        rationale: parsed.rationale ?? "Not a Due-From-Me item",
        blockingWho: null,
        suggestedAction: null,
      };
    }

    return {
      type: parsed.type as DueFromMeType,
      confidence: Math.min(100, Math.max(0, parsed.confidence ?? 50)),
      rationale: parsed.rationale ?? "Classified by AI",
      blockingWho: parsed.blockingWho ?? null,
      suggestedAction: parsed.suggestedAction ?? getSuggestedAction(parsed.type),
    };
  } catch (error) {
    console.error(`LLM classification failed for thread ${thread.threadId}:`, error);
    // Fall back to basic heuristic on API failure
    return classifyThreadFallback(thread, userEmail);
  }
}

/**
 * Batch classify multiple threads. Runs concurrently with a limit.
 */
export async function classifyThreads(
  threads: ParsedThread[],
  userEmail: string,
  concurrency: number = 10
): Promise<Map<string, ClassificationResult>> {
  const results = new Map<string, ClassificationResult>();

  for (let i = 0; i < threads.length; i += concurrency) {
    const batch = threads.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(async (thread) => {
        const result = await classifyThread(thread, userEmail);
        return { threadId: thread.threadId, result };
      })
    );

    for (const r of batchResults) {
      if (r.status === "fulfilled") {
        results.set(r.value.threadId, r.value.result);
      }
    }
  }

  return results;
}

/**
 * Minimal fallback classifier if the OpenAI API is unavailable.
 * Much less accurate than the LLM but ensures the system doesn't fully break.
 */
function classifyThreadFallback(
  thread: ParsedThread,
  userEmail: string
): ClassificationResult {
  const lastMsg = thread.messages[thread.messages.length - 1];
  if (!lastMsg) {
    return { type: null, confidence: 0, rationale: "No messages in thread", blockingWho: null, suggestedAction: null };
  }

  // Don't flag if the user sent the last message (they already responded)
  const lastFrom = extractEmailAddress(lastMsg.from).toLowerCase();
  if (lastFrom === userEmail.toLowerCase()) {
    return { type: null, confidence: 0, rationale: "User sent the last message", blockingWho: null, suggestedAction: null };
  }

  const text = `${thread.subject} ${lastMsg.body}`.toLowerCase();

  if (/please\s+approve|need(s?)?\s+(your\s+)?approval|sign[\s-]?off|for\s+(your\s+)?approval/.test(text)) {
    return {
      type: "approval",
      confidence: 60,
      rationale: "Fallback: detected approval language (LLM unavailable)",
      blockingWho: lastMsg.from,
      suggestedAction: "Review and approve/reject",
    };
  }

  if (/please\s+(decide|choose)|which\s+option|need\s+(your\s+)?(decision|input)/.test(text)) {
    return {
      type: "decision",
      confidence: 55,
      rationale: "Fallback: detected decision language (LLM unavailable)",
      blockingWho: lastMsg.from,
      suggestedAction: "Make a decision",
    };
  }

  if (/please\s+(reply|respond)|waiting\s+(for|on)\s+(your|a)\s+(reply|response)|could\s+you\s+(please\s+)?(confirm|clarify)/.test(text)) {
    return {
      type: "reply",
      confidence: 50,
      rationale: "Fallback: detected reply request (LLM unavailable)",
      blockingWho: lastMsg.from,
      suggestedAction: "Send a response",
    };
  }

  return { type: null, confidence: 0, rationale: "No Due-From-Me indicators detected", blockingWho: null, suggestedAction: null };
}

export function getSuggestedAction(type: DueFromMeType): string {
  switch (type) {
    case "reply":
      return "Send a response";
    case "approval":
      return "Review and approve/reject";
    case "decision":
      return "Make a decision";
    case "follow_up":
      return "Complete your commitment";
  }
}

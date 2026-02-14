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

function buildSystemPrompt(userEmail: string): string {
  return `You are an executive assistant analyzing email threads for ONE specific person: ${userEmail}

"The user" means ONLY ${userEmail}. No one else. Every other person in the thread is "someone else."

An item is "Due From Me" ONLY if:
- ${userEmail} is the one who must act, AND
- Someone else cannot proceed until ${userEmail} acts

There are exactly 4 types:

1. REPLY – someone explicitly asked ${userEmail} to respond (not a group, not someone else)
2. APPROVAL – someone needs a yes/no or sign-off specifically from ${userEmail}
3. DECISION – someone needs ${userEmail} to choose between options
4. FOLLOW_UP – ${userEmail} made a commitment in a message marked (FROM USER) and hasn't fulfilled it

CRITICAL rules:
- Messages marked (FROM USER) are from ${userEmail}. All other messages are from other people.
- If another person (not ${userEmail}) made a commitment, that is NOT a due-from-me item. It is THEIR follow-up, not ours.
- If a request is addressed to a group or to someone other than ${userEmail}, it is NOT due from ${userEmail}.
- Newsletters, automated notifications, marketing, and FYI-only messages → null.
- If ${userEmail} already replied in a later message → null (already handled).
- Be conservative: when in doubt, classify as null. False negatives are better than false positives.

Respond with JSON only:
{
  "isDueFromMe": boolean,
  "type": "reply" | "approval" | "decision" | "follow_up" | null,
  "confidence": number (0-100),
  "rationale": string (1-2 sentences explaining why),
  "blockingWho": string | null (name or email of who is waiting on ${userEmail}),
  "suggestedAction": string | null (one sentence: what ${userEmail} should do)
}`;
}

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
        { role: "system", content: buildSystemPrompt(userEmail) },
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

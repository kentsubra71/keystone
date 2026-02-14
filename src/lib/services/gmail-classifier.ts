import type { DueFromMeType } from "@/types";
import type { ParsedEmail } from "@/lib/google/gmail";

export type ClassificationResult = {
  type: DueFromMeType | null;
  confidence: number;
  rationale: string;
};

// Patterns for detecting Due-From-Me items
const REPLY_PATTERNS = [
  /please\s+(reply|respond|get back)/i,
  /let\s+me\s+know/i,
  /could\s+you\s+(please\s+)?(confirm|clarify)/i,
  /waiting\s+(for|on)\s+(your|a)\s+(reply|response)/i,
  /\?\s*$/,
  /can\s+you\s+(please\s+)?/i,
  /would\s+you\s+(please\s+)?/i,
  /please\s+(share|send|provide|update)/i,
  /kindly\s+/i,
  /request\s+you\s+to/i,
  /by\s+(today|tomorrow|eod|end\s+of\s+day|cob|close\s+of\s+business)/i,
  /urgent(ly)?/i,
  /asap/i,
];

const APPROVAL_PATTERNS = [
  /please\s+approve/i,
  /need(s?)?\s+(your\s+)?approval/i,
  /waiting\s+(for|on)\s+(your\s+)?approval/i,
  /sign[\s-]?off/i,
  /please\s+(review|sign)/i,
  /for\s+(your\s+)?approval/i,
  /approve\s+this/i,
  /pending\s+(your\s+)?approval/i,
];

const DECISION_PATTERNS = [
  /which\s+option/i,
  /please\s+(decide|choose)/i,
  /option\s+(a|1|one)\s+or\s+(b|2|two)/i,
  /what\s+(do\s+you|would\s+you)\s+(think|prefer|suggest)/i,
  /need\s+(your\s+)?(decision|input)/i,
  /either\s+.+\s+or\s+/i,
];

const FOLLOW_UP_PATTERNS = [
  /i('ll|\s+will)\s+(check|look|get\s+back|follow\s+up)/i,
  /let\s+me\s+(check|look|get\s+back)/i,
  /will\s+revert/i,
  /i('ll|\s+will)\s+send/i,
  /get\s+back\s+to\s+you/i,
];

function matchPatterns(
  text: string,
  patterns: RegExp[]
): { matched: boolean; matchedPattern: string } {
  for (const pattern of patterns) {
    if (pattern.test(text)) {
      return { matched: true, matchedPattern: pattern.source };
    }
  }
  return { matched: false, matchedPattern: "" };
}

export function classifyEmail(email: ParsedEmail): ClassificationResult {
  const textToAnalyze = `${email.subject} ${email.snippet}`.toLowerCase();

  // Check for approval (highest priority)
  const approval = matchPatterns(textToAnalyze, APPROVAL_PATTERNS);
  if (approval.matched) {
    return {
      type: "approval",
      confidence: 85,
      rationale: `Flagged as approval request: contains pattern indicating sign-off is needed`,
    };
  }

  // Check for decision
  const decision = matchPatterns(textToAnalyze, DECISION_PATTERNS);
  if (decision.matched) {
    return {
      type: "decision",
      confidence: 80,
      rationale: `Flagged as decision needed: contains pattern indicating choice is required`,
    };
  }

  // Check for follow-up (user's own commitment)
  const followUp = matchPatterns(textToAnalyze, FOLLOW_UP_PATTERNS);
  if (followUp.matched) {
    return {
      type: "follow_up",
      confidence: 75,
      rationale: `Flagged as follow-up: you committed to an action in this thread`,
    };
  }

  // Check for reply
  const reply = matchPatterns(textToAnalyze, REPLY_PATTERNS);
  if (reply.matched) {
    return {
      type: "reply",
      confidence: 70,
      rationale: `Flagged as reply needed: explicit response appears to be requested`,
    };
  }

  // No match
  return {
    type: null,
    confidence: 0,
    rationale: "No Due-From-Me indicators detected",
  };
}

export function getBlockingPerson(email: ParsedEmail): string | null {
  // The sender is typically the person being blocked
  return email.from || null;
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

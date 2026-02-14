import { db } from "@/lib/db";
import { gmailThreads, dueFromMeItems } from "@/lib/db/schema";
import { getGmailClient, fetchRecentThreads, extractEmailAddress } from "@/lib/google/gmail";
import type { ParsedThread } from "@/lib/google/gmail";
import { classifyThreads, getSuggestedAction } from "./gmail-classifier";
import { eq, inArray } from "drizzle-orm";

export type GmailSyncResult = {
  success: boolean;
  threadsFetched: number;
  threadsProcessed: number;
  threadsSkipped: number;
  dueItemsCreated: number;
  dueItemsUpdated: number;
  errors: string[];
};

/**
 * Filter out threads that shouldn't be classified:
 * - Mailing lists (detected by List-Unsubscribe / List-Id headers)
 * - Promotional / forum categories
 * - Threads where user is not in TO (only CC'd)
 */
function shouldProcessThread(thread: ParsedThread, userEmail: string): boolean {
  // Skip mailing list threads (detected by RFC 2369 headers)
  if (thread.isMailingList) return false;

  // Skip promotional and forum categories
  const skipLabels = ["CATEGORY_PROMOTIONS", "CATEGORY_FORUMS", "CATEGORY_UPDATES", "SPAM", "TRASH"];
  if (thread.labels.some((l) => skipLabels.includes(l))) return false;

  // Require user to be in TO of at least one message in the thread
  const userLower = userEmail.toLowerCase();
  const userIsInTo = thread.messages.some((msg) =>
    msg.to.some((addr) => addr.toLowerCase() === userLower)
  );
  if (!userIsInTo) return false;

  return true;
}

export async function syncGmailThreads(
  accessToken: string,
  userEmail: string
): Promise<GmailSyncResult> {
  const result: GmailSyncResult = {
    success: false,
    threadsFetched: 0,
    threadsProcessed: 0,
    threadsSkipped: 0,
    dueItemsCreated: 0,
    dueItemsUpdated: 0,
    errors: [],
  };

  try {
    const gmail = getGmailClient(accessToken);
    const allThreads = await fetchRecentThreads(gmail, 500);
    result.threadsFetched = allThreads.length;

    // Filter to actionable threads
    const threadsToProcess = allThreads.filter((t) => shouldProcessThread(t, userEmail));
    result.threadsSkipped = allThreads.length - threadsToProcess.length;

    if (threadsToProcess.length === 0) {
      result.success = true;
      return result;
    }

    // Batch lookup: which threads already exist in DB?
    const threadIds = threadsToProcess.map((t) => t.threadId);
    const existingThreadRows = await db
      .select({ threadId: gmailThreads.threadId })
      .from(gmailThreads)
      .where(inArray(gmailThreads.threadId, threadIds));
    const existingThreadSet = new Set(existingThreadRows.map((r) => r.threadId));

    // Batch lookup: which due-from-me items exist and what's their status?
    const existingDueItems = await db
      .select({
        sourceId: dueFromMeItems.sourceId,
        status: dueFromMeItems.status,
        id: dueFromMeItems.id,
      })
      .from(dueFromMeItems)
      .where(inArray(dueFromMeItems.sourceId, threadIds));
    const dueItemMap = new Map(existingDueItems.map((r) => [r.sourceId, r]));

    // Don't reclassify threads the user already acted on
    const actedOnSourceIds = new Set(
      existingDueItems
        .filter((r) => r.status === "done" || r.status === "deferred")
        .map((r) => r.sourceId)
    );

    const threadsNeedingClassification = threadsToProcess.filter(
      (t) => !actedOnSourceIds.has(t.threadId)
    );

    // Classify all threads via GPT-4o-mini (batched, concurrent)
    const classifications = await classifyThreads(threadsNeedingClassification, userEmail);
    result.threadsProcessed = threadsNeedingClassification.length;

    const now = new Date();

    // Process each classified thread
    for (const thread of threadsNeedingClassification) {
      const classification = classifications.get(thread.threadId);
      if (!classification) continue;

      try {
        // Get the first message's sender info for the thread record
        const firstMsg = thread.messages[0];
        const lastMsg = thread.messages[thread.messages.length - 1];

        // Upsert gmailThreads record
        if (existingThreadSet.has(thread.threadId)) {
          await db
            .update(gmailThreads)
            .set({
              subject: thread.subject,
              snippet: thread.snippet,
              fromAddress: lastMsg?.from || "",
              toAddresses: lastMsg?.to || [],
              ccAddresses: lastMsg?.cc || [],
              receivedAt: lastMsg?.receivedAt || now,
              labels: thread.labels,
              dueFromMeType: classification.type,
              confidenceScore: classification.confidence,
              rationale: classification.rationale,
              isProcessed: true,
              updatedAt: now,
            })
            .where(eq(gmailThreads.threadId, thread.threadId));
        } else {
          await db.insert(gmailThreads).values({
            threadId: thread.threadId,
            messageId: lastMsg?.messageId || "",
            subject: thread.subject,
            snippet: thread.snippet,
            fromAddress: lastMsg?.from || "",
            toAddresses: lastMsg?.to || [],
            ccAddresses: lastMsg?.cc || [],
            receivedAt: lastMsg?.receivedAt || now,
            labels: thread.labels,
            dueFromMeType: classification.type,
            confidenceScore: classification.confidence,
            rationale: classification.rationale,
            isProcessed: true,
          });
        }

        // If classified as Due-From-Me, create/update a DueFromMeItem
        if (classification.type) {
          const existingDue = dueItemMap.get(thread.threadId);
          // Aging = time since the last INBOUND message (the triggering request),
          // NOT the first message in the thread (which could be years old if someone
          // revives an old conversation).
          const userLowerForAging = userEmail.toLowerCase();
          const lastInboundMsg = [...thread.messages].reverse().find((msg) => {
            const fromAddr = extractEmailAddress(msg.from).toLowerCase();
            return fromAddr !== userLowerForAging;
          });
          const requestDate = lastInboundMsg?.receivedAt || lastMsg?.receivedAt || now;
          const agingDays = Math.floor(
            (now.getTime() - requestDate.getTime()) / (1000 * 60 * 60 * 24)
          );

          if (!existingDue) {
            await db.insert(dueFromMeItems).values({
              type: classification.type,
              status: "not_started",
              title: thread.subject,
              source: "gmail",
              sourceId: thread.threadId,
              blockingWho: classification.blockingWho || (lastMsg ? extractEmailAddress(lastMsg.from) : null),
              ownerEmail: userEmail, // The user owns the action, not the sender
              agingDays,
              daysInCurrentStatus: 0,
              firstSeenAt: requestDate,
              lastSeenAt: now,
              statusChangedAt: now,
              confidenceScore: classification.confidence,
              rationale: classification.rationale,
              suggestedAction: classification.suggestedAction || getSuggestedAction(classification.type),
            });
            result.dueItemsCreated++;
          } else {
            // Update existing item (don't change status — user may have set it)
            await db
              .update(dueFromMeItems)
              .set({
                agingDays,
                lastSeenAt: now,
                confidenceScore: classification.confidence,
                rationale: classification.rationale,
                blockingWho: classification.blockingWho || undefined,
                suggestedAction: classification.suggestedAction || undefined,
                updatedAt: now,
              })
              .where(eq(dueFromMeItems.id, existingDue.id));
            result.dueItemsUpdated++;
          }
        }
      } catch (threadError) {
        const msg = threadError instanceof Error ? threadError.message : String(threadError);
        console.error(`Failed to process thread ${thread.threadId}:`, msg);
        result.errors.push(`Thread ${thread.threadId}: ${msg}`);
      }
    }

    result.success = true;
  } catch (error) {
    console.error("Gmail sync error:", error);
    result.errors.push(error instanceof Error ? error.message : "Unknown error");
  }

  return result;
}

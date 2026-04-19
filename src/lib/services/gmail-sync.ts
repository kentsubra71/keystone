import { db } from "@/lib/db";
import { gmailThreads, dueFromMeItems } from "@/lib/db/schema";
import { getGmailClient, fetchRecentThreads, extractEmailAddress } from "@/lib/google/gmail";
import type { ParsedThread } from "@/lib/google/gmail";
import { classifyThreads, getSuggestedAction } from "./gmail-classifier";
import { resurfaceItem } from "./resurface";
import { logError } from "@/lib/logger";
import { eq, inArray } from "drizzle-orm";

export type GmailSyncResult = {
  success: boolean;
  threadsFetched: number;
  threadsProcessed: number;
  threadsSkipped: number;
  dueItemsCreated: number;
  dueItemsUpdated: number;
  dueItemsResurfaced: number;
  errors: string[];
};

function shouldProcessThread(thread: ParsedThread, userEmail: string): boolean {
  if (thread.isMailingList) return false;
  const skipLabels = ["CATEGORY_PROMOTIONS", "CATEGORY_FORUMS", "CATEGORY_UPDATES", "SPAM", "TRASH"];
  if (thread.labels.some((l) => skipLabels.includes(l))) return false;
  const userLower = userEmail.toLowerCase();
  const userIsInTo = thread.messages.some((msg) =>
    msg.to.some((addr) => addr.toLowerCase() === userLower)
  );
  return userIsInTo;
}

function latestInboundMessage(thread: ParsedThread, userEmail: string) {
  const userLower = userEmail.toLowerCase();
  return [...thread.messages].reverse().find((m) =>
    extractEmailAddress(m.from).toLowerCase() !== userLower
  );
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
    dueItemsResurfaced: 0,
    errors: [],
  };

  try {
    const gmail = getGmailClient(accessToken);
    const allThreads = await fetchRecentThreads(gmail, 500);
    result.threadsFetched = allThreads.length;

    const threadsToProcess = allThreads.filter((t) => shouldProcessThread(t, userEmail));
    result.threadsSkipped = allThreads.length - threadsToProcess.length;

    if (threadsToProcess.length === 0) {
      result.success = true;
      return result;
    }

    const threadIds = threadsToProcess.map((t) => t.threadId);
    const existingThreadRows = await db
      .select({ threadId: gmailThreads.threadId })
      .from(gmailThreads)
      .where(inArray(gmailThreads.threadId, threadIds));
    const existingThreadSet = new Set(existingThreadRows.map((r) => r.threadId));

    const existingDueItems = await db
      .select({
        sourceId: dueFromMeItems.sourceId,
        status: dueFromMeItems.status,
        id: dueFromMeItems.id,
        statusChangedAt: dueFromMeItems.statusChangedAt,
      })
      .from(dueFromMeItems)
      .where(inArray(dueFromMeItems.sourceId, threadIds));
    const dueItemMap = new Map(existingDueItems.map((r) => [r.sourceId, r]));

    // Split: (a) threads with no prior action, (b) done/deferred threads with new inbound after statusChangedAt.
    // Skip: done/deferred threads where no inbound message is newer than statusChangedAt.
    const threadsNeedingClassification: ParsedThread[] = [];
    for (const thread of threadsToProcess) {
      const existing = dueItemMap.get(thread.threadId);
      const wasActedOn = existing && (existing.status === "done" || existing.status === "deferred");
      if (!wasActedOn) {
        threadsNeedingClassification.push(thread);
        continue;
      }
      const latest = latestInboundMessage(thread, userEmail);
      if (!latest) continue; // no inbound at all — nothing to revive on
      if (latest.receivedAt > existing.statusChangedAt) {
        threadsNeedingClassification.push(thread);
      }
      // else: acted-on thread with no new inbound since action — skip.
    }

    const classifications = threadsNeedingClassification.length > 0
      ? await classifyThreads(threadsNeedingClassification, userEmail)
      : new Map();
    result.threadsProcessed = threadsNeedingClassification.length;

    const now = new Date();

    for (const thread of threadsNeedingClassification) {
      const classification = classifications.get(thread.threadId);
      if (!classification) continue;

      try {
        const lastMsg = thread.messages[thread.messages.length - 1];

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

        if (!classification.type) continue; // ack/FYI case — no DFM item action

        const existing = dueItemMap.get(thread.threadId);
        const latest = latestInboundMessage(thread, userEmail);
        const requestDate = latest?.receivedAt || lastMsg?.receivedAt || now;

        if (!existing) {
          // Brand new
          const agingDays = Math.floor((now.getTime() - requestDate.getTime()) / (1000 * 60 * 60 * 24));
          await db.insert(dueFromMeItems).values({
            type: classification.type,
            status: "not_started",
            title: thread.subject,
            source: "gmail",
            sourceId: thread.threadId,
            blockingWho: classification.blockingWho || (lastMsg ? extractEmailAddress(lastMsg.from) : null),
            ownerEmail: userEmail,
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
        } else if (existing.status === "done" || existing.status === "deferred") {
          // Resurface
          await resurfaceItem(existing.id, {
            type: classification.type,
            confidence: classification.confidence,
            rationale: classification.rationale,
            suggestedAction: classification.suggestedAction || getSuggestedAction(classification.type),
            blockingWho: classification.blockingWho || (lastMsg ? extractEmailAddress(lastMsg.from) : null),
          }, requestDate);
          result.dueItemsResurfaced++;
        } else {
          // In-flight update
          const agingDays = Math.floor((now.getTime() - requestDate.getTime()) / (1000 * 60 * 60 * 24));
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
            .where(eq(dueFromMeItems.id, existing.id));
          result.dueItemsUpdated++;
        }
      } catch (threadError) {
        const msg = threadError instanceof Error ? threadError.message : String(threadError);
        logError("thread_process_failed", threadError, { threadId: thread.threadId });
        result.errors.push(`Thread ${thread.threadId}: ${msg}`);
      }
    }

    result.success = true;
  } catch (error) {
    logError("gmail_sync_failed", error);
    result.errors.push(error instanceof Error ? error.message : "Unknown error");
  }

  return result;
}

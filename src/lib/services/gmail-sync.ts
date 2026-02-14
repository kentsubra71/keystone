import { db } from "@/lib/db";
import { gmailThreads, dueFromMeItems } from "@/lib/db/schema";
import { getGmailClient, fetchRecentThreads, extractEmailAddress } from "@/lib/google/gmail";
import {
  classifyEmail,
  getBlockingPerson,
  getSuggestedAction,
} from "./gmail-classifier";
import { eq } from "drizzle-orm";

export type GmailSyncResult = {
  success: boolean;
  threadsProcessed: number;
  dueItemsCreated: number;
  errors: string[];
};

// Mailing list patterns to ignore (emails to these are not "due from you")
const MAILING_LIST_PATTERNS = [
  /all@/i,
  /everyone@/i,
  /team@/i,
  /group@/i,
  /staff@/i,
  /company@/i,
  /-all@/i,
  /hurixall/i,
];

function isMailingListEmail(toAddresses: string[]): boolean {
  return toAddresses.some((addr) =>
    MAILING_LIST_PATTERNS.some((pattern) => pattern.test(addr))
  );
}

function isUserDirectlyAddressed(toAddresses: string[], userEmail: string): boolean {
  const userEmailLower = userEmail.toLowerCase();
  return toAddresses.some((addr) => addr.toLowerCase().includes(userEmailLower));
}

export async function syncGmailThreads(
  accessToken: string,
  userEmail?: string
): Promise<GmailSyncResult> {
  const result: GmailSyncResult = {
    success: false,
    threadsProcessed: 0,
    dueItemsCreated: 0,
    skippedMailingList: 0,
    errors: [],
  } as GmailSyncResult & { skippedMailingList: number };

  try {
    const gmail = getGmailClient(accessToken);
    const threads = await fetchRecentThreads(gmail, 50);

    const now = new Date();

    for (const thread of threads) {
      try {
        // Skip mailing list emails - they're not directly "due from you"
        if (isMailingListEmail(thread.to)) {
          (result as any).skippedMailingList++;
          continue;
        }

        // Optionally: only process if user is directly in TO (not just CC)
        // if (userEmail && !isUserDirectlyAddressed(thread.to, userEmail)) {
        //   continue;
        // }

        // Check if we already have this thread
        const existing = await db
          .select()
          .from(gmailThreads)
          .where(eq(gmailThreads.threadId, thread.threadId))
          .limit(1);

        // Classify the email
        const classification = classifyEmail(thread);

        if (existing.length > 0) {
          // Update existing thread
          await db
            .update(gmailThreads)
            .set({
              subject: thread.subject,
              snippet: thread.snippet,
              fromAddress: thread.from,
              toAddresses: thread.to,
              ccAddresses: thread.cc,
              receivedAt: thread.receivedAt,
              labels: thread.labels,
              dueFromMeType: classification.type,
              confidenceScore: classification.confidence,
              rationale: classification.rationale,
              isProcessed: true,
              updatedAt: now,
            })
            .where(eq(gmailThreads.threadId, thread.threadId));
        } else {
          // Insert new thread
          await db.insert(gmailThreads).values({
            threadId: thread.threadId,
            messageId: thread.messageId,
            subject: thread.subject,
            snippet: thread.snippet,
            fromAddress: thread.from,
            toAddresses: thread.to,
            ccAddresses: thread.cc,
            receivedAt: thread.receivedAt,
            labels: thread.labels,
            dueFromMeType: classification.type,
            confidenceScore: classification.confidence,
            rationale: classification.rationale,
            isProcessed: true,
          });
        }

        result.threadsProcessed++;

        // If classified as Due-From-Me, create/update a DueFromMeItem
        if (classification.type) {
          const existingItem = await db
            .select()
            .from(dueFromMeItems)
            .where(eq(dueFromMeItems.sourceId, thread.threadId))
            .limit(1);

          const agingDays = Math.floor(
            (now.getTime() - thread.receivedAt.getTime()) /
              (1000 * 60 * 60 * 24)
          );

          if (existingItem.length === 0) {
            await db.insert(dueFromMeItems).values({
              type: classification.type,
              status: "not_started",
              title: thread.subject,
              source: "gmail",
              sourceId: thread.threadId,
              blockingWho: getBlockingPerson(thread),
              ownerEmail: extractEmailAddress(thread.from),
              agingDays,
              daysInCurrentStatus: 0,
              firstSeenAt: now,
              lastSeenAt: now,
              statusChangedAt: now,
              confidenceScore: classification.confidence,
              rationale: classification.rationale,
              suggestedAction: getSuggestedAction(classification.type),
            });

            result.dueItemsCreated++;
          } else {
            // Update aging
            await db
              .update(dueFromMeItems)
              .set({
                agingDays,
                lastSeenAt: now,
                confidenceScore: classification.confidence,
                rationale: classification.rationale,
                updatedAt: now,
              })
              .where(eq(dueFromMeItems.sourceId, thread.threadId));
          }
        }
      } catch (threadError) {
        console.error(`Failed to process thread ${thread.threadId}:`, threadError);
        result.errors.push(`Thread ${thread.threadId}: ${threadError}`);
      }
    }

    result.success = true;
  } catch (error) {
    console.error("Gmail sync error:", error);
    result.errors.push(error instanceof Error ? error.message : "Unknown error");
  }

  return result;
}

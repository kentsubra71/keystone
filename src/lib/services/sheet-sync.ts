import { db } from "@/lib/db";
import { sheetItems, ownerDirectory } from "@/lib/db/schema";
import {
  fetchSheetData,
  normalizeStatus,
  parseDueDate,
  getGoogleSheetsClientWithServiceAccount,
  DEFAULT_SHEET_CONFIG,
  type SheetConfig,
} from "@/lib/google/sheets";
import { eq, and, inArray, sql } from "drizzle-orm";

export type SyncResult = {
  success: boolean;
  added: number;
  updated: number;
  unchanged: number;
  errors: string[];
};

export async function syncSheetItems(
  accessToken?: string,
  config: SheetConfig = DEFAULT_SHEET_CONFIG
): Promise<SyncResult> {
  const result: SyncResult = {
    success: false,
    added: 0,
    updated: 0,
    unchanged: 0,
    errors: [],
  };

  try {
    // Get sheets client (prefer service account for background sync)
    const sheets = getGoogleSheetsClientWithServiceAccount();

    if (!sheets) {
      result.errors.push("No Google Sheets credentials configured");
      return result;
    }

    if (!config.spreadsheetId) {
      result.errors.push("No spreadsheet ID configured");
      return result;
    }

    // Fetch sheet data
    const { rows, fingerprints } = await fetchSheetData(sheets, config);

    // Get owner directory for mapping
    const owners = await db.select().from(ownerDirectory);
    const ownerMap = new Map(
      owners.map((o) => [o.displayName.toLowerCase(), o.email])
    );

    // Get existing items by fingerprint
    const existingItems = await db.select().from(sheetItems);
    const existingByFingerprint = new Map(
      existingItems.map((item) => [item.sourceRowFingerprint, item])
    );

    const now = new Date();
    const seenFingerprints = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const fingerprint = fingerprints[i];
      seenFingerprints.add(fingerprint);

      const existing = existingByFingerprint.get(fingerprint);

      // Map owner label to email
      const ownerLabel = row.owner;
      const ownerEmail = ownerLabel
        ? ownerMap.get(ownerLabel.toLowerCase()) ?? null
        : null;
      const needsOwnerMapping = !!ownerLabel && !ownerEmail;

      // Normalize status
      const { status, needsReview } = normalizeStatus(row.status);

      // Parse due date
      const dueDate = parseDueDate(row.dueDate);

      // Check if overdue or at risk
      const isOverdue = dueDate ? dueDate < now : false;
      const isAtRisk =
        dueDate && !isOverdue
          ? dueDate.getTime() - now.getTime() < 3 * 24 * 60 * 60 * 1000 // 3 days
          : false;

      if (existing) {
        // Update existing item
        await db
          .update(sheetItems)
          .set({
            commitment: row.commitment,
            ownerLabel,
            ownerEmail,
            dueDate,
            status: status as any,
            rawStatus: row.status,
            comments: row.comments,
            lastSeenAt: now,
            lastSyncedAt: now,
            needsOwnerMapping,
            isOverdue,
            isAtRisk,
            updatedAt: now,
          })
          .where(eq(sheetItems.id, existing.id));

        result.updated++;
      } else {
        // Add new item
        await db.insert(sheetItems).values({
          commitment: row.commitment,
          ownerLabel,
          ownerEmail,
          dueDate,
          status: status as any,
          rawStatus: row.status,
          comments: row.comments,
          sourceRowFingerprint: fingerprint,
          firstSeenAt: now,
          lastSeenAt: now,
          lastSyncedAt: now,
          needsOwnerMapping,
          isOverdue,
          isAtRisk,
        });

        result.added++;
      }
    }

    // Mark items that disappeared from the sheet (optional: we keep them but stop updating lastSeenAt)
    result.unchanged = existingItems.filter(
      (item) =>
        !seenFingerprints.has(item.sourceRowFingerprint) &&
        item.status !== "done"
    ).length;

    result.success = true;
  } catch (error) {
    console.error("Sheet sync error:", error);
    result.errors.push(
      error instanceof Error ? error.message : "Unknown error"
    );
  }

  return result;
}

export async function getSheetItems(options?: {
  status?: string;
  needsOwnerMapping?: boolean;
  isOverdue?: boolean;
  ownerEmail?: string | null;
}) {
  let query = db.select().from(sheetItems);

  // Apply filters using where clauses
  const conditions = [];

  if (options?.status) {
    conditions.push(eq(sheetItems.status, options.status as any));
  }

  if (options?.needsOwnerMapping !== undefined) {
    conditions.push(eq(sheetItems.needsOwnerMapping, options.needsOwnerMapping));
  }

  if (options?.isOverdue !== undefined) {
    conditions.push(eq(sheetItems.isOverdue, options.isOverdue));
  }

  if (options?.ownerEmail !== undefined) {
    if (options.ownerEmail === null) {
      conditions.push(sql`${sheetItems.ownerEmail} IS NULL`);
    } else {
      conditions.push(eq(sheetItems.ownerEmail, options.ownerEmail));
    }
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return query;
}

export async function getWaitingOnOthers(userEmail: string) {
  // Items where the owner is not the user and status is not done
  return db
    .select()
    .from(sheetItems)
    .where(
      and(
        sql`${sheetItems.ownerEmail} IS NOT NULL`,
        sql`${sheetItems.ownerEmail} != ${userEmail}`,
        sql`${sheetItems.status} != 'done'`
      )
    );
}

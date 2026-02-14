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
import { eq, and, sql } from "drizzle-orm";

export type SyncResult = {
  success: boolean;
  added: number;
  updated: number;
  unchanged: number;
  disappeared: number;
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
    disappeared: 0,
    errors: [],
  };

  try {
    const sheets = getGoogleSheetsClientWithServiceAccount();

    if (!sheets) {
      result.errors.push("No Google Sheets credentials configured");
      return result;
    }

    if (!config.spreadsheetId) {
      result.errors.push("No spreadsheet ID configured");
      return result;
    }

    // Fetch sheet data (now returns row numbers as stable identifiers)
    const fetchedRows = await fetchSheetData(sheets, config);

    // Get owner directory for mapping
    const owners = await db.select().from(ownerDirectory);
    const ownerMap = new Map(
      owners.map((o) => [o.displayName.toLowerCase(), o.email])
    );

    // Get ALL existing items, keyed by row number for fast lookup
    const existingItems = await db.select().from(sheetItems);
    const existingByRowNumber = new Map(
      existingItems
        .filter((item) => item.sourceRowNumber != null)
        .map((item) => [item.sourceRowNumber!, item])
    );
    // Fallback: also index by fingerprint for items that predate the rowNumber migration
    const existingByFingerprint = new Map(
      existingItems
        .filter((item) => item.sourceRowNumber == null)
        .map((item) => [item.sourceRowFingerprint, item])
    );

    const now = new Date();
    const seenRowNumbers = new Set<number>();

    for (const fetched of fetchedRows) {
      const { row, fingerprint, rowNumber } = fetched;
      seenRowNumbers.add(rowNumber);

      // Look up existing item by row number first, then fallback to fingerprint
      const existing =
        existingByRowNumber.get(rowNumber) ||
        existingByFingerprint.get(fingerprint);

      // Map owner label to email
      const ownerLabel = row.owner;
      const ownerEmail = ownerLabel
        ? ownerMap.get(ownerLabel.toLowerCase()) ?? null
        : null;
      const needsOwnerMapping = !!ownerLabel && !ownerEmail;

      // Normalize status
      const { status } = normalizeStatus(row.status);

      // Parse due date
      const dueDate = parseDueDate(row.dueDate);

      if (existing) {
        // Check if anything actually changed
        if (
          existing.sourceRowFingerprint === fingerprint &&
          existing.sourceRowNumber === rowNumber
        ) {
          result.unchanged++;
          // Still update lastSeenAt to show the item is alive
          await db
            .update(sheetItems)
            .set({ lastSeenAt: now, lastSyncedAt: now })
            .where(eq(sheetItems.id, existing.id));
          continue;
        }

        // Data changed — update the existing record (not create a duplicate)
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
            sourceRowNumber: rowNumber,
            sourceRowFingerprint: fingerprint,
            lastSeenAt: now,
            lastSyncedAt: now,
            needsOwnerMapping,
            updatedAt: now,
          })
          .where(eq(sheetItems.id, existing.id));

        result.updated++;
      } else {
        // New item
        await db.insert(sheetItems).values({
          commitment: row.commitment,
          ownerLabel,
          ownerEmail,
          dueDate,
          status: status as any,
          rawStatus: row.status,
          comments: row.comments,
          sourceRowNumber: rowNumber,
          sourceRowFingerprint: fingerprint,
          firstSeenAt: now,
          lastSeenAt: now,
          lastSyncedAt: now,
          needsOwnerMapping,
          isOverdue: false,
          isAtRisk: false,
        });

        result.added++;
      }
    }

    // Mark items that disappeared from the sheet
    const disappeared = existingItems.filter(
      (item) =>
        item.status !== "done" &&
        item.sourceRowNumber != null &&
        !seenRowNumbers.has(item.sourceRowNumber)
    );
    result.disappeared = disappeared.length;

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
  ownerEmail?: string | null;
}) {
  let query = db.select().from(sheetItems);

  const conditions = [];

  if (options?.status) {
    conditions.push(eq(sheetItems.status, options.status as any));
  }

  if (options?.needsOwnerMapping !== undefined) {
    conditions.push(
      eq(sheetItems.needsOwnerMapping, options.needsOwnerMapping)
    );
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

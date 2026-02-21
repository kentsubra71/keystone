import { google, sheets_v4 } from "googleapis";
import { z } from "zod";
import crypto from "crypto";

// Schema for validating sheet row data
export const SheetRowSchema = z.object({
  commitment: z.string().min(1),
  owner: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  comments: z.string().nullable().optional(),
});

export type SheetRow = z.infer<typeof SheetRowSchema>;

type CanonicalStatus = "not_started" | "in_progress" | "blocked" | "done" | "deferred";

// Status mapping from free-text to canonical statuses
const STATUS_MAPPINGS: Record<string, CanonicalStatus> = {
  // Not Started variants
  "not started": "not_started",
  "new": "not_started",
  "pending": "not_started",
  "to do": "not_started",
  "todo": "not_started",
  "open": "not_started",
  "": "not_started",

  // In Progress variants
  "in progress": "in_progress",
  "in-progress": "in_progress",
  "wip": "in_progress",
  "working": "in_progress",
  "started": "in_progress",
  "ongoing": "in_progress",

  // Blocked variants
  "blocked": "blocked",
  "on hold": "blocked",
  "waiting": "blocked",
  "stuck": "blocked",

  // Done variants
  "done": "done",
  "complete": "done",
  "completed": "done",
  "finished": "done",
  "closed": "done",
  "resolved": "done",

  // Deferred variants
  "deferred": "deferred",
  "postponed": "deferred",
  "later": "deferred",
  "backlog": "deferred",
};

export function normalizeStatus(rawStatus: string | null | undefined): {
  status: CanonicalStatus;
  needsReview: boolean;
} {
  if (!rawStatus) {
    return { status: "not_started", needsReview: false };
  }

  const normalized = rawStatus.toLowerCase().trim();
  const mappedStatus = STATUS_MAPPINGS[normalized];

  if (mappedStatus) {
    return { status: mappedStatus, needsReview: false };
  }

  // Unknown status - default to not_started and flag for review
  return { status: "not_started", needsReview: true };
}

export function generateRowFingerprint(row: (string | null | undefined)[]): string {
  const content = row.map((cell) => cell ?? "").join("|");
  return crypto.createHash("md5").update(content).digest("hex");
}

export function getGoogleSheetsClient(accessToken: string): sheets_v4.Sheets {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  auth.setCredentials({ access_token: accessToken });
  return google.sheets({ version: "v4", auth });
}

export function getGoogleSheetsClientWithServiceAccount(): sheets_v4.Sheets | null {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!email || !privateKey) {
    return null;
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: email,
      private_key: privateKey,
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  return google.sheets({ version: "v4", auth });
}

export type SheetConfig = {
  spreadsheetId: string;
  sheetName: string;
  headerRow: number;
  columnMapping: {
    commitment: number;
    owner: number;
    dueDate: number;
    status: number;
    comments: number;
  };
};

export const DEFAULT_SHEET_CONFIG: SheetConfig = {
  spreadsheetId: process.env.GOOGLE_SHEET_ID || "",
  sheetName: "Sorted",
  headerRow: 1,
  columnMapping: {
    commitment: 1, // Column B - Task description
    owner: 4, // Column E - Owner name
    dueDate: 2, // Column C - Date
    status: 5, // Column F - Status
    comments: 6, // Column G - Comments
  },
};

export type FetchedRow = {
  row: SheetRow;
  fingerprint: string;
  rowNumber: number; // 1-based sheet row number (stable identifier)
};

export async function fetchSheetData(
  sheets: sheets_v4.Sheets,
  config: SheetConfig
): Promise<FetchedRow[]> {
  const dataStartRow = config.headerRow + 1;
  const range = `${config.sheetName}!A${dataStartRow}:Z`;

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range,
  });

  const values = response.data.values || [];
  const results: FetchedRow[] = [];

  for (let i = 0; i < values.length; i++) {
    const raw = values[i];
    const commitment = raw[config.columnMapping.commitment]?.toString().trim();

    // Skip empty rows
    if (!commitment) continue;

    results.push({
      row: {
        commitment,
        owner: raw[config.columnMapping.owner]?.toString().trim() || null,
        dueDate: raw[config.columnMapping.dueDate]?.toString().trim() || null,
        status: raw[config.columnMapping.status]?.toString().trim() || null,
        comments: raw[config.columnMapping.comments]?.toString().trim() || null,
      },
      // Fingerprint only over the mapped columns (not the entire row)
      fingerprint: generateRowFingerprint([
        commitment,
        raw[config.columnMapping.owner] ?? "",
        raw[config.columnMapping.dueDate] ?? "",
        raw[config.columnMapping.status] ?? "",
        raw[config.columnMapping.comments] ?? "",
      ]),
      rowNumber: dataStartRow + i,
    });
  }

  return results;
}

export function parseDueDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;

  const trimmed = dateStr.trim();

  // Try ISO / native Date parsing first
  const date = new Date(trimmed);
  if (!isNaN(date.getTime())) return date;

  // Try DD/MM/YYYY — day > 12 disambiguates (e.g., 25/01/2024)
  const slashDate = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashDate) {
    const [, a, b, yearStr] = slashDate;
    const num1 = parseInt(a);
    const num2 = parseInt(b);
    const year = parseInt(yearStr);

    // If first number > 12, it must be a day (DD/MM/YYYY)
    if (num1 > 12) {
      return new Date(year, num2 - 1, num1);
    }
    // If second number > 12, it must be a day (MM/DD/YYYY)
    if (num2 > 12) {
      return new Date(year, num1 - 1, num2);
    }
    // Ambiguous (both <= 12) — default to DD/MM/YYYY (more common internationally)
    return new Date(year, num2 - 1, num1);
  }

  // Try DD-MM-YYYY
  const dashDate = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashDate) {
    const [, day, month, yearStr] = dashDate;
    return new Date(parseInt(yearStr), parseInt(month) - 1, parseInt(day));
  }

  return null;
}

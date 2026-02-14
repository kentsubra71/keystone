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

// Status mapping from free-text to canonical statuses
const STATUS_MAPPINGS: Record<string, string> = {
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
  status: string;
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
  const auth = new google.auth.OAuth2();
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

export async function fetchSheetData(
  sheets: sheets_v4.Sheets,
  config: SheetConfig
): Promise<{ rows: SheetRow[]; fingerprints: string[] }> {
  const range = `${config.sheetName}!A${config.headerRow + 1}:Z`;

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range,
  });

  const values = response.data.values || [];
  const rows: SheetRow[] = [];
  const fingerprints: string[] = [];

  for (const row of values) {
    const commitment = row[config.columnMapping.commitment]?.toString().trim();

    // Skip empty rows
    if (!commitment) {
      continue;
    }

    rows.push({
      commitment,
      owner: row[config.columnMapping.owner]?.toString().trim() || null,
      dueDate: row[config.columnMapping.dueDate]?.toString().trim() || null,
      status: row[config.columnMapping.status]?.toString().trim() || null,
      comments: row[config.columnMapping.comments]?.toString().trim() || null,
    });

    fingerprints.push(generateRowFingerprint(row));
  }

  return { rows, fingerprints };
}

export function parseDueDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) {
    return null;
  }

  // Try various date formats
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return date;
  }

  // Try DD/MM/YYYY format
  const ddmmyyyy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }

  // Try MM/DD/YYYY format
  const mmddyyyy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mmddyyyy) {
    const [, month, day, year] = mmddyyyy;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }

  return null;
}

// Canonical Due-From-Me types (exhaustive per contract)
export type DueFromMeType = "reply" | "approval" | "decision" | "follow_up";

// Canonical action statuses (per contract)
export type ActionStatus =
  | "not_started"
  | "in_progress"
  | "blocked"
  | "done"
  | "deferred";

// Due From Me item shape
export type DueFromMeItem = {
  id: string;
  type: DueFromMeType;
  status: ActionStatus;
  title: string;
  source: "gmail" | "sheet" | "calendar";
  sourceId: string;

  // Accountability
  blockingWho: string | null;
  ownerEmail: string | null;

  // Aging
  agingDays: number;
  daysInCurrentStatus: number;
  firstSeenAt: Date;
  lastSeenAt: Date;

  // Classification
  confidenceScore: number;
  rationale: string;
  suggestedAction: string | null;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
};

// Owner Directory entry
export type OwnerDirectoryEntry = {
  id: string;
  displayName: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
};

// Sheet item (synced from Google Sheets)
export type SheetItem = {
  id: string;
  commitment: string;
  ownerLabel: string | null;
  ownerEmail: string | null;
  dueDate: Date | null;
  status: ActionStatus;
  rawStatus: string | null;
  comments: string | null;

  // Sync tracking
  sourceRowFingerprint: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  lastSyncedAt: Date;

  // Flags
  needsOwnerMapping: boolean;
  isOverdue: boolean;
  isAtRisk: boolean;

  createdAt: Date;
  updatedAt: Date;
};

// Gmail thread (ingested)
export type GmailThread = {
  id: string;
  threadId: string;
  subject: string;
  snippet: string;
  from: string;
  to: string[];
  cc: string[];
  receivedAt: Date;
  labels: string[];

  // Classification
  dueFromMeType: DueFromMeType | null;
  confidenceScore: number | null;
  rationale: string | null;
  isProcessed: boolean;

  createdAt: Date;
  updatedAt: Date;
};

// User action (for learning)
export type UserAction = {
  id: string;
  itemId: string;
  itemSource: "gmail" | "sheet" | "calendar";
  action: "done" | "snooze" | "delegate" | "ignore" | "priority_override";
  previousValue: string | null;
  newValue: string | null;
  createdAt: Date;
};

// Daily brief
export type DailyBrief = {
  id: string;
  generatedAt: Date;
  content: {
    topDueItems: DueFromMeItem[];
    overdueItems: DueFromMeItem[];
    meetingsNeedingPrep: string[];
    slippingCommitments: SheetItem[];
  };
};

// Nudge
export type Nudge = {
  id: string;
  type: "blocking_others" | "overdue" | "critical_due_soon";
  itemId: string;
  reason: string;
  sentAt: Date | null;
  dismissedAt: Date | null;
  createdAt: Date;
};

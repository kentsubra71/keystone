import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  pgEnum,
  jsonb,
  uuid,
  index,
} from "drizzle-orm/pg-core";

// ============================================================================
// ENUMS (per contract canonical definitions)
// ============================================================================

// Canonical Due-From-Me types (exhaustive per Section 3.2)
export const dueFromMeTypeEnum = pgEnum("due_from_me_type", [
  "reply",
  "approval",
  "decision",
  "follow_up",
]);

// Canonical action statuses (per Section 3.3)
export const actionStatusEnum = pgEnum("action_status", [
  "not_started",
  "in_progress",
  "blocked",
  "done",
  "deferred",
]);

// Item source
export const itemSourceEnum = pgEnum("item_source", [
  "gmail",
  "sheet",
  "calendar",
]);

// User action types (for learning)
export const userActionTypeEnum = pgEnum("user_action_type", [
  "done",
  "snooze",
  "delegate",
  "ignore",
  "priority_override",
]);

// Nudge types
export const nudgeTypeEnum = pgEnum("nudge_type", [
  "blocking_others",
  "overdue",
  "critical_due_soon",
]);

// ============================================================================
// TABLES
// ============================================================================

// Users table (single user per contract Section 2)
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Owner Directory (per contract Section 2.1)
export const ownerDirectory = pgTable("owner_directory", {
  id: uuid("id").primaryKey().defaultRandom(),
  displayName: text("display_name").notNull(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Sheet items (synced from Google Sheets - per contract Section 5.3)
export const sheetItems = pgTable("sheet_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  commitment: text("commitment").notNull(),
  ownerLabel: text("owner_label"),
  ownerEmail: text("owner_email"),
  dueDate: timestamp("due_date"),
  status: actionStatusEnum("status").notNull().default("not_started"),
  rawStatus: text("raw_status"),
  comments: text("comments"),

  // Sync tracking (per contract Section 5.3)
  sourceRowNumber: integer("source_row_number"),
  sourceRowFingerprint: text("source_row_fingerprint").notNull(),
  firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  lastSyncedAt: timestamp("last_synced_at").defaultNow().notNull(),

  // Flags
  needsOwnerMapping: boolean("needs_owner_mapping").default(false).notNull(),
  isOverdue: boolean("is_overdue").default(false).notNull(),
  isAtRisk: boolean("is_at_risk").default(false).notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_sheet_items_status").on(table.status),
  index("idx_sheet_items_owner_email").on(table.ownerEmail),
  index("idx_sheet_items_fingerprint").on(table.sourceRowFingerprint),
  index("idx_sheet_items_row_number").on(table.sourceRowNumber),
]);

// Gmail threads (per contract Section 5.1)
export const gmailThreads = pgTable("gmail_threads", {
  id: uuid("id").primaryKey().defaultRandom(),
  threadId: text("thread_id").notNull().unique(),
  messageId: text("message_id"),
  subject: text("subject").notNull(),
  snippet: text("snippet"),
  fromAddress: text("from_address").notNull(),
  toAddresses: jsonb("to_addresses").$type<string[]>().default([]),
  ccAddresses: jsonb("cc_addresses").$type<string[]>().default([]),
  receivedAt: timestamp("received_at").notNull(),
  labels: jsonb("labels").$type<string[]>().default([]),

  // Classification
  dueFromMeType: dueFromMeTypeEnum("due_from_me_type"),
  confidenceScore: integer("confidence_score"),
  rationale: text("rationale"),
  isProcessed: boolean("is_processed").default(false).notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Due From Me items (the core entity - per contract Section 4.1)
export const dueFromMeItems = pgTable("due_from_me_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: dueFromMeTypeEnum("type").notNull(),
  status: actionStatusEnum("status").notNull().default("not_started"),
  title: text("title").notNull(),
  source: itemSourceEnum("source").notNull(),
  sourceId: text("source_id").notNull(),

  // Accountability
  blockingWho: text("blocking_who"),
  ownerEmail: text("owner_email"),

  // Aging (per contract Section 4.1)
  agingDays: integer("aging_days").default(0).notNull(),
  daysInCurrentStatus: integer("days_in_current_status").default(0).notNull(),
  firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  statusChangedAt: timestamp("status_changed_at").defaultNow().notNull(),

  // Classification (per contract Section 7)
  confidenceScore: integer("confidence_score").default(0).notNull(),
  rationale: text("rationale").notNull(),
  suggestedAction: text("suggested_action"),

  // Internal notes (stored in Keystone, not written back)
  notes: text("notes"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_due_items_source_id").on(table.sourceId),
  index("idx_due_items_status").on(table.status),
  index("idx_due_items_source").on(table.source),
]);

// User actions (for learning - per contract Section 7)
export const userActions = pgTable("user_actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  itemId: uuid("item_id").notNull(),
  itemSource: itemSourceEnum("item_source").notNull(),
  action: userActionTypeEnum("action").notNull(),
  previousValue: text("previous_value"),
  newValue: text("new_value"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_user_actions_item_id").on(table.itemId),
]);

// Daily briefs (per contract Section 4.2)
export const dailyBriefs = pgTable("daily_briefs", {
  id: uuid("id").primaryKey().defaultRandom(),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  content: jsonb("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Nudges (per contract Section 6)
export const nudges = pgTable("nudges", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: nudgeTypeEnum("type").notNull(),
  itemId: uuid("item_id").notNull(),
  reason: text("reason").notNull(),
  sentAt: timestamp("sent_at"),
  dismissedAt: timestamp("dismissed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_nudges_item_id").on(table.itemId),
]);

// App settings
export const appSettings = pgTable("app_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Gmail draft transcripts (per contract Section 5.4 - text only, no audio)
export const draftTranscripts = pgTable("draft_transcripts", {
  id: uuid("id").primaryKey().defaultRandom(),
  threadId: text("thread_id").notNull(),
  transcript: text("transcript").notNull(),
  generatedDraftId: text("generated_draft_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

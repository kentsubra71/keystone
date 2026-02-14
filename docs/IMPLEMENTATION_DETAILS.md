# Keystone MVP: Implementation Details

## Overview

This document provides a comprehensive technical breakdown of what has been built, including all API integrations, database schemas, classification logic, and regex patterns used.

---

## 1. Google API Integrations

### 1.1 Google OAuth Scopes

The following scopes are requested during authentication:

```
openid
email
profile
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/gmail.compose
https://www.googleapis.com/auth/spreadsheets.readonly
https://www.googleapis.com/auth/calendar.events.readonly
```

| Scope | Purpose |
|-------|---------|
| `gmail.readonly` | Read email headers, snippets, thread IDs |
| `gmail.compose` | Create draft emails (never send) |
| `spreadsheets.readonly` | Read commitment data from Sheet |
| `calendar.events.readonly` | Read upcoming meetings |

---

### 1.2 Gmail Integration

**File:** `src/lib/google/gmail.ts`

#### What is Fetched
- Last 50 threads from inbox (`in:inbox`)
- For each thread, the **latest message** metadata:
  - Thread ID, Message ID
  - Subject line
  - Snippet (~100 chars of body)
  - From address
  - To addresses (parsed from header)
  - CC addresses (parsed from header)
  - Received timestamp
  - Label IDs

#### Email Address Parsing
```typescript
function parseEmailList(emailString: string): string[] {
  // Handles "Name <email@domain.com>" format
  return emailString.split(",").map((e) => {
    const match = e.match(/<([^>]+)>/);
    return match ? match[1].trim() : e.trim();
  });
}
```

---

### 1.3 Google Sheets Integration

**File:** `src/lib/google/sheets.ts`

#### Default Configuration
```typescript
const DEFAULT_SHEET_CONFIG = {
  spreadsheetId: process.env.GOOGLE_SHEET_ID,
  sheetName: "Sorted",
  headerRow: 1,
  columnMapping: {
    commitment: 1,  // Column B (0-indexed from A)
    owner: 4,       // Column E
    dueDate: 2,     // Column C
    status: 5,      // Column F
    comments: 6,    // Column G
  },
};
```

#### Status Normalization
Free-text statuses from the Sheet are mapped to canonical statuses:

```typescript
const STATUS_MAPPINGS = {
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
```

Unknown statuses default to `not_started` and are flagged for review.

#### Row Fingerprinting
Each row is fingerprinted using MD5 hash for change detection:

```typescript
function generateRowFingerprint(row: (string | null | undefined)[]): string {
  const content = row.map((cell) => cell ?? "").join("|");
  return crypto.createHash("md5").update(content).digest("hex");
}
```

#### Due Date Parsing
Supports multiple date formats:
- ISO format (native `Date` parsing)
- DD/MM/YYYY
- MM/DD/YYYY

---

### 1.4 Google Calendar Integration

**File:** `src/lib/google/calendar.ts`

#### What is Fetched
- Meetings from now until end of day
- For each event:
  - Event ID
  - Title (summary)
  - Start/End times
  - Attendee list
  - Description

---

## 2. Gmail Classification Logic

**File:** `src/lib/services/gmail-classifier.ts`

### 2.1 Classification Types

| Type | Confidence | Priority |
|------|------------|----------|
| Approval | 85% | 1 (Highest) |
| Decision | 80% | 2 |
| Follow-up | 75% | 3 |
| Reply | 70% | 4 (Lowest) |

Classification is done in priority order - first match wins.

---

### 2.2 Regex Patterns

#### APPROVAL_PATTERNS (Confidence: 85%)
Detects emails requesting sign-off or formal approval:

```javascript
/please\s+approve/i
/need(s?)?\s+(your\s+)?approval/i
/waiting\s+(for|on)\s+(your\s+)?approval/i
/sign[\s-]?off/i
/please\s+(review|sign)/i
/for\s+(your\s+)?approval/i
/approve\s+this/i
/pending\s+(your\s+)?approval/i
```

**Examples matched:**
- "Please approve the attached budget"
- "This needs your approval before we proceed"
- "Waiting for sign-off on the contract"

---

#### DECISION_PATTERNS (Confidence: 80%)
Detects emails requiring a choice between options:

```javascript
/which\s+option/i
/please\s+(decide|choose)/i
/option\s+(a|1|one)\s+or\s+(b|2|two)/i
/what\s+(do\s+you|would\s+you)\s+(think|prefer|suggest)/i
/need\s+(your\s+)?(decision|input)/i
/either\s+.+\s+or\s+/i
```

**Examples matched:**
- "Which option do you prefer?"
- "Please decide between vendor A or B"
- "We need your input on the timeline"

---

#### FOLLOW_UP_PATTERNS (Confidence: 75%)
Detects emails where the user made a commitment:

```javascript
/i('ll|\s+will)\s+(check|look|get\s+back|follow\s+up)/i
/let\s+me\s+(check|look|get\s+back)/i
/will\s+revert/i
/i('ll|\s+will)\s+send/i
/get\s+back\s+to\s+you/i
```

**Examples matched:**
- "I'll check with the team and get back"
- "Let me look into this"
- "I will send the report by EOD"

---

#### REPLY_PATTERNS (Confidence: 70%)
Detects emails explicitly requesting a response:

```javascript
/please\s+(reply|respond|get back)/i
/let\s+me\s+know/i
/could\s+you\s+(please\s+)?(confirm|clarify)/i
/waiting\s+(for|on)\s+(your|a)\s+(reply|response)/i
/\?\s*$/                                          // Ends with question mark
/can\s+you\s+(please\s+)?/i
/would\s+you\s+(please\s+)?/i
/please\s+(share|send|provide|update)/i
/kindly\s+/i
/request\s+you\s+to/i
/by\s+(today|tomorrow|eod|end\s+of\s+day|cob|close\s+of\s+business)/i
/urgent(ly)?/i
/asap/i
```

**Examples matched:**
- "Please reply with your availability"
- "Let me know if this works"
- "Could you confirm the meeting time?"
- "Please share the document by EOD"
- "This is urgent - need your response ASAP"

---

### 2.3 Mailing List Filtering

**File:** `src/lib/services/gmail-sync.ts`

Emails sent to mailing lists are filtered out (not classified as Due-From-Me):

```javascript
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
```

If any TO address matches these patterns, the thread is skipped.

---

### 2.4 Classification Process

```
1. Fetch thread from Gmail
2. Check if TO addresses match mailing list patterns → SKIP if yes
3. Combine subject + snippet into analysis text
4. Check APPROVAL_PATTERNS → return type: "approval" (85%)
5. Check DECISION_PATTERNS → return type: "decision" (80%)
6. Check FOLLOW_UP_PATTERNS → return type: "follow_up" (75%)
7. Check REPLY_PATTERNS → return type: "reply" (70%)
8. No match → return type: null (not a Due-From-Me item)
```

---

## 3. Database Schema

**File:** `src/lib/db/schema.ts`

### 3.1 Enums

```sql
-- Due-From-Me types (exhaustive per contract)
CREATE TYPE due_from_me_type AS ENUM ('reply', 'approval', 'decision', 'follow_up');

-- Canonical action statuses
CREATE TYPE action_status AS ENUM ('not_started', 'in_progress', 'blocked', 'done', 'deferred');

-- Item source
CREATE TYPE item_source AS ENUM ('gmail', 'sheet', 'calendar');

-- User action types (for learning)
CREATE TYPE user_action_type AS ENUM ('done', 'snooze', 'delegate', 'ignore', 'priority_override');

-- Nudge types
CREATE TYPE nudge_type AS ENUM ('blocking_others', 'overdue', 'critical_due_soon');
```

### 3.2 Tables

#### users
Single user record for auth.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| email | TEXT | Google account email |
| name | TEXT | Display name |
| image | TEXT | Profile image URL |

#### owner_directory
Maps display names to email addresses for Sheet owners.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| display_name | TEXT | Name as shown in Sheet |
| email | TEXT | Corresponding email address |

#### sheet_items
Items synced from Google Sheet.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| commitment | TEXT | Task description |
| owner_label | TEXT | Owner as shown in Sheet |
| owner_email | TEXT | Mapped email (from owner_directory) |
| due_date | TIMESTAMP | Due date if provided |
| status | action_status | Normalized status |
| raw_status | TEXT | Original status text |
| comments | TEXT | Comments from Sheet |
| source_row_fingerprint | TEXT | MD5 hash for change detection |
| first_seen_at | TIMESTAMP | When first synced |
| last_seen_at | TIMESTAMP | When last seen in Sheet |
| needs_owner_mapping | BOOLEAN | True if owner not in directory |
| is_overdue | BOOLEAN | True if past due date |
| is_at_risk | BOOLEAN | True if due within 3 days |

#### gmail_threads
Email threads ingested from Gmail.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| thread_id | TEXT | Gmail thread ID |
| message_id | TEXT | Gmail message ID |
| subject | TEXT | Email subject |
| snippet | TEXT | First ~100 chars |
| from_address | TEXT | Sender |
| to_addresses | JSONB | Array of recipients |
| cc_addresses | JSONB | Array of CC recipients |
| received_at | TIMESTAMP | When received |
| labels | JSONB | Gmail labels |
| due_from_me_type | due_from_me_type | Classification result |
| confidence_score | INTEGER | 0-100 |
| rationale | TEXT | Why it was classified |
| is_processed | BOOLEAN | Has been classified |

#### due_from_me_items
Core entity - items requiring user action.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| type | due_from_me_type | Reply/Approval/Decision/Follow-up |
| status | action_status | Current status |
| title | TEXT | Subject/description |
| source | item_source | gmail/sheet/calendar |
| source_id | TEXT | Original item ID |
| blocking_who | TEXT | Who is waiting |
| owner_email | TEXT | Original sender/owner |
| aging_days | INTEGER | Days since first seen |
| days_in_current_status | INTEGER | Days in this status |
| confidence_score | INTEGER | 0-100 |
| rationale | TEXT | Why flagged |
| suggested_action | TEXT | What to do |

#### user_actions
Records user actions for learning.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| item_id | UUID | Related item |
| item_source | item_source | Source type |
| action | user_action_type | done/snooze/ignore/etc |
| previous_value | TEXT | Value before action |
| new_value | TEXT | Value after action |

#### daily_briefs
Generated daily summaries.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| generated_at | TIMESTAMP | When generated |
| content | JSONB | Brief content |

#### nudges
Notification/reminder records.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| type | nudge_type | blocking/overdue/critical |
| item_id | UUID | Related item |
| reason | TEXT | Why nudging |
| sent_at | TIMESTAMP | When sent |
| dismissed_at | TIMESTAMP | When dismissed |

#### draft_transcripts
Stores dictation transcripts (text only, no audio).

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| thread_id | TEXT | Gmail thread ID |
| transcript | TEXT | Speech-to-text result |
| generated_draft_id | TEXT | Created draft ID |

---

## 4. API Routes

### 4.1 Authentication
| Route | Method | Description |
|-------|--------|-------------|
| `/api/auth/[...nextauth]` | GET/POST | NextAuth.js handlers |

### 4.2 Core Data
| Route | Method | Description |
|-------|--------|-------------|
| `/api/due-from-me` | GET | Get Due-From-Me items (filter: due/blocking/all) |
| `/api/waiting-on` | GET | Get items user is waiting on others for |
| `/api/sheet-items` | GET | Get all sheet items with filters |
| `/api/items/[id]/action` | POST | Perform action on item (done/snooze/ignore) |

### 4.3 Sync
| Route | Method | Description |
|-------|--------|-------------|
| `/api/sync/sheet` | POST | Trigger Google Sheet sync |
| `/api/sync/gmail` | POST | Trigger Gmail sync |

### 4.4 Owner Directory
| Route | Method | Description |
|-------|--------|-------------|
| `/api/owner-directory` | GET | List all owner mappings |
| `/api/owner-directory` | POST | Add new owner mapping |
| `/api/owner-directory/[id]` | PUT | Update owner mapping |
| `/api/owner-directory/[id]` | DELETE | Delete owner mapping |

### 4.5 Daily Brief
| Route | Method | Description |
|-------|--------|-------------|
| `/api/brief` | GET | Get today's brief |
| `/api/brief` | POST | Generate new brief |

### 4.6 Nudges
| Route | Method | Description |
|-------|--------|-------------|
| `/api/nudges` | GET | Get active nudges |
| `/api/nudges/[id]/dismiss` | POST | Dismiss a nudge |

### 4.7 Drafts
| Route | Method | Description |
|-------|--------|-------------|
| `/api/drafts/create` | POST | Create Gmail draft from transcript |

### 4.8 Debug (Development Only)
| Route | Method | Description |
|-------|--------|-------------|
| `/api/debug/sheet-items` | GET | Inspect synced sheet data |
| `/api/debug/clear-sheet-items` | POST | Clear all sheet items |
| `/api/debug/gmail-threads` | GET | Inspect synced Gmail data |
| `/api/debug/clear-gmail-items` | POST | Clear all Gmail items |

---

## 5. UI Components

### 5.1 Dashboard Components
| Component | Purpose |
|-----------|---------|
| `DueFromMeSection` | Shows items due from user |
| `BlockingOthersSection` | Shows items where user is blocking others |
| `WaitingOnSection` | Shows items user is waiting on (from Sheet) |
| `ItemCard` | Individual item with actions |

### 5.2 Settings Components
| Component | Purpose |
|-----------|---------|
| `OwnerDirectoryManager` | CRUD for owner name→email mappings |
| `SyncSettings` | Manual sync buttons for Sheet/Gmail |

### 5.3 Other Components
| Component | Purpose |
|-----------|---------|
| `Sidebar` | Navigation |
| `DailyBriefView` | Displays generated daily brief |
| `NudgeBanner` | Shows active nudges |
| `AllItemsView` | Table view of all items with filters |
| `DictateButton` | Speech-to-text button (standalone) |

---

## 6. Action Behavior

### 6.1 Done
```typescript
async function markItemDone(itemId: string) {
  // 1. Record action for learning
  await recordUserAction(itemId, source, "done", previousStatus, "done");
  
  // 2. Update item status
  await db.update(dueFromMeItems).set({
    status: "done",
    statusChangedAt: new Date(),
  });
}
```

### 6.2 Snooze
```typescript
async function snoozeItem(itemId: string, days: number) {
  // 1. Record action for learning
  await recordUserAction(itemId, source, "snooze", undefined, `${days} days`);
  
  // 2. Update item status to deferred
  await db.update(dueFromMeItems).set({
    status: "deferred",
    statusChangedAt: new Date(),
  });
}
```
**Note:** Auto-resurface after snooze period is NOT yet implemented.

### 6.3 Ignore
```typescript
async function ignoreItem(itemId: string) {
  // 1. Record action for learning (different from "done")
  await recordUserAction(itemId, source, "ignore");
  
  // 2. Mark as done (removes from active list)
  await db.update(dueFromMeItems).set({
    status: "done",
    statusChangedAt: new Date(),
  });
}
```
**Learning impact:** "Ignore" signals false positive - used to improve future classification.

---

## 7. Sync Logic

### 7.1 Sheet Sync Process
```
1. Fetch all rows from configured sheet/tab
2. For each row with a commitment:
   a. Generate fingerprint (MD5 hash)
   b. Look up owner email in owner_directory
   c. Normalize status text to canonical status
   d. Parse due date
   e. Calculate isOverdue / isAtRisk flags
   f. Upsert to sheet_items table
3. Track items that disappeared (stopped appearing)
```

### 7.2 Gmail Sync Process
```
1. Fetch last 50 inbox threads
2. For each thread:
   a. Check if TO addresses match mailing list patterns → Skip
   b. Parse email metadata (from, to, cc, subject, snippet)
   c. Run classification against all patterns
   d. If classified as Due-From-Me:
      - Create/update due_from_me_items record
      - Calculate aging days
      - Set blocking_who, suggested_action
3. Return stats: processed, created, skipped
```

---

## 8. Authentication

**File:** `src/lib/auth.ts`

### Configuration
- Provider: Google OAuth
- Session strategy: JWT
- Single-user restriction: `ALLOWED_USER_EMAIL` env var

### Token Handling
Access token is stored in session for API calls:
```typescript
callbacks: {
  jwt: ({ token, account }) => {
    if (account) {
      token.accessToken = account.access_token;
    }
    return token;
  },
  session: ({ session, token }) => {
    session.accessToken = token.accessToken;
    return session;
  }
}
```

### Single-User Restriction
```typescript
signIn: ({ user }) => {
  const allowedEmail = process.env.ALLOWED_USER_EMAIL;
  if (allowedEmail && user.email !== allowedEmail) {
    return false;  // Reject login
  }
  return true;
}
```

---

## 9. Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `DATABASE_URL` | Neon.tech Postgres connection string | Yes |
| `AUTH_SECRET` | NextAuth.js secret (32+ chars) | Yes |
| `GOOGLE_CLIENT_ID` | OAuth client ID | Yes |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret | Yes |
| `GOOGLE_SHEET_ID` | Spreadsheet ID to sync | Yes |
| `ALLOWED_USER_EMAIL` | Single user restriction | Yes |
| `MOCK_AUTH` | Bypass OAuth for local dev | No |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service account for background sync | No |
| `GOOGLE_PRIVATE_KEY` | Service account private key | No |

---

## 10. Known Limitations / Not Yet Implemented

| Feature | Status | Notes |
|---------|--------|-------|
| Snooze auto-resurface | Not implemented | Items stay deferred, no timer |
| Snooze duration picker | Not implemented | Hardcoded to 1 day |
| Calendar integration in UI | Partial | API exists, not shown in dashboard |
| Active learning | Not implemented | Actions recorded but not used to adjust scores |
| Background sync | Not implemented | Manual sync only |
| Nudge generation | Schema only | No automatic nudge creation |
| Meeting dependency flagging | Not implemented | Calendar fetched but not analyzed |

---

## 11. File Structure

```
src/
├── app/
│   ├── (auth)/login/page.tsx
│   ├── (dashboard)/
│   │   ├── today/page.tsx
│   │   ├── brief/page.tsx
│   │   ├── items/page.tsx
│   │   ├── settings/page.tsx
│   │   └── layout.tsx
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts
│   │   ├── due-from-me/route.ts
│   │   ├── waiting-on/route.ts
│   │   ├── items/[id]/action/route.ts
│   │   ├── sync/sheet/route.ts
│   │   ├── sync/gmail/route.ts
│   │   ├── owner-directory/route.ts
│   │   ├── brief/route.ts
│   │   ├── nudges/route.ts
│   │   ├── drafts/create/route.ts
│   │   └── debug/*.ts
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── dashboard/
│   ├── settings/
│   ├── brief/
│   ├── items/
│   ├── nudges/
│   ├── dictation/
│   └── layout/
├── lib/
│   ├── auth.ts
│   ├── db/
│   │   ├── index.ts
│   │   └── schema.ts
│   ├── google/
│   │   ├── gmail.ts
│   │   ├── sheets.ts
│   │   └── calendar.ts
│   └── services/
│       ├── gmail-classifier.ts
│       ├── gmail-sync.ts
│       ├── sheet-sync.ts
│       ├── daily-brief.ts
│       ├── nudges.ts
│       ├── learning.ts
│       └── draft-generator.ts
└── types/
    └── index.ts
```

# Keystone: Business Logic & AI Reference

Core features, data pipelines, classification logic, and full AI prompts. Updated Feb 2026.

---

## 1. Core Concept

Keystone answers: **"What is due FROM me right now?"**

An item is "due from me" only if the user is the last required dependency AND someone else cannot proceed until the user acts. Four types only:

| Type | Definition |
|------|------------|
| **Reply** | Someone explicitly asked the user to respond |
| **Approval** | Someone needs a yes/no or sign-off |
| **Decision** | Someone needs the user to choose between options |
| **Follow-up** | The user committed to an action and hasn't fulfilled it |

---

## 2. Gmail Classification (GPT-4o-mini)

**File:** `src/lib/services/gmail-classifier.ts`

### System Prompt (Dynamic)

The prompt embeds the user's actual email address to prevent misattribution:

```
You are an executive assistant analyzing email threads for ONE specific person: ${userEmail}

"The user" means ONLY ${userEmail}. No one else. Every other person in the thread is "someone else."

An item is "Due From Me" ONLY if:
- ${userEmail} is the one who must act, AND
- Someone else cannot proceed until ${userEmail} acts

There are exactly 4 types:

1. REPLY - someone explicitly asked ${userEmail} to respond (not a group, not someone else)
2. APPROVAL - someone needs a yes/no or sign-off specifically from ${userEmail}
3. DECISION - someone needs ${userEmail} to choose between options
4. FOLLOW_UP - ${userEmail} made a commitment in a message marked (FROM USER) and hasn't fulfilled it

CRITICAL rules:
- Messages marked (FROM USER) are from ${userEmail}. All other messages are from other people.
- If another person (not ${userEmail}) made a commitment, that is NOT a due-from-me item. It is THEIR follow-up, not ours.
- If a request is addressed to a group or to someone other than ${userEmail}, it is NOT due from ${userEmail}.
- Newsletters, automated notifications, marketing, and FYI-only messages -> null.
- If ${userEmail} already replied in a later message -> null (already handled).
- Be conservative: when in doubt, classify as null. False negatives are better than false positives.

Respond with JSON only:
{
  "isDueFromMe": boolean,
  "type": "reply" | "approval" | "decision" | "follow_up" | null,
  "confidence": number (0-100),
  "rationale": string (1-2 sentences explaining why),
  "blockingWho": string | null (name or email of who is waiting on ${userEmail}),
  "suggestedAction": string | null (one sentence: what ${userEmail} should do)
}
```

### Model Configuration
- Model: `gpt-4o-mini`
- Temperature: `0.1` (near-deterministic)
- Max tokens: `300`
- Response format: `json_object`

### Thread Formatting for LLM

Each thread is formatted as human-readable text:

```
Subject: {subject}
User email: {userEmail}
Recipients: To: {to} | CC: {cc}
---
[{date}] From: {sender} {isFromUser ? "(FROM USER)" : ""}
{messageBody (truncated to 2000 chars)}
---
[{date}] From: {sender2} ...
```

The `(FROM USER)` marker is critical — it tells the LLM which messages are the user's own.

### Fallback (Regex Heuristics)

If the OpenAI API fails, classification falls back to pattern matching:

**Approval (confidence 60):** `please approve`, `needs? your? approval`, `sign-off`, `pending approval`
**Decision (confidence 55):** `which option`, `please decide|choose`, `need your? decision|input`
**Follow-up (confidence 50):** `i'll check|look|get back|follow up`, `let me check`, `will revert`
**Reply (confidence 50):** `please reply|respond`, `let me know`, `could you confirm|clarify`, ends with `?`

### Batch Processing
- Concurrent limit: 10 threads classified simultaneously
- Per-thread failure handling: continues with remaining threads
- Returns `Map<threadId, ClassificationResult>`

---

## 3. Gmail Sync Pipeline

**File:** `src/lib/services/gmail-sync.ts`

### Process
```
1. Fetch recent threads (inbox, last 7 days, max 500)
2. For each thread, filter out:
   - Mailing lists (RFC 2369 headers: List-Unsubscribe, List-Id)
   - Promotional categories (CATEGORY_PROMOTIONS, CATEGORY_FORUMS, etc.)
   - Threads where user is NOT in TO field (CC-only excluded)
3. Skip threads where user already acted (status = "done" or "deferred")
4. Classify remaining via GPT-4o-mini (batch, 10 concurrent)
5. Upsert gmailThreads records
6. Create/update dueFromMeItems if classified as due-from-me
7. Aging = time since last INBOUND message (not thread start)
```

### Key Design Decision: Aging
- Aging is computed from the **last message from someone else** (the triggering request)
- NOT from the thread origin, which could be years old if the thread was revived
- Prevents false urgency on old threads that get a new reply

### Mailing List Detection
Threads are skipped if any TO address matches:
```
/all@/i, /everyone@/i, /team@/i, /group@/i, /staff@/i,
/company@/i, /-all@/i, /hurixall/i
```
Also skips threads with RFC 2369 mailing list headers.

---

## 4. Email Draft & Send

**File:** `src/lib/services/draft-generator.ts`

### GPT Polishing Prompt

```
System: You are a professional email writer. Convert the user's spoken transcript
into a clear, professional email reply. Rules:
- Preserve the meaning and intent exactly - do not add or remove information
- Use a neutral, professional tone
- Keep it concise
- Do not add greetings like "Dear" or sign-offs like "Best regards" - just the body
- Fix grammar, filler words ("um", "uh", "like"), and spoken artifacts
- Output plain text only, no formatting

User: Original email context (for reference only, do not quote it):
Subject: {subject}
Snippet: {snippet}

My spoken response to convert into an email:
{transcript}
```

- Model: `gpt-4o-mini`, temperature: `0.3`
- Fallback: Basic regex cleanup (remove filler words, capitalize, fix whitespace)

### Three Email Operations

**1. Polish (Preview)** — `POST /api/emails/polish`
- Input: threadId + transcript
- Returns polished text without sending or creating draft
- Used for the "preview before send" step

**2. Send Reply** — `POST /api/emails/send`
- Input: threadId + transcript + optional polishedBody
- If polishedBody provided: uses it directly (skips GPT re-processing)
- If not: generates via GPT
- Sends via Gmail API `users.messages.send`

**3. Create Draft** — `POST /api/drafts/create`
- Input: threadId + transcript
- Generates via GPT, creates Gmail draft
- Draft appears in user's Gmail Drafts folder

### Message Format (RFC 2822)
```
To: {from of original thread}
Cc: {cc addresses if any}
Subject: Re: {subject with existing Re: prefixes stripped}
Content-Type: text/plain; charset=utf-8

{GPT-polished body}
```
Base64url encoded for Gmail API.

---

## 5. Sheet Sync Pipeline

**File:** `src/lib/services/sheet-sync.ts`

### Default Configuration
```
Sheet: "Sorted"
Column B → commitment
Column C → dueDate
Column E → owner
Column F → status
Column G → comments
Header row: 1
```

### Process
```
1. Fetch rows via Google Sheets API (service account for cron, user OAuth for manual)
2. For each row with a commitment:
   a. Generate MD5 fingerprint of mapped columns
   b. Map owner label → email via ownerDirectory table
   c. Normalize status text → canonical status
   d. Parse due date (ISO, DD/MM/YYYY, MM/DD/YYYY)
3. Upsert logic:
   - Look up by row number first, fallback to fingerprint
   - Only update if fingerprint changed
   - Always update lastSeenAt (marks item as alive)
4. Detect disappeared items (row no longer exists, status != done)
```

### Status Normalization
```
not_started: "not started", "new", "pending", "to do", "todo", "open", ""
in_progress: "in progress", "in-progress", "wip", "working", "started", "ongoing"
blocked:     "blocked", "on hold", "waiting", "stuck"
done:        "done", "complete", "completed", "finished", "closed", "resolved"
deferred:    "deferred", "postponed", "later", "backlog"
```
Unknown statuses default to `not_started` and are flagged.

### Overdue / At-Risk Detection (Dynamic SQL)
```sql
isOverdue = due_date IS NOT NULL AND due_date < NOW()
isAtRisk  = due_date IS NOT NULL AND due_date >= NOW() AND due_date < NOW() + INTERVAL '3 days'
```

---

## 6. Meeting Briefing (Calendar Integration)

**API:** `src/app/api/meetings/upcoming/route.ts`
**Component:** `src/components/dashboard/MeetingBriefingSection.tsx`

### Data Flow
```
TodayContent fetches /api/meetings/upcoming
  → API calls getUpcomingMeetings(calendar, 36) for next 36 hours
  → For each meeting, for each attendee (excluding user):
      → Query dueFromMeItems (what user owes them)
      → Query sheetItems (what they owe user)
      → Query gmailThreads (recent emails from them, max 5)
      → Lookup ownerDirectory (display name)
  → Returns EnrichedMeeting[] with per-attendee context
```

### Enriched Meeting Shape
```typescript
type EnrichedMeeting = {
  id: string;
  summary: string;
  start: string;          // ISO
  end: string;
  description: string | null;
  attendees: {
    email: string;
    displayName: string | null;
    dueFromMe: { id, title, type, agingDays }[];
    theyOweMe: { id, commitment, dueDate, isOverdue }[];
    recentThreads: { threadId, subject, receivedAt }[];
  }[];
};
```

### Performance
- All attendee data fetched in 4 parallel batch queries (not per-attendee)
- Indexed in-memory by email for O(1) lookup per attendee

### UI Behavior
- Grouped by "Today" / "Tomorrow" headers
- Meetings with context: expanded by default, brand-gradient left border
- Meetings without context: compact single-line, muted
- Meeting proximity badges on ItemCards: "Meeting in 3h" (amber) / "Meeting tomorrow 11am" (blue)

---

## 7. Due From Me Queries

**File:** `src/app/api/due-from-me/route.ts`

### Filters
| Filter | Where Clause |
|--------|-------------|
| `?filter=due` | status != done AND status != deferred |
| `?filter=blocking` | blockingWho IS NOT NULL AND status != done AND status != deferred |
| `?filter=all` | (no filter) |

### Dynamic Aging (Computed at Query Time)
```sql
agingDays = EXTRACT(DAY FROM NOW() - first_seen_at)::int
daysInCurrentStatus = EXTRACT(DAY FROM NOW() - status_changed_at)::int
```
This avoids needing a background job to update aging values.

---

## 8. Waiting On Others

**File:** `src/app/api/waiting-on/route.ts`

Returns sheet items where:
- ownerEmail IS NOT NULL
- ownerEmail != current user (case-insensitive)
- status != "done"

Includes dynamic isOverdue/isAtRisk computation.

---

## 9. Item Actions & Learning

**File:** `src/lib/services/learning.ts`

### Available Actions
| Action | Effect | Learning Signal |
|--------|--------|-----------------|
| **done** | status → "done" | Correct classification |
| **snooze** | status → "deferred" | Item real but not urgent now |
| **ignore** | status → "done" | False positive signal |

All actions:
1. Record in `userActions` table (audit trail)
2. Update item status + `statusChangedAt`

### Undo Pattern (Frontend)
- Item removed from UI immediately
- 5-second timeout before API commit
- Toast with "Undo" button cancels timeout and restores item

---

## 10. Daily Brief

**File:** `src/lib/services/daily-brief.ts`

### Sections Generated
1. **Top Due Items** (top 5): oldest non-done/non-deferred items
2. **Overdue Items**: agingDays > 3, type in (reply, approval)
3. **Meetings Needing Prep**: today's meetings with 2+ attendees or related items
4. **Slipping Commitments** (max 10): sheet items where isOverdue or isAtRisk

Stored as JSONB in `dailyBriefs` table.

---

## 11. Nudge Generation

**File:** `src/lib/services/nudges.ts`

### Rules
- Maximum 3 nudges per day
- De-duplicated: no duplicate nudges for same item in same day

### Priority Order
1. **Blocking Others**: Items with blockingWho set, agingDays >= 1
   - Reason: `"You are blocking {blockingWho} - this {type} has been waiting {agingDays} days"`
2. **Overdue**: Items type in (reply, approval), agingDays >= 3
   - Reason: `"This {type} is overdue by {agingDays} days"`

---

## 12. Cron Jobs

All require `Authorization: Bearer ${CRON_SECRET}` header.

| Job | Route | Schedule | Function |
|-----|-------|----------|----------|
| Gmail Sync | `/api/cron/gmail` | Periodic | Full sync + classify |
| Sheet Sync | `/api/cron/sheet` | Periodic | Fetch + fingerprint + upsert |
| Daily Brief | `/api/cron/brief` | Morning | Generate brief content |
| Nudges | `/api/cron/nudges` | Periodic | Generate up to 3 nudges |

All use `refreshStoredToken()` from `src/lib/cron-auth.ts` to get fresh OAuth tokens from the `appSettings` table.

---

## 13. Key Architectural Patterns

### Single-User Design
- `ALLOWED_USER_EMAIL` enforced at sign-in
- All queries scoped to authenticated user
- No multi-tenant logic anywhere

### Graceful Degradation
- Gmail classifier: falls back to regex heuristics if OpenAI fails
- Draft generator: falls back to basic text cleanup
- Meeting section: shows "No meetings" if calendar API fails
- Cron jobs: partial failures don't stop the run

### Optimistic UI + Undo
- Item actions: immediate UI removal, delayed API commit (5s), undo via toast
- Items reference stored in `useRef` for instant restore on undo

### Batch Queries
- Gmail classification: 10 concurrent threads
- Meeting enrichment: single query per table, indexed in-memory by email
- Sheet sync: fingerprint comparison to skip unchanged rows

### Dynamic vs Stored Values
- agingDays/daysInCurrentStatus: computed dynamically in SQL queries
- isOverdue/isAtRisk: computed dynamically for sheet items
- Stored values (agingDays column) exist but are superseded by dynamic computation

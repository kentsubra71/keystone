# Keystone MVP: Vision and Goals Document

## Executive Summary

Keystone is a **single-user digital executive assistant** designed to answer one critical question every morning and throughout the day:

> **"What is due FROM me right now?"**

The system exists to prevent the user from becoming a bottleneck by surfacing items that are blocking other people, and tracking two-way accountability.

---

## 1. Core Problem Statement

### The Bottleneck Problem
Executives and managers often become unintentional blockers. Work piles up in their inbox, approvals sit unsigned, decisions remain unmade, and follow-ups are forgotten. The people waiting on these actions can't proceed, creating cascading delays across the organization.

### Why Existing Tools Fail
- **Email clients** show all messages equally, not by urgency or who's blocked
- **Task managers** require manual entry and don't integrate with real workflows
- **Calendar apps** show meetings but not unresolved dependencies
- **Spreadsheets** track commitments but don't surface what's blocking whom

### Keystone's Solution
A read-only integration layer that:
1. Ingests signals from Gmail, Google Calendar, and a shared Google Sheet
2. Classifies items by actionability (not just priority)
3. Surfaces only items where **work is blocked until the user acts**
4. Provides one-touch actions (respond, approve, decide, dismiss)

---

## 2. Fundamental Principles

### 2.1 Single User, No Teams
Keystone serves exactly one user. There are no team views, permission systems, or multi-user features. This is intentional:
- Simpler architecture
- Faster iteration
- Privacy by design
- No consensus-building delays

### 2.2 Read-Only Integration
Keystone **never modifies source systems autonomously**:
- Never sends emails (only creates drafts for user review)
- Never edits the Google Sheet
- Never creates calendar events
- Never acts without explicit user command

### 2.3 Opinionated Classification
The system uses an **exhaustive, fixed taxonomy** for Due-From-Me items:

| Type | Definition | Example |
|------|------------|---------|
| **Reply** | A response is explicitly requested | "Can you confirm the timeline?" |
| **Approval** | A yes/no or sign-off is required | "Please approve this budget" |
| **Decision** | A choice between options is needed | "Option A or B for the vendor?" |
| **Follow-up** | The user committed to an action | "I'll check and get back to you" |

No other types are allowed. This constraint forces clarity.

### 2.4 Transparency Over Automation
Every flagged item must show:
- **Confidence score** (0-100%)
- **Rationale** in plain English ("Flagged because: contains 'please approve'")
- **Suggested action** ("Review and approve/reject")

The user must always understand **why** something was flagged.

---

## 3. User Experience Goals

### 3.1 The 8am Experience
The user opens Keystone at 8am and within **90 seconds** can:
1. See exactly what is Due From Them
2. Understand who is blocked
3. Know what has been waiting longest
4. Have a clear first action

### 3.2 The 10-Minute Resolution
From seeing an item to resolving it should take **<10 minutes**:
- Reply items: Dictate → Create draft → Done
- Approval items: Review → Approve/Reject → Done
- Decision items: Choose → Communicate → Done
- Follow-up items: Complete action → Report back → Done

### 3.3 The Primary View: TODAY
The default screen shows only three sections:

```
┌────────────────────────────────────────────┐
│  DUE FROM ME (NOW)                         │
│  Items where you are the blocker           │
├────────────────────────────────────────────┤
│  I AM BLOCKING OTHERS                      │
│  Critical items where someone is waiting   │
├────────────────────────────────────────────┤
│  WAITING ON OTHERS                         │
│  Items you delegated/assigned (from Sheet) │
└────────────────────────────────────────────┘
```

Each item displays:
- Type badge (Reply/Approval/Decision/Follow-up)
- Title/Subject
- Who is blocked
- Aging (days since first seen, days in current status)
- Rationale for flagging
- Suggested action
- Confidence score

---

## 4. Data Sources and What They Provide

### 4.1 Gmail (Read-Only)
**What Keystone reads:**
- Email headers (From, To, CC, Subject)
- Thread IDs and message IDs
- Snippets (first ~100 characters of body)
- Timestamps
- Labels

**What Keystone extracts:**
- Emails requiring a Reply (explicit requests)
- Approvals (sign-off language)
- Decisions (choice language)
- Follow-ups (user's own commitments)

**What Keystone NEVER does:**
- Send emails
- Modify labels
- Archive or delete messages

### 4.2 Google Calendar
**What Keystone reads:**
- Upcoming meetings
- Meeting attendees
- Meeting titles/descriptions

**What Keystone provides:**
- Links open items to upcoming meetings
- Flags meetings with unresolved dependencies
- Shows meetings needing prep in Daily Brief

### 4.3 Google Sheet (Read-Only Sync)
The shared Google Sheet is maintained by team members (reportees). Keystone uses it to track:

**What Keystone reads:**
- Commitment text
- Owner (name/label)
- Due date
- Status (free-text, normalized)
- Comments

**What Keystone provides:**
- Overdue item detection
- At-risk item detection (due within 3 days)
- "Waiting On Others" view
- Owner mapping to emails

**What Keystone NEVER does:**
- Write back to the Sheet
- Edit formulas or IMPORTRANGE outputs
- Modify any data

---

## 5. The Daily Brief

Generated once per day, readable in **<90 seconds**, containing:

1. **Top 3-5 Due-From-Me items** - Highest priority blockers
2. **Overdue approvals/replies** - Items past their expected response time
3. **Meetings needing prep today** - Meetings with open dependencies
4. **Slipping commitments** - Sheet items at risk of missing deadlines

---

## 6. Nudges and Cadence

### Maximum 3 Nudges Per Day
Keystone will not nag. Nudge types:

| Type | Trigger | Example |
|------|---------|---------|
| Blocking Others | Item aging >2 days with known blocker | "You're blocking Sarah on the budget approval" |
| Overdue | Approval/reply flagged >3 days | "Reply to vendor proposal is 4 days overdue" |
| Critical Due Soon | High-confidence item due within 24h | "Decision on contract needed by EOD" |

Every nudge must explain **why** it's being shown.

---

## 7. Learning and Scoring

### Bounded Learning Only
The system learns only from:
- User actions (done, snooze, delegate, ignore)
- Manual priority overrides

### What Learning Affects
- **Priority ranking** - Which items surface first
- **Confidence scoring** - How likely an item is actually Due-From-Me

### No Black Boxes
Every score and ranking must be explainable. The system must show:
- What signals influenced the score
- How user actions changed future scoring

---

## 8. Dictation-to-Draft Flow

For Reply and Follow-up items, Keystone provides voice-to-draft:

1. **User clicks Dictate** on a flagged item
2. **Browser Speech API** captures speech
3. **Transcript stored** (text only, never audio)
4. **Draft generated** with:
   - To/CC populated from thread + Owner Directory
   - Subject preserved
   - Body generated from transcript + thread context
5. **Draft saved to Gmail** - User reviews before sending

**Acceptance criteria:** User can create a usable draft in **<60 seconds**

---

## 9. Explicit Non-Goals

Keystone will NOT:

| Non-Goal | Rationale |
|----------|-----------|
| Act autonomously | User must always review before action |
| Send emails | Only drafts; user presses Send |
| Schedule meetings | Out of scope for MVP |
| Manage multiple users | Single-user system by design |
| Replace the Google Sheet | Sheet is source of truth, Keystone is read-only |
| Store audio recordings | Privacy; transcript only |
| Provide dashboards for vanity | No analytics for their own sake |

---

## 10. Definition of "Done"

The MVP is complete when:

1. User opens the app at 8am
2. Sees exactly what is Due From Them
3. Can act on it in <10 minutes
4. Can unblock other people the same day

---

## 11. Success Metrics

| Metric | Target |
|--------|--------|
| Time to first action | <90 seconds after opening |
| Items resolved per session | 3-5 items |
| False positive rate | <20% of flagged items marked "Ignore" |
| Draft creation time | <60 seconds |
| Daily engagement | User opens app every workday |

---

## 12. Tech Stack Summary

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14+ (App Router), React, TypeScript, Tailwind CSS |
| Backend | Next.js API Routes |
| Database | Neon.tech Postgres, Drizzle ORM |
| Auth | NextAuth.js with Google OAuth (domain-restricted) |
| APIs | Gmail API, Calendar API, Sheets API |
| Deployment | GCP Cloud Run |
| Speech | Web Speech API (browser-native) |

---

## 13. Build Order (Enforced)

1. Google SSO + DB Schema
2. Sheet Sync (Read-Only)
3. Manual Due-From-Me Dashboard
4. Gmail Ingestion + Classification
5. Dictate → Draft Email
6. Daily Brief
7. Nudges
8. Learning Signals

This order is non-negotiable. Each step builds on the previous.

# Cursor Build Contract – Executive Assistant (MVP)

## 1. Objective (Non‑negotiable)
Build a **single‑user digital executive assistant** whose primary job is to answer, every morning and throughout the day:

> **"What is due FROM me right now?"**

An item is *due from the user* **only if work is blocked until the user acts**.

This system must:
- Prevent the user from becoming a bottleneck
- Track two‑way accountability (what the user owes + what others owe the user)
- Integrate tightly with Gmail, Google Calendar, and a Google Sheet
- Be opinionated, minimal, and fast

No team UI. No autonomous sending. No dashboards for vanity.

---

## 2. User Model
- **Exactly one user**
- Auth via **Google Workspace SSO** (domain-restricted)
- No roles, permissions, or multi-user logic

### 2.1 Owner Directory (Admin-maintained)
Keystone must include an **Owner Directory** in Admin Settings that maps:
- Display name / label (e.g., "Ravi") → **email** (e.g., ravi@hurix.com)

If a sheet row lacks an owner or has an unmapped label:
- Set `owner_email = null`
- Flag the item as **Needs Owner Mapping**

---

## 3. Canonical Definitions (Must Be Used Verbatim)

### 3.1 "Due From Me"
An item is **Due From Me** if and only if:
- The user is the **last required dependency**, AND
- Someone else cannot proceed until the user acts


### 3.2 Allowed Due‑From‑Me Types (Exhaustive)
Every Due‑From‑Me item MUST be one of the following:

1. **Reply** – a response is explicitly requested
2. **Approval** – a yes/no or sign‑off is required
3. **Decision** – a choice between options is required
4. **Follow‑up** – the user committed to an action ("I'll check", "I'll get back")

No other task types are allowed.

---

### 3.3 Canonical Action Statuses (For Sheet + Keystone)
Keystone must distinguish **Not Started** vs **In Progress**.

Canonical statuses:
- **Not Started**
- **In Progress**
- **Blocked**
- **Done**
- **Deferred**

The sheet's free-text statuses must be mapped into the above set during ingest (mapping rules defined in the Sheet Ingest Contract). If a status is unknown, default to **Not Started** and flag it for review.

---

## 4. Core System Outputs (Hard Requirement)

### 4.1 Primary View: TODAY
The default screen MUST show only:

1. **Due From Me (Now)**
2. **I Am Blocking Others**
3. **Waiting On Others** (from Sheet)

Each item must display:
- Type (Reply / Approval / Decision / Follow-up)
- Who is blocked
- How long it has been outstanding
- **Aging** (days since first seen, days in current status)
- Why it was flagged (plain English)
- Suggested next action

Each **Reply** or **Follow-up** item must include a **Dictate Draft** action.

---

### 4.2 Daily Brief (Generated Once Per Day)
A concise brief containing:
- Top 3–5 Due‑From‑Me items
- Overdue approvals/replies
- Meetings needing prep today
- Slipping commitments from the Sheet

Readable in **<90 seconds**.

---

## 5. Google Integrations (Mandatory)

### 5.1 Gmail (Read‑Only)
The system must:
- Ingest headers, thread IDs, snippets, timestamps
- Detect Due‑From‑Me candidates using heuristics + scoring

**The system must never auto‑send emails.**

Drafts are allowed. User must review.

---

### 5.2 Google Calendar
- Pull upcoming meetings
- Attach relevant open Due‑From‑Me items to meetings
- Flag meetings where unresolved dependencies exist

---

### 5.3 Google Sheet (Read-Only Sync)

The shared Google Sheet is a **read-only reference feed** for Keystone. It is primarily maintained by reportees in their source sheets; Keystone uses it as a guide to follow up and track commitments.

Keystone must:
- Pull commitments, owners, due dates, status, and comments from the chosen tab(s) (preferably **Sorted**) 
- Normalize and store items in Keystone DB
- Detect overdue / at-risk items and surface them as **Waiting On Others**
- Support manual annotations inside Keystone (notes, follow-up timestamps) **without writing back** to the Sheet

Keystone must NOT:
- Write back to this aggregator workbook
- Attempt to edit formula-driven ranges (e.g., IMPORTRANGE outputs)

Keystone should minimize drift by:
- Recording `last_synced_at` per item
- Tracking `source_row_fingerprint` to detect changes since last sync
- Maintaining `first_seen_at` and `last_seen_at` for aging and disappearance detection

---

### 5.4 Gmail Drafting via Dictation (Mandatory)

Keystone must provide **dictation-to-draft** for emails.

Scope:
- Draft **replies** and **follow-ups** (at minimum)
- Tone: **neutral/clean** by default (no "my voice" required for MVP)
- Safety: **draft only**, never send

UX:
- A mic button on Due-From-Me items of type **Reply** and **Follow-up**
- On completion, Keystone generates a Gmail draft with:
  - To/CC populated from the thread (and Owner Directory when needed)
  - Subject preserved
  - Body generated from transcript + thread snippet

Implementation (MVP):
- Use browser speech-to-text (e.g., Web Speech API) to produce a transcript
- Store transcript (text) only; do **not** store audio
- Call drafting service to convert transcript → email draft

Acceptance:
- From a flagged item, user can create a usable Gmail draft in **<60 seconds**

---

## 6. Nudges & Cadence

- Max **3 nudges per day**
- All cadence rules live in **Admin Settings**
- Sheet sync cadence: **every 6 hours** (configurable later)

Allowed nudge types:
1. You are blocking others
2. Approval / reply overdue
3. Critical item due soon

Nudges must always explain **why**.

---

## 7. Learning & Scoring (Bounded)

No black boxes.

The system may learn only via:
- User actions (done, snooze, delegate, ignore)
- Manual overrides

Learning is limited to:
- Ranking priority
- Confidence scoring

Every item must show:
- Confidence score
- Rationale ("flagged because…")

---

## 8. Tech Stack (Required)

- **Frontend**: Next.js + React
- **Backend**: Next.js API routes (initially)
- **DB**: Neon.tech Postgres (Docker locally)
- **Deployment**: GCP (Cloud Run preferred)
- **Auth**: Google Workspace OAuth

---

## 9. Explicit Non‑Goals

The system must NOT:
- Act autonomously
- Send emails
- Schedule meetings
- Manage users
- Replace the Google Sheet
- Store raw audio recordings

---

## 10. Build Order (Enforced)

1. Google SSO + DB schema
2. Sheet sync (read-only)
3. Manual Due-From-Me dashboard
4. Gmail ingestion + classification
5. **Dictate → Draft Email**
6. Daily Brief
7. Nudges
8. Learning signals

Skipping order is not allowed.

---

## 11. Definition of "Done"

The MVP is complete when:
- The user can open the app at 8am
- See exactly what is Due From Them
- Act on it in <10 minutes
- And unblock other people the same day

---

## 12. Reference Docs (Must Be Saved)

The following must be stored and referenced by Cursor during build:
- This contract
- Google Sheet schema + sample rows
- Gmail labeling rules (if any)
- Writing‑voice prompt / examples
- OAuth scopes list

These are **binding context**, not suggestions.

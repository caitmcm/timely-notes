# Timely Notes — Design Document

## Overview

Timely Notes is a note-taking application organized around the clock. Notes are markdown documents, and the primary UI metaphor is a scrollable schedule view where each hour offers a place to attach a quick note.

The use case, in one sentence:

> **On this day at this time, I want to read or record some plain text information relevant to right now.**

The bet is that **the slot is the index**. In most note systems the expensive part is filing and retrieval — naming, foldering, tagging; here a note's address is the time it belongs to, and the schedule view *is* the index. Nothing is ever named or filed. Choosing a Schedule (`s1`/`s3`/`s6`) changes the granularity you read at without changing what was written.

What it is deliberately not: a calendar of tasks and todos, with the actual writing living in a separate markdown system. It is a day view for the *hour*, not the day.

This document captures the **goals** for the project. It is not an implementation plan — no architectural decisions beyond what's stated here have been made yet.

## Domain Model

The business domain is a simple hierarchy:

- **Instance** — the user's account / overall use of the app. An Instance has many Schedules.
- **Schedule** — a user-created container (vault-like, in the spirit of Obsidian) for a given spanning period (1-hour, 3-hourly, or 6-hourly). A Schedule has many Notes. Creating a Schedule means selecting its spanning period; the **short name** is not user-entered — it's the identifier for that period setting: `s1` (1-hourly), `s3` (3-hourly), `s6` (6-hourly). So at most one Schedule exists per spanning period.
- **Note** — a markdown document created within a specific Schedule, at a specific date and slot. A candidate naming convention is `[schedule shortname]-yyyy-mm-dd-hh`, with the shortname first to improve searchability.

Rather than a single global granularity setting, a note is created within whichever Schedule is currently active, and is displayed only on that Schedule's view. The user can switch between Schedules, and each Schedule only shows the notes created within it. This avoids ever needing to re-bucket or reinterpret a note's slot: a 6-hourly note stays a 6-hourly note on its own Schedule, even if the user later switches to and creates notes in a 3-hourly Schedule.

## Goals

### Backend (`TimelyNotes.Backend`)

- Provide endpoints for markdown notes: **List** (notes for the user's selected Schedule and visible date range), **Get by Id**, **Create** and **Update**. No delete for now. A note's *content* is editable after creation; the slot it sits in is not — see the timestamp rules below.
- Provide endpoints for **Schedules**: create a Schedule (by selecting a spanning period), and list Schedules.
- Wire up endpoints using **FastEndpoints**.
- Use the **repository pattern** to abstract reads/writes to the data store, so the storage mechanism can change without touching endpoint logic.
- Start with an **in-memory** repository implementation as a placeholder.
- Data layer/persistence choice (e.g. a real database) is an open question to be figured out later — the repository abstraction should make that swap possible without a rewrite.
- Each note carries **three timestamps, with one job each** — this is an hourly diary, not a once-a-day journal entry:
  - **`OccursAt`** — the slot the note is *for*. The only timestamp the application reasons about: it places the note on its Schedule and drives all filtering and ordering. Set at creation and **immutable** thereafter, so a note never moves through time.
  - **`CreatedAt`** — when the note was written. Server-set, audit only.
  - **`ModifiedAt`** — when the note was last changed. Server-set, audit only.
- Each note belongs **immutably** to exactly one **Schedule**, and is slotted according to that Schedule's spanning period (1-hour by default; 3-hourly/6-hourly as user-defined Schedules). A note's Schedule assignment never changes after creation.
- Notes **persist across days** — history is browsable, not reset daily, and slots ahead of now are writable as well as readable.
- **List** answers for a **date range**, not a single day, so the frontend can fetch a window at a time as the user scrolls.

### Frontend (`timely-notes-ui`)

- Display a **scrollable schedule view** as the primary view — a vertical list of time slots (hourly by default) for a given day, with a note icon shown next to any slot that already has a note.
- Support switching between **Schedules**, and support browsing **in both directions** within a Schedule — continuous scroll back through history and forward into future days, unbounded either way, with a **Today** button to jump back to the current slot.
- Provide a button to **create a note** within the current Schedule. Notes can be created against **any** slot the user can scroll to, past or future — a future note is a briefing for your future self (what you want in front of you at that hour), not a task or a reminder. There is no completion state and no notification.
- Creating a note opens a **pop-up window** for quickly capturing markdown text.
- **Existing notes are editable.** The app encourages *new note, right now* — the create button always writes into the current slot — but a user who comes back at 3:20pm to correct or clarify the note they wrote in the 12pm–3pm window can do so. Editing changes **content only**: `OccursAt` is fixed, so a note can never be moved to a different slot or Schedule. Expand now, tighten later if it proves to need it.
- **First-run experience**: a new Instance has no Schedules yet, so the landing page prompts the user to create one. Flow: open the app for the first time → create a Schedule → start taking notes.

## Tech Stack Notes (from video research)

Exploratory ideas from a tech stack video — none of these are commitments yet, just options to evaluate against the open questions below.

- **Database**: Postgres, using its document-db (JSONB) capabilities rather than a separate NoSQL store. Worth exploring as a candidate for the persistence layer, but not decided.
- **Deployment**: GitHub Actions for CI/CD, with a **separate pipeline per project** (backend and frontend built/deployed independently).
- **Authentication**: Explore Keycloak as an OAuth2 provider, if/when auth support is added.

## Open Questions

- Long-term persistence layer for notes (file system, SQL, NoSQL, etc.) — see Postgres/JSONB note above.
- Authentication/multi-user support — not currently in scope per `CLAUDE.md`; Keycloak is a candidate to revisit if that changes.
- CI/CD setup — not yet configured; GitHub Actions with per-project pipelines is a candidate.
- **Concurrent edits to one note.** Now that notes are editable, two tabs open on the same note is possible even single-user. Proposal: **last-write-wins**, with the server setting `ModifiedAt` on every update and the client never sending it. Needs deciding before the Update slice — adding optimistic concurrency (an ETag or a `ModifiedAt` precondition) is cheap now and awkward once auth and multi-user arrive.
- **Retrieval when you don't remember *when*.** Time is currently the only index: no search, no tags, no titles. That is fine while the app is used for *right now*, and becomes the main weakness the moment the archive is worth mining. Search over note content is the obvious answer; it is not scoped yet.
- **Standing reference material.** Every note is pinned to one instant, so anything recurring ("the list I need at every Monday standup") has no home and stays in whatever system it lives in today — which partly reopens the two-system split this app exists to close. Options if it matters: recurring notes, pinned notes, or an explicit decision that this is a log and references belong elsewhere.
- **Relationship to the user's real calendar.** A time-addressed app competes for the slot Google Calendar already occupies. Showing calendar events read-only as a backdrop, with notes attached to the hour, would make this the *notes layer on your calendar* rather than a second calendar. Constrains nothing today; recorded because it is a genuine fork in the road.

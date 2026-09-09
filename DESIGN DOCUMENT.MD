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
- **Schedule** — a user-created container (vault-like, in the spirit of Obsidian) for a given spanning period (1-hour, 3-hourly, or 6-hourly). A Schedule has many Notes. Creating a Schedule means selecting its spanning period, and **the Schedule *is* that span**: it is stored as the number of hours (1, 3, 6) and spelled `s1`/`s3`/`s6` on the wire. At most one Schedule exists per spanning period, so no two overlap the same periods and the span is a sound identity. The only customisation ever likely is another divisor of 24, such as 2 or 12.
- **Note** — a markdown document created within a specific Schedule, on a specific calendar day, in a specific **period** of that day. **A period holds at most one note**, and the period *is* the note's identity: a note is addressed by `(Schedule, Day, PeriodOrdinal)` and by nothing else. There is no surrogate id. The ordinal is 1-based and spelled `p{n}`, so `s3`'s 09:00–12:00 block is `p4` and the URL reads `/api/schedules/s3/notes/2026-09-05/p4`.

Rather than a single global granularity setting, a note is created within whichever Schedule is currently active, and is displayed only on that Schedule's view. The user can switch between Schedules, and each Schedule only shows the notes created within it. This avoids ever needing to re-bucket or reinterpret a note's slot: a 6-hourly note stays a 6-hourly note on its own Schedule, even if the user later switches to and creates notes in a 3-hourly Schedule.

## Goals

### Backend (`TimelyNotes.Backend`)

- Provide endpoints for markdown notes: **List** (notes for the user's selected Schedule and visible date range), a **PUT** upsert on the period address, and a **DELETE** on that same address. No **Get by Id** and no create/update split — there is no id, and a write to a period either creates the note there or replaces its content. A note's *content* is editable after creation; the period it sits in is not — it is the address.
- **Delete is offered, and restricted to nothing.** It removes the note in a period, empty or not — the client decides when a note is worth keeping. Autosave is its first caller, because writing every change means the app needs an honest way to undo the note it created; *delete this note* is the feature that will want it next.
- **An empty note is never returned by a read route.** The store and the readable set are deliberately not the same thing: a record with no content is one waiting to be collected, not a note anyone can read. This is what lets the client's delete-on-close be best-effort — a record it could not reach is already invisible to every client.
- Provide endpoints for **Schedules**: create a Schedule (by selecting a spanning period), and list Schedules.
- Wire up endpoints using **FastEndpoints**.
- Use the **repository pattern** to abstract reads/writes to the data store, so the storage mechanism can change without touching endpoint logic.
- Start with an **in-memory** repository implementation as a placeholder.
- Data layer/persistence choice (e.g. a real database) is an open question to be figured out later — the repository abstraction should make that swap possible without a rewrite.
- A note carries **a period and two audit stamps** — this is an hourly diary, not a once-a-day journal entry:
  - **`Day` + `PeriodOrdinal`** — the slot the note is *for*, and its address. Not a timestamp: a calendar date and an integer, so there is no instant to reinterpret in another timezone. Immutable, and the only fields placement, ordering and filtering use. This replaces the earlier `OccursAt` instant, which let *rendering* and *addressing* disagree and so made a second, unreachable note in one period constructible.
  - **`CreatedAt`** — when the note was written. Server-set, audit only.
  - **`ModifiedAt`** — when the note was last changed. Server-set, audit only.
- **Concurrent edits are last-write-wins, decided.** The server sets `ModifiedAt` on every write and the client never sends it. Autosave makes collisions likelier and optimistic concurrency *more* annoying, not less — a save that fails mid-keystroke cannot ask the user anything useful. Optimistic concurrency (an ETag or a `ModifiedAt` precondition) is the thing to revisit alongside auth and multi-user.
- **`CreatedAt`/`ModifiedAt` are in the server's zone and are not rendered.** If either is ever displayed it is labelled as server time rather than quietly reinterpreted into the viewer's — reinterpreting it would put an instant back into the part of the model the period key clears.
- **The server has no timezone.** It stores a date and an integer, and reads a clock only for those two audit stamps. No route takes an offset. The period grid is the viewer's local one, and the record is explicitly a claim about the writer's local calendar — which is what a single user with one calendar means. Multi-timezone support would need a Schedule that carries its own IANA timezone.
- Each note belongs **immutably** to exactly one **Schedule**, and is slotted according to that Schedule's spanning period (1-hour by default; 3-hourly/6-hourly as user-defined Schedules). A note's Schedule assignment never changes after creation.
- Notes **persist across days** — history is browsable, not reset daily, and slots ahead of now are writable as well as readable.
- **List** answers for a **date range**, not a single day, so the frontend can fetch a window at a time as the user moves between days.
- Provide a **per-day note count** endpoint over a range of up to six weeks, so a month view can show which days already have notes without downloading a month of markdown. Both read routes take a half-open range of plain calendar dates.

### Frontend (`timely-notes-ui`)

- Display a **scrollable schedule view** as the primary view — a vertical list of time slots (hourly by default) for a given day, with a note icon shown next to any slot that already has a note.
- Support switching between **Schedules**, and support browsing **in both directions** within a Schedule, in **two layers**:
  - the schedule view holds the focus day and its two neighbours — *yesterday, today, tomorrow* while it is following the clock — so the scroll is short, fixed-length and cheap, and the reading context around now is always there;
  - a **month view**, reached from either end of that scroll, is how the user goes further: a square calendar grid marking the days that already have notes, where picking a day re-points the schedule at that day and its neighbours.
  History and future days are reachable without limit; it is the *scroll* that is bounded, not the browsing. A **Today** button returns the view to the current slot from wherever the calendar has sent it.
- Provide a button to **create a note** within the current Schedule. Notes can be created against **any** slot the user can scroll to, past or future — a future note is a briefing for your future self (what you want in front of you at that hour), not a task or a reminder. There is no completion state and no notification.
- Creating a note opens a **pop-up window** for quickly capturing markdown text.
- **Existing notes are editable.** The app encourages *new note, right now* — the create button always writes into the current slot — but a user who comes back at 3:20pm to correct or clarify the note they wrote in the 12pm–3pm window can do so. Editing changes **content only**: the period is the address, so moving a note to a different slot or Schedule is not forbidden but unspellable. Expand now, tighten later if it proves to need it.
- **An accidental note leaves no trace, and tidying up is never the user's job.** In Obsidian a mis-pressed `Ctrl+N` leaves an `Untitled` file to go and delete by hand — a chore the tool created, handed to the user, for something they did not mean to do. Nothing is written until there is something to write, clearing a note is saved like any other change so changing your mind sticks without a confirmation step, and the record goes when the dialog closes. There is no *Untitled* to find and no list of empties to work through: **the user never performs housekeeping the app could have avoided creating.** Where a rule costs an extra request or a little more code, that is what it buys.
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
- ~~**Concurrent edits to one note.**~~ Decided in `NoteAutosave.MD`: last-write-wins, recorded with the timestamp rules above. Optimistic concurrency is deferred to auth and multi-user, and the second tab still silently wins in the meantime.
- **Retrieval when you don't remember *when*.** Time is currently the only index: no search, no tags, no titles. That is fine while the app is used for *right now*, and becomes the main weakness the moment the archive is worth mining. Search over note content is the obvious answer; it is not scoped yet.
- **Standing reference material.** Every note is pinned to one instant, so anything recurring ("the list I need at every Monday standup") has no home and stays in whatever system it lives in today — which partly reopens the two-system split this app exists to close. Options if it matters: recurring notes, pinned notes, or an explicit decision that this is a log and references belong elsewhere.
- **Relationship to the user's real calendar.** A time-addressed app competes for the slot Google Calendar already occupies. Showing calendar events read-only as a backdrop, with notes attached to the hour, would make this the *notes layer on your calendar* rather than a second calendar. Constrains nothing today; recorded because it is a genuine fork in the road. The month view added above is our own grid over our own notes — it is navigation, not a second calendar, and it is the obvious place an external feed would eventually be shown if that fork is taken.

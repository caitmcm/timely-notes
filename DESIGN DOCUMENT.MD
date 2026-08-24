# Timely Notes — Design Document

## Overview

Timely Notes is a note-taking application organized around the clock. Notes are markdown documents, and the primary UI metaphor is a scrollable schedule view where each hour offers a place to attach a quick note.

This document captures the **goals** for the project. It is not an implementation plan — no architectural decisions beyond what's stated here have been made yet.

## Domain Model

The business domain is a simple hierarchy:

- **Instance** — the user's account / overall use of the app. An Instance has many Schedules.
- **Schedule** — a user-created container (vault-like, in the spirit of Obsidian) for a given spanning period (1-hour, 3-hourly, or 6-hourly). A Schedule has many Notes. Creating a Schedule means selecting its spanning period; the **short name** is not user-entered — it's the identifier for that period setting: `s1` (1-hourly), `s3` (3-hourly), `s6` (6-hourly). So at most one Schedule exists per spanning period.
- **Note** — a markdown document created within a specific Schedule, at a specific date and slot. A candidate naming convention is `[schedule shortname]-yyyy-mm-dd-hh`, with the shortname first to improve searchability.

Rather than a single global granularity setting, a note is created within whichever Schedule is currently active, and is displayed only on that Schedule's view. The user can switch between Schedules, and each Schedule only shows the notes created within it. This avoids ever needing to re-bucket or reinterpret a note's slot: a 6-hourly note stays a 6-hourly note on its own Schedule, even if the user later switches to and creates notes in a 3-hourly Schedule.

## Goals

### Backend (`TimelyNotes.Backend`)

- Provide endpoints for markdown notes: **List** (notes for the user's selected Schedule and visible day), **Get by Id**, **Create**. No update/delete for now — notes are not editable once created.
- Provide endpoints for **Schedules**: create a Schedule (by selecting a spanning period), and list Schedules.
- Wire up endpoints using **FastEndpoints**.
- Use the **repository pattern** to abstract reads/writes to the data store, so the storage mechanism can change without touching endpoint logic.
- Start with an **in-memory** repository implementation as a placeholder.
- Data layer/persistence choice (e.g. a real database) is an open question to be figured out later — the repository abstraction should make that swap possible without a rewrite.
- Each note is both **date-stamped and time-stamped** (a **created at** time, which places it in its Schedule) and a **modified at** time — this is an hourly diary, not a once-a-day journal entry.
- Each note belongs **immutably** to exactly one **Schedule**, and is slotted according to that Schedule's spanning period (1-hour by default; 3-hourly/6-hourly as user-defined Schedules). A note's Schedule assignment never changes after creation.
- Notes **persist across days** — history is browsable, not reset daily.

### Frontend (`timely-notes-ui`)

- Display a **scrollable schedule view** as the primary view — a vertical list of time slots (hourly by default) for a given day, with a note icon shown next to any slot that already has a note.
- Support switching between **Schedules**, and support browsing to **past days** within a Schedule.
- Provide a button to **create a note** within the current Schedule.
- Creating a note opens a **pop-up window** for quickly capturing markdown text.
- No editing of existing notes from the UI — notes are write-once.
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

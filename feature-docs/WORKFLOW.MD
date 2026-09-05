# Feature workflow

How work is defined, implemented and recorded in this repo. Read this before writing a
specification or starting on one.

## The rule in one line

**One feature, one specification document, end to end.** It is written in
`feature-docs/todo/`, ticked off in place while the feature is built, annotated with
implementation notes, and moved to `feature-docs/done/` when it is finished.

## What counts as a feature

A feature is a single unit of requirements that the user has defined. It may span both
applications or sit inside one of them:

- a backend endpoint and everything the stack needs to serve it,
- a frontend design across several components,
- a correction to existing behaviour in either project.

Scope is set by the requirements, not by the project boundary. If the requirements touch
`TimelyNotes.Backend` and `timely-notes-ui`, both are covered by the same document.

## Folders

```
feature-docs/
├── WORKFLOW.MD     # this file
├── todo/           # specifications not yet finished — usually one
└── done/           # completed specifications, kept as the record
```

`feature-docs/done/GetNotesBySchedule.MD` (small, backend-only) and
`feature-docs/done/FrontendSkeleton.MD` (large, frontend-wide) are the worked examples of
the format and the level of detail expected. Match them.

An empty `todo/` means the last feature is done and the next one needs specifying — derived
from `DESIGN DOCUMENT.MD` — before any code is written.

## 1. Specify — `feature-docs/todo/<FeatureName>.MD`

The user defines the requirements; the specification writes them down in a form an agent can
execute and verify. Name the file after the feature in PascalCase, no prefix
(`CreateNote.MD`, not `TODO-CreateNote.MD`).

Sections, in order:

- **Goal** — what the feature is, in prose, including anything the mockup or conversation
  settled. State it plainly enough that "done" is unambiguous.
- **Scope decisions** — the choices already made, and what is deliberately *not* being done.
- **Architecture** — where the code lands (files, folders, layers) and how data flows.
- **Checklist** — the actual work, grouped in numbered sections, every item a `- [ ]` box.
  Each item is one testable step, phrased so ticking it is a statement of fact. Order the
  sections so prerequisites come first, and note the tests each item needs.
- **Verify** — the end-to-end checks that prove the feature works: the test commands, the
  build and lint commands, and the manual run-through against both apps where relevant.
- **Deferred** — everything adjacent that this feature is not doing, so the boundary is
  explicit and the next specification has a starting point.
- **Implementation notes** — left empty at specification time; the agent fills it in.

## 2. Implement — TDD, per `CLAUDE.md`

Every feature is tested. Following the TDD rule in `CLAUDE.md`, each checklist item starts
with a failing test, then the minimum code to pass it, then a refactor. This applies to all
new domain code in both projects — models, endpoints, components, hooks, pure functions —
not just to bug fixes. Backend tests are xUnit v3 in `TimelyNotes.API.Tests`; frontend tests
are Vitest + React Testing Library, sitting next to the code they cover.

A checklist item that cannot be expressed as a test is either a setup step (say so) or is
specified too vaguely to implement.

## 3. Tick the boxes as the work lands

The implementing agent edits the specification in `todo/` **while** the feature is built,
turning `- [ ]` into `- [x]`. A box is ticked only when the code exists **and** its tests
pass — not when it is written and untested.

Tick it at the moment the test goes green, not in a batch at the end. The document is the
record of progress, and a record written only at the end is not a record: it is a
reconstruction, and it is lost if the session is interrupted or its context is compacted.

Before the feature is called complete, every box in the document is ticked and the **Verify**
section has actually been run. Any requirement that turns out to be wrong, unnecessary or
blocked is not silently dropped: amend the checklist item to say what happened, and record
the reasoning in the implementation notes.

## 4. Append implementation notes as they are learnt

Anything the user needs to look at goes in the **Implementation notes** section at the bottom
of the same document:

- where the finished work departs from the plan, and why,
- decisions the specification left open that the implementation had to settle,
- constraints, gotchas or follow-up work discovered along the way,
- a closing line stating what was verified and the final test counts.

Write each note when the thing happens — when the decision is made, when the gotcha is hit —
rather than saving them up. A decision that is settled but unwritten exists only in the
session, and everything that exists only in the session is temporary.

`FrontendSkeleton.MD` shows the expected register: short, specific, each note explaining a
real departure rather than narrating the work.

**Do not create a second document.** No `<Feature>-notes.MD`, no `<Feature>-review.MD`, no
`TODO-<Feature>.MD`. The specification owns the feature end to end — findings, notes and
corrections are appended to it, and it is the only file that describes the feature.

## 5. Compact freely — the specification is the memory

Sections 3 and 4 exist so that a long session can reclaim its context without losing the
thread. Once the document is current, an agent should run `/compact` rather than working on
in a nearly-full context: what matters has already been written down, and the room bought
back is spent on the remaining work.

- **Update the document first, compact second.** Compaction summarises the transcript and
  discards the rest; anything only in the transcript is gone. Ticking the boxes and writing
  the notes is what makes that safe.
- **Say what to keep.** `/compact` takes instructions — name the spec being worked, the
  checklist section in flight, and any failing test still to be fixed. An untargeted compact
  is what loses the thread.
- **Re-read the specification afterwards.** It is the ground truth; the summary is not.
  Resume from the first unticked box rather than from what the summary implies.
- **Do not compact mid-step.** Finish the red-green-refactor cycle in hand, record it, then
  compact. A half-written change with no test result yet is exactly the state a summary
  renders unrecoverable.

A session that has to be handed to a fresh agent should need nothing but the specification,
`CLAUDE.md` and the code. If it would need more than that, the missing part belongs in the
document.

## 6. Move to `done/`

When every box is ticked, the Verify section has passed and the notes are written, move the
file from `feature-docs/todo/` to `feature-docs/done/` — unchanged apart from the notes. It
is kept as the record of what was built and why; it is never deleted.

Finally, update the **Current state** section of `CLAUDE.md` so it describes the repo as it
now stands.

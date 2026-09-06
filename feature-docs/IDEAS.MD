# Ideas

Unspecified. Things worth looking into, not yet fleshed out into feature documents. Nothing here
is committed to; an idea leaves this file when it becomes a `todo/<FeatureName>.MD` written to the
shape in `WORKFLOW.MD` — or when it is dropped.

## Schedule selection behind a burger menu

Today `SchedulePicker` sits in the open. The Schedule is chosen rarely — s3 is the default and most
sessions never change it — so the picker spends its life occupying toolbar space for a decision
already made. Move it behind a three-dash menu control: reasonably hidden, one tap away, and the
toolbar left to *Calendar* and *Go to today*.

Open:

- Where the menu lives, and whether other toolbar actions move into it too or it holds only the
  Schedule.
- Whether the current Schedule stays visible somewhere once the picker is hidden — the period grid
  implies it, but not by name.
- Keyboard and screen-reader shape of the menu; the picker's existing roles cannot just move.
- What the E2E page object does with it — every Schedule-switching spec currently reaches straight
  for the picker.

## The `impeccable` UI design skill

<https://github.com/pbakaus/impeccable> — a skill for UI design. Look at what it does and whether it
earns a place in this repo's workflow.

Open:

- What it actually produces, and whether that fits a project whose UI decisions are already written
  down in `feature-docs/done/`.
- Whether it is a one-off pass over the current UI or something to keep installed.

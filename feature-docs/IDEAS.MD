# Ideas

Unspecified. Things worth looking into, not yet fleshed out into feature documents. Nothing here
is committed to; an idea leaves this file when it becomes a `todo/<FeatureName>.MD` written to the
shape in `WORKFLOW.MD` — or when it is dropped.

## The `impeccable` UI design skill

<https://github.com/pbakaus/impeccable> — a skill for UI design. Look at what it does and whether it
earns a place in this repo's workflow.

Open:

- What it actually produces, and whether that fits a project whose UI decisions are already written
  down in `feature-docs/done/`.
- Whether it is a one-off pass over the current UI or something to keep installed.

## A mobile app that keeps notes as files, the Obsidian way

A second architecture, alongside the current one rather than replacing it:

| | Pieces | Runs as | Store | Sign-in |
| --- | --- | --- | --- | --- |
| **Current** | Web UI + API | A desktop browser, or a PWA installed on the phone (`AndroidPwa.MD`) | Postgres in the cloud | Auth0 |
| **Mobile** | A bundled APK (Capacitor), no API | An app installed on the phone | Markdown files in a folder on the device | The device's own lock |

**The mobile app works like Obsidian.**
- Notes are plain markdown files in a folder the user chooses.
- The app reads and writes them with filesystem operations, and watches the folder for changes
  made by anything else.
- Moving notes between devices is the job of whatever syncs the folder, such as Syncthing, a cloud
  drive or Obsidian Sync.
- The app never talks to the API.

**Why Capacitor.** A web page on Android cannot write files that other apps can see: Chrome there
has no File System Access API, and a PWA's own storage (IndexedDB, OPFS) is invisible to other
apps. Capacitor's `Filesystem` plugin can. Obsidian's mobile app is built on Capacitor.

**Device authentication signs the user in.** The phone's lock screen is the authentication, so
there is no account and no Auth0.

Open:

- **Code shared with `timely-notes-ui`.** The two could share the grid, the dialogs, autosave and
  `domain/`, with each build choosing its own store. Or the mobile app could be a project of its
  own.
- **Watching on Android.** The `Filesystem` plugin reads and writes but does not watch. The options
  are polling, rescanning on resume, or a native plugin.
- **The file layout.**
  - A note's address `(Schedule, Day, PeriodOrdinal)` maps onto a path such as
    `s3/2026-09-05/p4.md`.
  - The open part is what the app does with a file that doesn't fit the layout.
- **An app-level lock.** It could rely on the phone's lock screen alone, or also ask for a
  biometric or PIN prompt when it opens, through a plugin.

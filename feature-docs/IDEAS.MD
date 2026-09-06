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

## A mobile interface

The intention: Timely Notes usable on a phone. The period grid is a glance-and-jot interface and
the phone is where the glancing happens. Everything below is implementation detail underneath that
sentence — the idea is not tied to any particular library, and Expo, which is where this started,
turns out not to be the shape of it.

Two separable pieces, worth keeping apart because only one of them is a feature:

**1. The interface itself.** This is design work and a real specification when it comes. `App.css`
has no `@media` rule anywhere; the layout is rem-based and the dialogs are `width: min(…, 92vw)`,
so it likely narrows without breaking, but nothing has been designed for a small screen or for a
finger. Open: whether three day sections still make sense on a phone or the focus day carries it
alone; whether the toolbar survives a narrow viewport; hit sizes on `PeriodRow`; `@mdxeditor/editor`
against a phone keyboard, which is the piece most likely to force a decision; and what replaces the
Playwright lane's desktop viewport — its device emulation is the cheap first answer.

**2. Getting it onto the home screen.** A deployment step, downstream of the build that already
exists, changing nothing about desktop development: `run-dev.ps1`, the Vite dev proxy, Vitest and
Playwright all stay as they are. On Android an installed PWA is the whole of it — Chrome offers to
install, a WebAPK gives it a launcher icon and a task-switcher entry, and it runs without browser
chrome. That is two files in `timely-notes-ui/public/` (a manifest with icons and
`display: "standalone"`, and a service worker) plus a `<link>` in `index.html`; none of it exists
today, and the SWA already serves the HTTPS it requires. Expo is a fallback to reopen only for
something a PWA cannot do — a store listing, push notifications, native share — and even then the
shape would be a WebView around the deployed URL, since a React Native port means replacing every
component and the markdown editor.

Open on the second piece:

- Icons. `public/favicon.svg` is all there is; a manifest wants raster sizes and a maskable one.
- What the service worker caches, and what it must never cache. Hashed Vite assets are safe;
  `/api` responses are not — a stale note list is worse than an error.
- Offline. Cached assets mean it launches with no signal, but every note comes from the API, so
  what an offline launch shows is undecided, and is really a question for `NoteAutosave`.
- Backgrounding. `useNow`, `dayKeyOf(now)` and the device timezone hold as written, but waking a
  backgrounded installed app is a longer, rougher resync than tab visibility.

The interface is the part with the value and can be built and tested on the desktop, at a narrow
viewport, before anything is installed anywhere. The install is small and can follow.

# Timely Notes

> Like daily notes, but a little more… **timely**.

A note-taking app organised around the clock.

## The pitch

Daily-note systems give you one page per day. By four in the afternoon that page is a wall of
text, and the one thing you wanted back — _what did I write during the stand-up?_ — has nowhere
to be found. So you start naming things. Then foldering them. Then tagging them. The expensive
part of a note system is not writing the note; it is filing it.

Timely Notes files the note for you. Its address is the time it belongs to, and nothing else: the
one from the stand-up is the one written between nine and twelve on Tuesday. You find it by
remembering roughly when it happened.

The day is cut into slots of one, three or six hours, and you choose how fine to make them. Change
your mind later and nothing is re-filed — you are just reading the same day at a different
resolution. Each slot holds one note, so there is never a second one to lose.

The domain model, including the parts still open, is in
[DESIGN DOCUMENT.MD](DESIGN%20DOCUMENT.MD).

## What it does so far

A working wireframe you can read but not yet write to. Notes come from a seeded in-memory store,
and the app is built around them: the day you are on and its neighbours scroll past under a
toolbar, the view follows the clock and turns over at midnight by itself, and a calendar shows you
which days have anything on them so you can jump to one. Slots are addressed by time throughout,
and the editor opens on a slot rather than on a note.

## The tech

Two independent projects with no shared build, wired together in development only by the Vite dev
proxy.

**[API](TimelyNotes.Backend/) — .NET 10, FastEndpoints, xUnit v3.** REPR endpoints rather than MVC
controllers, FluentValidation per request, and the repository pattern.

**[UI](timely-notes-ui/) — React 19, TypeScript, Vite 8.** The time logic lives in a pure domain
layer, unit tested with Vitest, acceptance tested with Playwright. Markdown editing is `@mdxeditor/editor`.

## The development process

Built with an AI agent held to a written process rather than prompted ad hoc.

- [feature-docs/](feature-docs/) — one document per feature, written before any code exists. It
  carries the goal, the scope decisions, the architecture and a checklist that is ticked off as
  each test goes green. Decisions taken during the build are appended to the same document, which
  then moves from `todo/` to [`done/`](feature-docs/done/) and stays there as the record.
- [CLAUDE.md](CLAUDE.md) — the rules the agent works under: how to navigate the repo, the testing
  approach, the code style, and a set of invariants that each name the bug they closed.
- [.github/workflows/](.github/workflows/) — two workflows, one per project, each on its own path
  filter so the halves build, test and deploy independently to Azure. Tests gate both.

## Running it

You will need the [.NET 10 SDK](https://dotnet.microsoft.com/download) and
[Node 22](https://nodejs.org), which are the versions CI builds on.

Once, from `timely-notes-ui/`:

```powershell
npm install
```

Then, from the repository root:

```powershell
./run-dev.ps1      # API on :5186 and UI on :5173 together; Ctrl+C stops both
```


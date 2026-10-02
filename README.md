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

- **Sign in** through Auth0, and every note is yours alone.
- **Write** a note in any slot, with Markdown, saved as you type.
- **Browse by time:** the day you are on and its neighbours scroll past, the view follows the
  clock and turns over at midnight, and a calendar marks the days that have notes.
- **Pick the resolution:** slots of one, three or six hours, switched from the menu.

## The tech

Two independent projects with no shared build, wired together in development only by the Vite dev
proxy.

**[API](TimelyNotes.Backend/) — .NET 10, FastEndpoints, EF Core on Postgres, xUnit v3.** REPR
endpoints rather than MVC controllers, FluentValidation per request, and the repository pattern.

**[UI](timely-notes-ui/) — React 19, TypeScript, Vite 8.** The time logic lives in a pure domain
layer, unit tested with Vitest, acceptance tested with Playwright. Markdown editing is
`@mdxeditor/editor`; sign-in is OIDC with PKCE through `oidc-client-ts`.

**Hosting.** The API on Azure App Service, the UI on Azure Static Web Apps, the database on
Neon's free plan, and identity on Auth0.

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
$env:Database__Provider = 'Memory'   # seeded in-memory notes; omit to use a local Postgres
./run-dev.ps1                        # API on :5186 and UI on :5173 together; Ctrl+C stops both
```

Signing in uses the project's Auth0 tenant, which already allows `http://localhost:5173`. For a
local Postgres instead of the in-memory store, see
[LocalPostgres.MD](feature-docs/done/LocalPostgres.MD).

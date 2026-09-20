# Local Postgres

## Goal

**A second store, chosen by configuration, so local development can be run against a real
database without giving up the seeded one.**

Today `INoteRepository` has one implementation, `InMemoryNoteRepository`, and it is what every
environment gets. This feature adds `PostgresNoteRepository` beside it, code-first with EF Core
migrations, and a `Database:Provider` setting that decides which one the app resolves at
startup.

Both stores stay. They answer different questions:

- **Memory** — fixtures across today ± 3 days, rebuilt at every start. It is how the UI is
  exercised against populated days without anyone typing fourteen notes, and it stays the
  default everywhere, including the deployed app and the whole test suite.
- **Postgres** — starts empty and stays whatever the user made it. It is how the schema gets
  established and how the app is used the way a real one would be: notes written on Monday and
  still there on Friday.

The domain model does not change. A note is still addressed by
`(ScheduleSpanHours, Day, PeriodOrdinal)`, there is still no surrogate id, and the wire format
is untouched. What changes is that the address becomes a **composite primary key** — the
uniqueness that the in-memory store enforces by `SingleOrDefault` becomes a constraint the
database enforces for us.

Following TDD (per `CLAUDE.md`): a failing test before each piece of code. Note the honest
limit, stated up front and again under **Verify** — the Postgres repository's *behaviour*
cannot be asserted without a live server, and this feature does not add one. See
**Scope decisions** for what is tested instead.

## Scope decisions

1. **Local development only.** The deployed app keeps `Memory`, and so does CI. This feature
   adds no persistence to production, no connection string in any deployed configuration, and no
   migration step to any pipeline.

   **This is a staging post, not the destination.** The in-memory store is a `List<Note>` with
   LINQ over it — not a database, and its "one note per period" is a `SingleOrDefault` that
   throws rather than a constraint that holds. It stays because it is what lets CI and the
   deployed app run with no server attached, and that is the whole of its justification. Once a
   Postgres instance is deployed, it is **retired**: the setting goes, `INoteRepository` has one
   implementation, and everything decisions 2, 3 and 6 exist to manage goes with it. Accepting a
   second implementation in the meantime is a deliberate, temporary cost — expect the two to be
   written twice and read as slightly different code.

2. **`Database:Provider` is an explicit setting**, `Memory` or `Postgres`, defaulting to
   `Memory` in `appsettings.json`. It is not inferred from whether a connection string is
   present: a typo in a connection string would then fall back to the seeded store silently,
   and a seeded store that was supposed to be a database reads exactly like data loss. An
   unrecognised value **fails at startup** rather than defaulting.

3. **The app logs which store it resolved, once, at startup.** The failure this prevents is
   twenty minutes spent looking for notes in the wrong place.

4. **`IDbContextFactory<NotesDbContext>`, not a scoped `DbContext`.** `INoteRepository` is
   registered singleton so the in-memory seed survives requests, and a scoped `DbContext`
   cannot be injected into a singleton. A factory lets both implementations stay singleton, so
   the provider switch is one registration and nothing downstream changes. The consequence,
   accepted: no ambient change tracker and no unit of work — every repository method opens its
   own context and does one thing.

   **One thing means one statement, not one row.** A method that deletes every note in a range,
   or prunes all the empties in one, is still a single `ExecuteDeleteAsync` and still atomic
   without a word about transactions — Postgres wraps every statement in one. What the factory
   actually costs is atomicity *across* repository calls: two methods cannot commit together,
   because there is no shared context to enlist in. So a multi-row operation is a method that
   issues one statement, and anything genuinely needing several opens its own transaction on its
   own context (`BeginTransactionAsync`), which a factory-created context does perfectly well.
   The rule is therefore **a repository method is the transaction boundary**, and no endpoint
   composes two of them expecting all-or-nothing.

5. **The upsert is one statement.** `INSERT ... ON CONFLICT (schedule_span_hours, day,
   period_ordinal) DO UPDATE ... RETURNING *, (xmax = 0) AS created`. Read-then-write is a race
   that puts two notes in one period, which is the one thing the whole addressing model
   forbids; and `xmax = 0` is what tells create from replace without a second round trip.
   `DO UPDATE` leaves `created_at` alone, so the "`CreatedAt` is honoured only on the create
   path" rule falls out of the SQL rather than being re-implemented.

6. **Emptiness is normalised on write, in one shared place.** `!string.IsNullOrWhiteSpace` is
   the invariant that keeps both read routes agreeing, but it does not survive translation:
   .NET's `char.IsWhiteSpace` counts `\n`, `\t` and NBSP, while Postgres' `btrim` trims spaces.
   A note MDXEditor left as a bare newline would be invisible in memory and a blank-but-marked
   day in Postgres — exactly the bug the invariant exists to prevent.

   So: **whitespace-only content is stored as `""`**, by both repositories, through one
   function; and both reads then filter on `Content.Length > 0`, which means the same thing in
   C# and in SQL. Content that is not whitespace-only is stored **verbatim**, leading and
   trailing whitespace included — this normalises the empty case, it does not trim notes.

   The visible consequence, accepted: `PUT` of `"  \n "` followed by a read of that period
   returns `""`, not `"  \n "`. Nothing in the client can tell the difference — `isBlank` is
   true either way, and the note is on its way to being deleted.

7. **No Postgres seed, ever.** The whole point of the second store is that it holds real,
   accumulated notes. A fresh database therefore shows three empty days and an unmarked
   calendar; that is the feature working. (A relative-date seed could not live in a migration
   anyway — `HasData` cannot express "today".)

8. **Tests run against the in-memory store only.** No Testcontainers, no Respawn, no database
   in CI. What *is* tested without a server:
   - the **model configuration** off `NotesDbContext.Model` — composite key, no surrogate id,
     `text` for content, `date` for the day, `timestamptz` for the stamps;
   - the **generated SQL** via `ToQueryString()` — that the reads filter, order and group as
     intended, and that the emptiness predicate is the one we mean;
   - the **provider selection** — the right implementation registered for each setting, and a
     bad value throwing.

   Not tested, and stated plainly: whether Postgres actually behaves as the SQL implies. That
   is the by-hand walk-through under **Verify**, and it is the reason decision 6 exists — the
   one behaviour that could silently differ between stores is removed by construction rather
   than caught by a test.

9. **Timestamps stay UTC.** `UpsertNoteEndpoint` already stamps from `clock.GetUtcNow()`, so
   `timestamptz` round-trips them unchanged. Nothing renders them and the invariant that they
   are never used for placement is untouched. One trap to avoid in any future test: Postgres
   stores microseconds and .NET ticks are 100ns, so a fake instant with a sub-microsecond
   remainder would not compare equal after a round trip.

10. **The machine's installed Postgres, not a container.** `postgresql-x64-18` is already
    installed here, running, and set to start automatically, so it costs nothing and is up
    whenever the app is. A dedicated database, `timely_notes_dev`, isolates this work from
    anything else in that server.

    Containers were considered and rejected. They would have bought a pinned version and a
    volume-level reset, but `dotnet ef database drop -f` is the same reset against a native
    server, and version pinning is worth little for a store the deployed app never uses. The
    deciding point is the second phase: once the schema stops churning this database holds
    notes worth keeping, and a container makes reading yesterday's note start with booting
    Docker Desktop's VM. The installed service is simply there.

    Had it been a container it would have needed host port **5433** — 5432 is the installed
    instance, and leaving both on it invites `dotnet ef database update` to build the schema in
    the wrong server and appear to succeed.

11. **No tooling around the switch.** No script, no launch profile, no startup automation.
    Changing store is editing one line of `appsettings.Development.json`, and running the app
    is unchanged.

12. **Snake-case column naming**, via `EFCore.NamingConventions`. `ScheduleSpanHours` maps to
    `schedule_span_hours`, so nothing has to be double-quoted in `psql`. This is a developer
    ergonomics choice, and the only reason it is worth a package is that this database exists
    to be poked at by hand.

## Alternatives rejected

Both of these are the obvious "surely there's a tidier way" ideas. Recording them so they are
not re-proposed without their reasons.

- **One repository over `NotesDbContext`, with EF Core's InMemory provider as the second
  store.** It reads as the clean version of this feature — one implementation, the provider
  switch moving down into `DbContextOptions` — and it cannot work here. The upsert is raw SQL
  (decision 5) and raw SQL needs a relational provider, so the one method that must be a single
  statement would need a second code path anyway; `ExecuteDeleteAsync` is in the same position.
  Worse, the InMemory provider enforces no column types and translates no predicate, so
  decision 6's divergence returns disguised as a shared code path. Microsoft's own guidance is
  not to use it as a stand-in for a relational store.

- **Postgres everywhere, including CI, with the in-memory store deleted now.** This is where the
  project is heading (decision 1) and it is a genuine simplification — decisions 2, 3 and half
  of 6 exist only because there are two stores. It is not this feature because it inverts
  decision 8: `dotnet test` would need a database, so every endpoint fixture needs one created,
  migrated and dropped, the ~44 read specs that assert against the seed need to arrange their
  own data, and the integrated Playwright lane needs to create notes before it asserts on them.
  That is a bigger change than this document describes, and deciding it before a single Postgres
  query exists is deciding in the dark. Revisit once a deployed Postgres retires the fake.

## Architecture

**Backend — `TimelyNotes.Backend/TimelyNotes.API/`**

| Where | What |
| --- | --- |
| `Models/NoteContent.cs` | `Normalise(string)` and `IsReadable(string)` — the one definition of empty, shared by both stores. |
| `Data/NotesDbContext.cs` | One `DbSet<Note>`, the composite key and the column types. No conventions beyond snake-case. |
| `Data/NotesDbContextFactory.cs` | Design-time factory, so `dotnet ef` can build the context without a running host. |
| `Data/Migrations/` | Generated, checked in. The migrations *are* the schema record. |
| `Repositories/PostgresNoteRepository.cs` | `INoteRepository` over `IDbContextFactory<NotesDbContext>`. |
| `Repositories/InMemoryNoteRepository.cs` | Unchanged apart from `Seed()` and the shared emptiness predicate. |
| `Program.cs` | Reads `Database:Provider`, registers one repository, logs which. |

**Repo root**

| Where | What |
| --- | --- |
| `.config/dotnet-tools.json` | `dotnet-ef` pinned and checked in. |

Nothing else at the root changes. `run-dev.ps1` is **not** touched: the provider is switched by
editing `appsettings.Development.json` before starting the API, which is one line and needs no
scripting. The database is the machine's own `postgresql-x64-18`, so there is no compose file
and no service to start.

**Data flow is unchanged.** Endpoints depend on `INoteRepository` and know nothing about
either store; filtering and grouping stay in the repository, which is what lets the Postgres
one push them into SQL.

### The schema

One table. The domain has one entity and no relationships — Schedules are code, not rows. The
generated migration is checked against this; if it differs, the difference is a decision, not a
detail.

```sql
CREATE TABLE notes (
    schedule_span_hours integer      NOT NULL,
    day                 date         NOT NULL,
    period_ordinal      integer      NOT NULL,
    content             text         NOT NULL,
    created_at          timestamptz  NOT NULL,
    modified_at         timestamptz  NOT NULL,
    CONSTRAINT pk_notes PRIMARY KEY (schedule_span_hours, day, period_ordinal)
);
```

Plus EF's `__EFMigrationsHistory`. Nothing else.

- **No `schedules` table.** `Schedules.Known` is `{1,3,6}` in code, with a test enforcing that
  every member divides 24, and adding a span is a one-line edit. A lookup table would put that
  in two places with different release cadences and buy nothing: there is no schedule *data*,
  only a span, and the span is the identity.
- **No secondary indexes.** Both reads filter on the schedule then a day range, which is a left
  prefix of the primary key, and the list's `ORDER BY day DESC, period_ordinal DESC` is that
  same index read backwards. The counts query groups on the same prefix. The key is the access
  path for everything the API does.
- **No check constraints, deliberately.** The tempting ones are
  `schedule_span_hours IN (1,3,6)` and `period_ordinal BETWEEN 1 AND 24 / schedule_span_hours`
  — the second genuinely encodes the invariant, and Postgres would enforce it perfectly. Both
  stay out: a new span is meant to be a one-line edit to `Schedules.cs`, and a constraint turns
  that into an edit plus a migration plus a deploy ordering problem. The same goes for
  `length(content) <= 16384`, which lives in `UpsertNoteValidator.MaximumContentLength`. The
  validator is the single source; a constraint that drifts from it is worse than none.
- **`integer`, not `smallint`, for the ordinals.** They would fit, but the C# type is `int` and
  a narrowed column is a mapping detail to remember for four bytes a row.
- **`content NOT NULL`, empty string allowed** — that is the normalised empty from decision 6,
  and the value both reads filter out.

### Where a user will go

Not in this feature — there is no concept of a user in the application yet, and one is not
being invented for a database. But the shape is known, so the schema above is designed not to
fight it.

**One user has many notes; one note belongs to one user.** That eventually means a `users`
table holding the identity of the person using the app, and `notes` gaining an owning column
that is both a foreign key to it and the **first column of the primary key** —
`(owner_id, schedule_span_hours, day, period_ordinal)`. Leading with the owner keeps every
existing query a left-prefix scan once it is filtered by owner, so no read is restructured and
no index is added.

Two things that do not change when that day comes, and are worth knowing now: **the URL keeps
its one spelling** — `2026-08-25/p4`, with the owner arriving from the token rather than the
route — and the repository interface takes the owner as a parameter rather than the address
carrying it. Until then this is a single-user application whose single user is the developer,
and the table has no column for them.

## Checklist

### 1. Seeding becomes opt-in (prerequisite)

- [x] Test first: a newly constructed `InMemoryNoteRepository` returns nothing until `Seed()`
      is called, `Seed()` fills it, and calling `Seed()` twice leaves the same notes — a second
      call must not put two notes in one period.
- [x] Remove the constructor: `_notes = []` is a field initializer and `Seed()` is a public
      call that clears then fills. No logic in the constructor beyond assignment.
- [x] `Program.cs` constructs and seeds in the registration, so seeding is the composition
      root's decision rather than the class's.
- [x] Existing repository tests arrange through a `SeededRepository()` helper; behaviour
      unchanged.

### 2. One definition of empty (`Models/NoteContent.cs`)

- [x] Test first: `Normalise` returns `""` for `null`, `""`, `"   "`, `"\n"`, `"\t"` and a
      non-breaking space, and returns non-blank content **verbatim** — `"  hi  "` keeps its
      spaces.
- [x] Test first: `IsReadable` is `Content.Length > 0` over normalised content, so it agrees
      with what SQL will do.
- [x] Implement `NoteContent`, and point `InMemoryNoteRepository`'s `IsReadable` at it.
- [x] Test first: `InMemoryNoteRepository.Upsert` of whitespace-only content stores `""`, and
      the note is then absent from both reads.
- [x] Normalise in `InMemoryNoteRepository.Upsert`.

### 3. Configuration and provider selection (`Program.cs`)

- [x] Test first: with `Database:Provider=Memory` the resolved `INoteRepository` is
      `InMemoryNoteRepository` and it is seeded.
- [x] Test first: with `Database:Provider=Postgres` the resolved `INoteRepository` is
      `PostgresNoteRepository` (registration only — no connection is opened at startup).
- [x] Test first: an unrecognised `Database:Provider` throws at startup, naming the setting and
      the value.
- [x] Test first: with the setting absent the default is `Memory`, so an existing checkout and
      the whole test suite keep working untouched.
- [x] `appsettings.json` carries `Database:Provider=Memory`;
      `appsettings.Development.json` carries the Postgres connection string under
      `ConnectionStrings:Notes` but leaves the provider on `Memory`.
- [x] Log the resolved store once at startup.

### 4. The context and the schema (`Data/`)

- [x] Test first: `NotesDbContext.Model` gives `Note` a primary key of exactly
      `(ScheduleSpanHours, Day, PeriodOrdinal)`, in that order, and no other key or generated
      property.
- [x] Test first: `Content` maps to `text`, `Day` to `date`, `CreatedAt`/`ModifiedAt` to
      `timestamptz`.
- [x] Test first: columns are snake-cased.
- [x] Implement `NotesDbContext` and the design-time factory.
- [x] Add the `dotnet-ef` tool manifest; generate the initial migration and check it in.
- [x] Read the generated migration against the DDL in **Architecture**. Any difference is a
      decision to record, not a detail to accept.

### 5. The Postgres repository (`Repositories/PostgresNoteRepository.cs`)

- [x] Test first, via `ToQueryString()`: `GetBySchedule`'s SQL filters on the schedule, on the
      half-open day range, and on non-empty content, and orders by day then ordinal descending.
- [x] Test first, via `ToQueryString()`: `GetDayCountsBySchedule` groups by day in SQL, applies
      the same emptiness predicate, and orders ascending.
- [x] Implement both reads over `IDbContextFactory`, threading `ct` into every EF call.
- [x] Implement `Upsert` as a single `ON CONFLICT ... DO UPDATE ... RETURNING`, normalising
      content first and mapping `xmax = 0` to `UpsertResult.Created`.
- [x] Implement `Delete` with `ExecuteDeleteAsync`, returning whether a row went.

### 6. Running it

- [x] Create the `timely_notes_dev` database in the installed instance, once, by hand.
- [x] The connection string lives in **user secrets** under `ConnectionStrings:Notes`, naming the
      database on `localhost:5432`. Not checked in: it carries the developer's own server password,
      which is a fact about their machine rather than about this project, and user secrets are a
      configuration source the app already reads in Development with no code change.
- [x] No script and no startup automation. Switching store is editing `Database:Provider` in
      `appsettings.Development.json`; running the app is the `dotnet run` already in
      `CLAUDE.md`.
- [x] Applying migrations is a manual `dotnet ef database update`, not a startup call. A schema
      still being designed should change when you say so — and while it is still churning,
      `dotnet ef database drop -f` followed by `update` is the reset. Once it settles, stop
      dropping it: the notes in there are then worth keeping, and further changes go through
      new migrations like any other database.

### 7. Docs

- [x] `CLAUDE.md`: the two stores, the setting, the commands, and the invariants this feature
      adds (composite key as the address; one definition of empty, normalised on write; no
      Postgres seed).
- [x] `TimelyNotes.API.http`: unchanged, but confirm the write routes still work against both.

## Verify

- [x] `dotnet test` from `TimelyNotes.Backend/` — all green, still against the in-memory store.
- [x] `dotnet build` clean, no new warnings.
- [x] `npm test`, `npm run lint`, `npm run test:e2e` from `timely-notes-ui/` — unchanged; this
      feature touches no frontend code. 317 Vitest specs and lint are green; the stubbed lane is
      72 of 73, on a pre-existing flake (see below).
- [~] **By hand, Memory:** run the API and UI as they are run today, confirm the startup log
      names the in-memory store and the seeded days render unchanged.
- [~] **By hand, Postgres:** `dotnet ef database update`, set `Database:Provider` to `Postgres`
      in `appsettings.Development.json`, then run the API and UI. Confirm the log names Postgres
      and the app opens on three empty days with an unmarked calendar.
- [~] Write a note, reload the page — it is still there. Restart the API — still there. This is
      the assertion no automated test in this feature makes.
- [x] Edit that note; confirm in `psql` that `created_at` did not move and `modified_at` did.
- [~] Clear the note in the UI; confirm the row's `content` is `''` and the note vanishes from
      the view and the calendar marker, then that closing the dialog removes the row.
- [x] Type a note consisting only of a newline; confirm it is stored as `''` and never appears
      — the divergence decision 6 exists to remove.
- [ ] Two browser tabs on the same period: confirm last-write-wins and that exactly one row
      exists.
- [x] Switch back to Memory and confirm the seeded fixtures return, unaffected.
- [~] `dotnet ef database drop -f` then `dotnet ef database update` — the schema rebuilds from
      the migrations into an empty database. This is the loop the schema will be designed in, so
      it is worth proving once. Then write a note and **reboot**: the installed service comes
      back automatically and the note is still there, which is the property that decided against
      a container.

## Deferred

- **Postgres in production.** Deployment, connection management, pooling and backups are all
  out of scope; the deployed app stays in-memory. It is where this is heading, though — a free
  tier holding real notes — so what that will need, none of which changes the repository:
  - **A user entity, and an owner in the key** — see *Where a user will go* under
    **Architecture** for the shape. A hosted database with no auth is everyone's notes in one
    pile. This feature deliberately does not anticipate it: a placeholder owner with no auth
    behind it is a fiction in the primary key, and what a user *is* wants settling by its own
    specification rather than by a column.
  - **Migrations applied by the deployment**, as `dotnet ef migrations script --idempotent` or
    a `Database.Migrate()` call. A hosted database cannot be updated from a developer's shell
    the way the local one is.
  - **Connection resiliency.** Free tiers scale to zero and cap connections, so
    `EnableRetryOnFailure` and a modest `MaxPoolSize` — both `DbContextOptions`, both invisible
    to `PostgresNoteRepository`.
  - The connection string itself needs nothing new: it already comes from configuration, so a
    deployed one is an environment variable.
- **Any test that runs against a live database** — Testcontainers, Respawn, a CI service
  container. Decision 8 explains why, and it is a decision to revisit if the Postgres path ever
  becomes more than a development convenience.
- **Migrations applied at startup.** Manual for now, per checklist item 6.
- **Optimistic concurrency.** Last-write-wins is the settled model
  (`NoteAutosave.MD` §Concurrent edits), and the composite key already prevents the duplicate
  the in-memory store could theoretically produce.
- **`EmptyNotePruning.MD`.** Still unscheduled, and this feature makes it no more urgent: the
  read filter and the normalised write keep empties invisible wherever they are stored.
- **Indexes beyond the primary key.** The key already leads with the schedule and the day,
  which is what both reads filter on. Revisit with real data volume, not before.

## Implementation notes

### Section 1 — seeding

`Seed()` clears before filling rather than appending. A second call would otherwise put two
notes in one period, and `Find`'s `SingleOrDefault` would throw — the in-memory store's version
of the constraint the Postgres key will enforce.

207 tests green (204 before, 3 added here).

A build that fails because a running `TimelyNotes.API.exe` is locked leaves the test output
directory half-copied, and `dotnet test` then reports "Zero tests ran" (exit 5) with no
explanation rather than a build error. Stop the dev API, build once, and it is fine — the
zero-tests message is the symptom, not the problem.

### Section 2 — one definition of empty

`IsReadable` deliberately does **not** re-normalise. It is `content.Length > 0` and nothing else,
because that is `content <> ''` in SQL; `Normalise` on write is what makes it sufficient. A test
pins the odd-looking half of that contract — `IsReadable("   ")` is `true` — so the next reader
does not "fix" it back into `IsNullOrWhiteSpace` and reintroduce the divergence decision 6 exists
to remove.

`Upsert` now builds its own `Note` on the create path rather than storing the caller's instance,
so normalised content is what lands in the store on both paths rather than only on replace.

**A latent race surfaced, and is fixed here.** Two endpoint specs
(`DeleteNoteEndpointTests.DeletingTwice_Gives204Then404` and
`Returns204AndRemovesTheNoteFromBothReadRoutes`) failed about one run in three. The cause is not
this feature: `InMemoryNoteRepository` is registered singleton and its `List<Note>` was
unsynchronised, so `Add` racing an enumeration drops writes or throws mid-`SingleOrDefault`.
`WriteApiFixture` is shared across both write test classes and xUnit runs classes in parallel,
which is what made it visible. A `Lock` now guards all four methods and `Seed`, and `Upsert` finds
and writes inside one acquisition — read-then-write across the lock would be precisely the race
the composite key exists to forbid. Two specs cover it, and the suite ran green eight times
consecutively afterwards.

This matters beyond the test suite now that decision 1 keeps the in-memory store in the **deployed**
environment: unsynchronised, it was a real if rarely-hit fault there too.

231 tests green (207 before; 16 for `NoteContent`, 6 for normalisation in the repository, 2 for
concurrency).

### Section 3 — configuration and provider selection

`NoteStoreRegistration.AddNoteStore(services, configuration)` is the whole switch, and it
**returns** the resolved `NoteStore` rather than logging: at registration time there is no logger
yet, so `Program` logs the returned value off `app.Logger` once the host is built. That keeps the
one line decision 3 asks for at the point where a logger genuinely exists.

`Enum.TryParse` was the first implementation and is wrong here. It accepts `"1"` as `Postgres` —
the numeric value — so `"Database:Provider": "1"` silently ran the app on a store nobody named, and
`Enum.IsDefined` does not catch it because `1` *is* defined. The match is now against
`Enum.GetValues<NoteStore>()` by name, case-insensitively; a numeric value fails like any other
unrecognised one. This is the sigil-parsing lesson (`p04`, `p+4`, `P4`) in a second place: the
permissive built-in parser accepts spellings the setting does not have.

Case-insensitive **is** deliberate for this setting, unlike the sigils. A hand-edited development
settings file is not an address, nothing is constructed from it, and `postgres` failing where
`Postgres` works buys nothing.

`PostgresNoteRepository` exists as a **stub** — it implements `INoteRepository` and every method
throws `NotImplementedException`. That is the minimum the registration test forces, and section 5
fills it in. Choosing `Postgres` today therefore starts the app, logs `Note store: Postgres`, and
throws on the first request. It takes no constructor dependencies yet; the
`IDbContextFactory<NotesDbContext>` arrives with section 4, and the registration does not change
when it does.

`ConnectionStrings:Notes` lives in **user secrets**, not in `appsettings.Development.json`. The
string carries the password to the developer's own Postgres server, which is a fact about their
machine rather than about this project; user secrets keep it out of the repository with no code
change, since `WebApplication.CreateBuilder` already reads them in Development. Nothing in the app
names the source — it is `configuration.GetConnectionString("Notes")` either way.

`TimelyNotes.API.csproj` gains a `UserSecretsId`, which is what links the project to the store;
without it `dotnet user-secrets` has nowhere to look and the host reads no secrets at all.

`appsettings.Development.json` carries **no `ConnectionStrings` section**. A placeholder there —
`"Notes": "<<FROM SECRETS>>"` — would be shadowed by the secret when one is set and resolve to
literal nonsense when one is not, so a missing secret would surface as an unparseable connection
string rather than an absent one. Absent is the honest reading.

The consequence to watch: a checkout with no secret set has **no** connection string, and the
failure has to be legible. That is section 5's problem, not section 3's — nothing reads the
connection string yet.

241 tests green (231 before; 8 for the provider switch, 2 more from the case-insensitivity theory).

`dotnet test` reports "Zero tests ran" (exit 5) for an ordinary **test failure** under MTP as well
as for the locked-exe build problem noted in section 1 — the failing assertion is not printed at
all. Running `TimelyNotes.API.Tests/bin/Debug/net10.0/TimelyNotes.API.Tests.exe` directly prints it.

### Section 4 — the context and the schema

The generated migration matches the DDL under **Architecture** exactly, `pk_notes` included, and
`\d notes` in `psql` confirms the same six columns and the one index. No difference to record.

`Note` needed no change for EF: `required init` properties materialise fine, since `required` is a
compile-time check and EF sets `init` accessors directly. Nothing in `Models/` knows about the
database.

Column types are spelled out in `OnModelCreating` rather than left to convention. They are what the
tests assert, and `timestamp with time zone` is what Npgsql calls `timestamptz` back.

**Package versions have to agree or the build warns.** `Npgsql.EntityFrameworkCore.PostgreSQL`
10.0.3 pulls `Microsoft.EntityFrameworkCore` 10.0.4, and pairing it with
`Microsoft.EntityFrameworkCore.Design` 10.0.12 raises MSB3277 in the **test** project — an assembly
conflict the API project alone does not show. Design is pinned to 10.0.4 to match. The `dotnet-ef`
tool stays at 10.0.12; the tool's version is independent of the runtime assemblies.

`Microsoft.Extensions.Configuration.UserSecrets` must **not** be referenced explicitly (NU1510) —
it is already in the shared framework.

### Section 5 — the repository

`Data/NoteQueries.cs` holds the two reads as `IQueryable`s rather than as results. That is what
makes `ToQueryString()` possible without a server, and it keeps the filtering and grouping in one
place for both of them.

`new NoteDayCount(day.Key, day.Count())` **after** `OrderBy` does not translate — EF rewrites the
group into `g.AsQueryable().Count()` and gives up. Ordering the groups first
(`GroupBy(...).OrderBy(g => g.Key).Select(...)`) translates to exactly the intended
`GROUP BY n.day ORDER BY n.day`. The order of those two operators is load-bearing.

The emptiness predicate is written `note.Content != ""`, which Npgsql renders `n.content <> ''` —
the spelling decision 6 names. `NoteContent.IsReadable` cannot be called inside the expression tree
(EF cannot translate a static method), so the two are kept the same predicate by `Normalise` on
write, not by sharing code. A test asserts the SQL text.

Snake-case naming means the generated SQL needs no quoting at all: `n.schedule_span_hours`, not
`n."schedule_span_hours"`. The query tests assert against the unquoted form.

**The upsert is raw `NpgsqlCommand`, not EF.** `Database.SqlQueryRaw<T>` needs its result type in
the model, and `(xmax = 0) AS created` is not a column of `Note` — configuring a keyless companion
type would put a fiction in the model to avoid six lines of mapping. The command text is
`internal const UpsertSql`, and `PostgresUpsertSqlTests` pins what it must keep saying: one
statement, the whole address as the conflict target, no `created_at` in the `DO UPDATE`, and the
`xmax = 0` flag. `InternalsVisibleTo` is how the test reaches it.

**A missing connection string fails at startup, and had to be made to.** `AddDbContextFactory`'s
options lambda does not run until the first resolution, so reading `ConnectionStrings:Notes` inside
it turned an absent secret into a first-request failure. It is read in the registration body
instead, which is what makes the error the one section 3 promised — named, at startup, before the
app claims to be listening. `NoteStoreRegistration.ConnectionStringName` is the one spelling of the
key, shared with the design-time factory.

### Section 6 — running it

`NotesDbContextFactory` reads `ConnectionStrings:Notes` from **user secrets** rather than carrying a
hard-coded string. With a design-time factory present `dotnet ef` uses it and never builds the host,
so a placeholder string would have made `database update` connect to the wrong place — or nowhere.
It falls back to a host-only placeholder so `migrations add` still works with no secret set, since
generating a migration needs a provider but no server.

`dotnet ef database update` **creates the database if it is absent**, so the by-hand `CREATE
DATABASE` in the checklist is belt-and-braces rather than a step anyone has to remember. Proven by
`drop -f` followed by `update`: the database and the schema both came back.

Walked through against the running API on Postgres, with `psql` confirming the rows:

- `PUT` of a new period is `201`, the same address again is `200`, and `created_at` did not move
  while `modified_at` did — the `DO UPDATE` clause doing what the SQL test pins.
- `DELETE` is `204` then `404`.
- `p04`, and `p9` on `s3`, are both `400` — the validator is unchanged and still ahead of the store.
- Content of `"\n   \n"` is accepted, `201`, and then invisible to **both** reads. This is decision
  6 working: the row exists with `content = ''` and no marker appears.
- Killing and restarting the API leaves the note there. Switching `Database:Provider` back to
  `Memory` brings the fixtures back untouched.

`appsettings.Development.json` is left on `Memory`, per decision 2 — the switch is a one-line edit
when it is wanted, not a checked-in default.

### Verification, and what is left by hand

`[~]` above means *proved at the API, not through the UI*. Everything the two stores do differently
was walked through with `curl` against the running API and confirmed in `psql` — creation, replace,
the untouched `created_at`, delete, the whitespace-only note stored as `''` and invisible to both
reads, survival across an API restart, `drop -f` then `update` rebuilding the schema, and the
fixtures returning on the switch back to `Memory`. What is genuinely still owed is the part only a
browser can answer: three empty days and an unmarked calendar on a fresh Postgres database, clearing
a note in the dialog, the two-tab last-write-wins check, and the reboot.



### Section 8 — a defect the lane caught, fixed here

Not in the original checklist. The `stubbed` lane fails intermittently on
`note-dialog.spec.ts:234` — *says so when a write fails, and keeps the dialog open*. Chasing it
found a real defect in `NoteDialog`, which is fixed here. **Whether that defect is the cause of the
flake is not established**; read this section as a fix plus an honest account of an unfinished
investigation, not as a closed bug.

**The symptom.** The accessibility snapshot in the failure shows no dialog node at all, so this is
never a slow locator: `onClose()` has run and the dialog has closed over text that never reached the
server. `App` nulls `dialogSlot` in exactly one place — the dialog's own `onClose` — so `done()`
reached its final line.

**The defect.** `done()` decided whether to hold the dialog open by reading `latestStatus`, a ref
written in a passive effect:

```ts
await finish()
if (latestStatus.current === 'failed' && doneAttempts.current === 1) return
onClose()
```

The continuation after `await finish()` is a **microtask**; React flushes passive effects from a
**scheduler macrotask**. So the ref can still hold the previous committed value — `saving` — when
the guard reads it, and the guard falls through. The comment on it, *"read after an await, when the
render that set `status` has already happened"*, was stating a guarantee React does not give.

**The fix.** `flush` and `finish` now **return** whether anything is left unsaved, computed from the
buffer (`!hasSomethingToSay()`) at the instant the write settles. A failed write leaves the buffer
dirty by design, so "clean" already meant "the attempt got through" — no new state was needed, and
`latestStatus` and its effect are gone. `done()` reads a value it was handed rather than one React
owed it.

**Where the investigation actually got to.** Recorded because the next person will otherwise repeat
it:

- `NoteDialog.test.tsx`'s *stays open on a failed write* passes either way: `mockRejectedValue`
  rejects in the same microtask batch and `act()` flushes effects at every await boundary. `act()`
  makes this whole class of ordering bug invisible in jsdom, which is why the regression tests are
  on the hook's return value instead.
- **Slowing the network does not reproduce it.** A probe that delayed the Done-time write by 400ms
  rendered `Saving…` — so the stale value genuinely was in the ref mid-flight — and the dialog still
  stayed open, because the rejection's own task gave React its chance to flush.
- **The early measurements were worthless**, and the trap is worth knowing: `reuseExistingServer` is
  `!CI`, so a preview server left listening on `5174` is reused and `npm run build` never runs. Runs
  that looked like they were testing a change were serving an older bundle. Kill the server and
  delete `dist/` before measuring anything about this lane.
- On a clean rebuild the rate is roughly **2–3%** — two failures in 76 attempts before the fix.
  Every claim of "fixed" needs tens of runs behind it, not one.

The regression tests are six hook specs pinning that `flush` and `finish` report the write's own
outcome, including that a retry which gets through reports `true` and that a blank buffer never
worth writing is not "unsaved". The one existing spec asserting `finish()` resolved to `undefined`
now asserts `true` — a delete that failed after the emptiness was written is still saved.

**Still open, and now specified separately.** Two request-count specs still flake about one run in
fifty: *clearing and pressing Escape deletes the note too* saw **two** `PUT`s before its `DELETE`,
and `calendar.spec.ts:120` saw the wrong set of note windows. Neither is a dialog that closed, and
neither is touched here — they are `TrustworthyLane.MD`.

323 Vitest specs green (317 before), lint clean.

# User notes

## Goal

**Every note belongs to the person who wrote it, and nobody else can read, overwrite or delete
it.** A person signs in before the app shows anything, the API knows who is asking from a token
it validates, and each note carries the `UserId` of its writer.

Four things arrive together:

1. **A `User` entity and a `users` table.** It is the design document's *Instance* — the
   account — under the name the code will use. It holds an internal `Id` and the identity
   provider's `(Issuer, Subject)` pair, and nothing else.
2. **Authentication by OpenID Connect, with Auth0 as the provider.** The UI signs in with
   Authorization Code + PKCE and sends an access token; the API validates it as a JWT bearer
   token and stores no credentials of its own. Any email address can sign up — no Microsoft,
   Google or other account is required.
3. **Note tenancy.** `Note` gains `UserId`, and it leads the composite key:
   `(UserId, ScheduleSpanHours, Day, PeriodOrdinal)`. There is one `notes` table for everyone.
   Two people can each hold a note at `s3/2026-09-24/p4`, and neither can see the other's.
4. **A sign-in screen in the UI** with **Sign in** and **Create account**, and a line saying
   what the app stores. Sign out is in `MenuDrawer`.

The wire format for notes does not change. No URL, request body or response carries a user: the
user is always the one the token names. That is what makes cross-tenant access unspellable
rather than merely forbidden.

**Done** means: the four note routes answer `401` without a valid token; two users writing to
the same address get two notes and each reads back only their own; the deployed UI signs in
through Auth0 and works end to end against the deployed API; and every existing test lane is
green with no dependency on Auth0 being reachable.

Following TDD (per `CLAUDE.md`): a failing test before each piece of code, in both projects.

## Scope decisions

1. **Auth0, used only through standard OIDC.** The requirement is a hosted provider that
   anyone can use with any email address, and no other account:
   - **Hosted,** so there is nothing to run locally or in production.
   - **Any email address,** through Auth0's *Database* connection.

   Two alternatives were rejected:
   - **Keycloak**, the design document's candidate: it is a Java server of our own to host and
     keep patched.
   - **Microsoft Entra External ID**, which meets the requirement equally well and would have
     kept everything in the Azure subscription. Auth0 was chosen as the one worth learning.
     Because of the next paragraph, the choice can be revisited without touching code.

   **Nothing in code depends on Auth0 specifically.** The API is configured with an `Authority`
   and an `Audience`; the UI with an authority, a client id and an audience. Changing provider
   is configuration, plus a data migration of `(issuer, subject)`: see decision 3.

2. **The API is a resource server, not a login server.** `AddJwtBearer` validates signature,
   issuer, audience and lifetime; there are no login, register or password endpoints.
   ASP.NET Core Identity's `MapIdentityApi` was rejected on two grounds: it is minimal-API
   endpoints (the repo is FastEndpoints only), and it makes this app own password storage,
   reset email and MFA, all of which the provider does better. A cookie-based BFF was rejected
   because the UI and API are deployed on different origins, which would make that
   `SameSite=None` cookies plus CSRF defences.

3. **`User.Id` is a surrogate `Guid` — deliberately, unlike a note.** A note has no id because
   its time slot is its address; a person has no natural address. The provider's `sub` is not
   used as the key, so notes are not welded to one provider's identifier scheme. Ids are
   `Guid.CreateVersion7()`, minted by the app, so inserts stay index-friendly.

4. **No email, name or profile in `users`.** They are personal data, they change at the
   provider, and nothing server-side displays them. The UI may show the email address from the
   ID token it already holds. Add columns when a server-side feature needs them.

5. **Users are provisioned on first authenticated request.** There is no sign-up endpoint: a
   valid token for an unknown `(issuer, subject)` creates the row. Resolution is an
   `IClaimsTransformation` that adds a `timely:user_id` claim, backed by `IUserRepository.Resolve`.
   The result is cached for the life of the process in a singleton map, because a user's `Id`
   never changes and nothing deletes users. Endpoints bind it with FastEndpoints'
   `[FromClaim]`, so the user is part of the request DTO like every other input.

   Caveat, accepted: `dotnet ef database drop` under a running API leaves the cache pointing
   at rows that no longer exist. The next write fails its foreign key. Restart the API after a
   reset.

6. **`userId` is an explicit first parameter on every `INoteRepository` method.** No EF global
   query filter:
   - Filtering belongs in the repository.
   - The upsert is raw SQL, which a filter would not reach.
   - A filter is invisible at the call site and can be switched off with
     `IgnoreQueryFilters()`.

   A method that cannot be called without a user cannot forget one.

7. **Another user's note is simply absent.** With `user_id` in the key, the address
   `s3/2026-09-24/p4` means *your* note there. Reads omit others' notes, a `PUT` creates your
   own (`201`), and a `DELETE` of an address you hold nothing at is `404`. There is no `403`
   anywhere, and so nothing that confirms another user's note exists.

8. **Authentication runs before validation.** An unauthenticated request with a malformed
   Schedule is `401`, not `400` — the API says nothing about its routes to an anonymous
   caller. Swagger stays anonymous (it is the integrated lane's readiness URL) and gains the
   bearer security scheme.

9. **Existing notes in `timely_notes_dev` are dropped.** They are manual testing only. The
   reset is `dotnet tool run dotnet-ef database drop -f` then `database update`, by hand. The
   migration adds `user_id` as `NOT NULL` with no default, so applying it over existing rows
   **fails** rather than guessing whose they are.

10. **`notes.user_id` references `users.id` with `ON DELETE RESTRICT`.** Nothing deletes a user
    yet; when account deletion is specified it will decide cascade deliberately, rather than
    inherit EF's default for a required relationship.

11. **The in-memory store stays, and seeds each user.** It is still the default everywhere, the
    deployed app included. With seeding on, a user's first touch of `InMemoryNoteRepository`
    seeds today ± 3 days for that user, so every signed-in person sees populated days.
    `InMemoryUserRepository` backs `IUserRepository` when `Database:Provider` is `Memory`. The
    deployed app therefore has per-user notes that vanish on restart, exactly as today's notes
    do.

12. **The methods of signing in are Auth0's business, not the app's.** Auth0's hosted page offers
    two connections: email and password (Username-Password-Authentication, with passkeys enabled)
    and Google. The app has no provider-specific buttons and never names a connection. Adding or
    removing one is a change in the Auth0 dashboard.

    One consequence, accepted: Auth0 gives each connection its own `sub`
    (`auth0|…`, `google-oauth2|…`). So a person who signs up with Google and later with email and
    a password, at the same address, is two users with two sets of notes. Auth0 account linking
    fixes this and is deferred. The hosted page shows both options on every visit, so it only
    happens to someone who switches method.

13. **The sign-in screen offers both paths and says what is kept.** Signed out, the app shows:

    > **Timely Notes**
    >
    > [ Sign in ]  [ Create account ]
    >
    > Timely Notes keeps your notes and an anonymous account ID, never your name or email
    > address. Signing in is handled by Auth0, which holds your email address so you can sign in.

    - **Both buttons redirect to Auth0's hosted page.** **Create account** adds
      `screen_hint=signup` so the page opens on its sign-up form; **Sign in** opens on the
      sign-in form. Each form links to the other, so a wrong choice costs nothing.
    - **Both paths end the same way.** The account row is created on the first authenticated
      request, which is decision 5, whichever button was pressed.
    - **The wording does not claim "no personal information is stored".** That would be
      untrue: notes are personal, and the provider holds the email address. The text states
      what this app keeps and who holds the rest. The provider name is configuration
      (`VITE_AUTH_PROVIDER_NAME`), so a provider change cannot leave the wording wrong.

14. **UI: standard OIDC through `oidc-client-ts` and `react-oidc-context`, not Auth0's SDK.**
    The requirement is provider-neutral Authorization Code + PKCE with silent renewal, and these
    libraries do exactly that. Auth0's SDK would put the provider's name in the code.
    - **Refresh tokens rotate** (`offline_access` scope, rotation on in Auth0).
    - **The session is kept in `sessionStorage`.** It survives a reload, and a new tab does one
      silent redirect. Memory-only storage would force a visible redirect on every reload.
      `sessionStorage` is open to XSS, but XSS already owns the page and everything in it.
    - **The `audience` parameter must be sent on the authorize request.** Without it Auth0
      issues an opaque access token and every API call is `401`. It goes in `extraQueryParams`.

15. **A `401` is retried once, after a forced renew.** `notesApi` calls take a `TokenSource`
    (`{ token(): Promise<string>; renew(): Promise<string> }`) instead of a raw string. On `401`
    a call renews and retries once, then throws as today. Several constraints follow:
    - The call still **returns** its outcome, so `flush`/`finish` decide from what they were
      handed, never from React state (`CLAUDE.md` invariant).
    - **A failed renewal never navigates away from an open dialog.** It surfaces as the existing
      save error, and the buffer stays on screen.
    - **The closing `deleteNote` fetches its token before it is issued.** The promise outlives
      the unmount, as the unsignalled delete does today.

16. **The E2E lanes never talk to Auth0.** The UI's auth sits behind one boundary with two
    implementations, chosen at **build time** by `VITE_AUTH_MODE`:
    - `oidc` is the default and the only mode any deployed build uses.
    - `static` is for the E2E lanes. It is always signed in, with a fixed token from
      `VITE_AUTH_STATIC_TOKEN`, and never redirects.
    - The stubbed lane builds with `--mode e2e` (`.env.e2e` sets `static`), and `ApiStub`
      asserts the `Authorization` header is present.
    - The integrated lane runs the dev server in `e2e` mode. Its token is minted by
      `dotnet user-jwts` in Playwright's global setup and passed through `webServer.env`.
    - **A production build in `static` mode fails the build.** A Vite plugin check makes that
      impossible to deploy by accident.

17. **The API accepts `dotnet user-jwts` tokens in Development only.** There are two bearer
    schemes, `Auth0` and, in Development only, `Bearer` (user-jwts' own configuration section).
    A policy scheme forwards on the token's `iss`. This is what lets the integrated lane and
    `TimelyNotes.API.http` run with no network and no test account, while local `npm run dev`
    still signs in through Auth0 for real. Outside Development only `Auth0` is registered.

18. **Auth settings are required and fail at startup, named** — like `ConnectionStrings:Notes`
    (`LocalPostgres.MD` decision 2):
    - `Auth:Authority` and `Auth:Audience` are not secrets, so they live in `appsettings.json`.
    - `JwtBearerOptions.MapInboundClaims = false`, so `sub` stays `sub`.
    - The UI's `VITE_AUTH_AUTHORITY`, `VITE_AUTH_CLIENT_ID`, `VITE_AUTH_AUDIENCE` and
      `VITE_AUTH_PROVIDER_NAME` go in a
      checked-in `.env`, since an SPA client id is public. The deployed values come from GitHub
      `vars`, as `VITE_API_BASE_URL` does.

19. **Tests authenticate with a test scheme, not tokens.** `AppFixture`s register a scheme that
    authenticates from an `X-Test-User` header as `(issuer "test", subject <header>)`. A test can
    act as `alice` and `bob` in the same app, and no test needs a signing key.

20. **Concurrent edits stay last-write-wins.** The design document deferred optimistic
    concurrency to *auth and multi-user*. With one user per note, the only collision left is one
    person's two tabs, which is the case already accepted in `NoteAutosave.MD`. It is deferred
    again, not forgotten.

## Architecture

### Backend — `TimelyNotes.API/`

| Where | What |
| --- | --- |
| `Models/User.cs` | `Id`, `Issuer`, `Subject`, `CreatedAt`. |
| `Models/Note.cs` | Gains `required Guid UserId`. |
| `Auth/AuthRegistration.cs` | `AddNoteAuth(configuration, environment)`: the policy scheme, `Auth0` bearer, Development-only `Bearer`, startup failure on missing settings. |
| `Auth/UserClaims.cs` | The `timely:user_id` claim name, the only spelling of it. |
| `Auth/UserResolution.cs` | `IClaimsTransformation`: `(iss, sub)` → cached `IUserRepository.Resolve` → claim. |
| `Repositories/IUserRepository.cs` | `Task<Guid> Resolve(string issuer, string subject, CancellationToken ct)`. |
| `Repositories/InMemoryUserRepository.cs`, `PostgresUserRepository.cs` | Registered by `NoteStoreRegistration` beside the note store, same switch. |
| `Repositories/INoteRepository.cs` + both implementations | `Guid userId` first on all four methods; `Note.UserId` on upsert. |
| `Data/NotesDbContext.cs` | `DbSet<User>`, the new key, the foreign key. |
| `Data/NoteQueries.cs` | `userId` in `InRange`. |
| `Endpoints/Notes/*Request.cs` | `[FromClaim(UserClaims.Id)] Guid UserId`. `AllowAnonymous()` removed from all four endpoints. |

Request flow: JWT validated → `UserResolution` adds `timely:user_id` → FastEndpoints binds it
into the request DTO → endpoint passes `req.UserId` to the repository.

### The schema

```sql
CREATE TABLE users (
    id          uuid        PRIMARY KEY,
    issuer      text        NOT NULL,
    subject     text        NOT NULL,
    created_at  timestamptz NOT NULL,
    CONSTRAINT ak_users_issuer_subject UNIQUE (issuer, subject)
);

-- notes, after the migration
PRIMARY KEY (user_id, schedule_span_hours, day, period_ordinal),
user_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT
```

The upsert's conflict target becomes `(user_id, schedule_span_hours, day, period_ordinal)`.
`Resolve` is: `SELECT id … WHERE issuer = $1 AND subject = $2`; if absent,
`INSERT … ON CONFLICT (issuer, subject) DO NOTHING`, then select again. Two first requests
racing each get the same id.

### Frontend — `timely-notes-ui/src/`

| Where | What |
| --- | --- |
| `auth/` | `AuthBoundary` (the provider, picked by `VITE_AUTH_MODE`), `useAuth` (`status`, `email`, `tokens: TokenSource`, `signIn`, `signUp`, `signOut`), the `oidc` and `static` implementations. |
| `main.tsx` | Wraps `App` in `AuthBoundary`. |
| `components/SignInScreen.tsx` | What renders instead of `App` when signed out: the title, **Sign in**, **Create account** and the notice (decision 13). |
| `App.tsx` | Takes `tokens` from `useAuth` and passes it to every domain call. Still the only caller of `notesApi`. |
| `api/notesApi.ts` | Each call takes a `TokenSource`, sets `Authorization`, retries once on `401`. |
| `components/MenuDrawer.tsx` | *Signed in as* the email address, and **Sign out**. |
| `.env`, `.env.e2e` | The OIDC settings; the E2E mode. |

## Checklist

### 0. Auth0 setup (setup, by hand)

- [ ] Create the Auth0 tenant. Create an **API** with identifier `https://api.timely-notes`
      (the audience), RS256.
- [ ] Create a **Single Page Application**. Callback, logout and web origin URLs:
      `http://localhost:5173` and the deployed UI origin. Refresh token rotation on.
- [ ] Enable the **Username-Password-Authentication** connection with passkeys on, and the
      **Google** social connection on Auth0's default development keys — no Google Cloud setup.
      Turn off every other connection.
- [ ] Record the domain, client id and audience in `.env` and `appsettings.json`, and as GitHub
      `vars` and App Service settings for deployment.

### 1. The User entity and the schema (`Models/`, `Data/`)

- [ ] Test first: `NotesDbContext.Model` gives `User` a primary key of exactly `Id`, a unique
      key on `(Issuer, Subject)`, `text` columns and `timestamptz` for `CreatedAt`.
- [ ] Test first: `Note`'s primary key is exactly `(UserId, ScheduleSpanHours, Day,
      PeriodOrdinal)`, in that order.
- [ ] Test first: `Note.UserId` is a required foreign key to `User.Id` with delete behaviour
      `Restrict`.
- [ ] Implement `User`, `Note.UserId` and the model configuration.
- [ ] Generate the `AddUsers` migration; read it against **The schema**. Confirm `user_id` has
      no default.
- [ ] Drop and recreate `timely_notes_dev`, then `database update` (setup, by hand).

### 2. Users repositories (`Repositories/`)

- [ ] Test first: `InMemoryUserRepository.Resolve` returns the same id for the same
      `(issuer, subject)`, and different ids for a different subject **or** a different issuer.
- [ ] Test first: concurrent `Resolve` calls for one new pair return one id.
- [ ] Implement `InMemoryUserRepository` (ids are `Guid.CreateVersion7()`).
- [ ] Test first, via SQL assertions as in `PostgresUpsertSqlTests`: `PostgresUserRepository`'s
      insert is `ON CONFLICT (issuer, subject) DO NOTHING`.
- [ ] Implement `PostgresUserRepository`.
- [ ] Test first: `NoteStoreRegistration` registers the matching `IUserRepository` for each
      `Database:Provider`.

### 3. Tenancy in the note stores

- [ ] Test first: `InMemoryNoteRepository` — two users upserting the same address hold two
      notes, and each read returns only the caller's.
- [ ] Test first: a user's `Delete` of an address only another user holds returns `false` and
      leaves that note.
- [ ] Test first: `GetDayCountsBySchedule` counts only the caller's notes.
- [ ] Test first: with seeding on, a user's first read returns the seed and a second user gets
      their own copy; with seeding off, a new user's store is empty.
- [ ] Add `Guid userId` to `INoteRepository` and implement it in `InMemoryNoteRepository`.
- [ ] Test first, via `ToQueryString()`: both `NoteQueries` filter on `user_id`.
- [ ] Test first: `UpsertSql` inserts `user_id` and its conflict target leads with `user_id`.
- [ ] Implement tenancy in `PostgresNoteRepository` and `NoteQueries`.

### 4. Authentication (`Auth/`, `Program.cs`)

- [ ] Test first: startup fails naming `Auth:Authority` when it is absent, and likewise
      `Auth:Audience`.
- [ ] Test first: outside Development the only authenticate scheme is `Auth0`; in Development
      the policy forwards a `dotnet-user-jwts` issuer to `Bearer` and anything else to `Auth0`.
- [ ] Test first: `Auth0` validates issuer and audience and has `MapInboundClaims` off.
- [ ] Implement `AddNoteAuth`; `Program.cs` calls `UseAuthentication`/`UseAuthorization` before
      `UseFastEndpoints`.
- [ ] Test first: `UserResolution` adds `timely:user_id` from `(iss, sub)`, and calls the
      repository once per pair per process.
- [ ] Test first: a principal with no `sub` gets no user claim.
- [ ] Implement `UserResolution` and `UserClaims`.
- [ ] Add the `X-Test-User` test scheme to the `AppFixture`s; existing endpoint tests send it.

### 5. Endpoints

- [ ] Test first, per route: no credentials → `401`; a malformed Schedule without credentials →
      `401`, not `400`.
- [ ] Test first: `alice` and `bob` `PUT` the same address → both `201`; each `GET` returns only
      their own content; `note-days` counts only their own.
- [ ] Test first: `bob`'s `DELETE` of an address only `alice` holds → `404`, and `alice`'s note
      is still there.
- [ ] Test first: no response body contains a `userId` property.
- [ ] Add `[FromClaim] Guid UserId` to the four requests, pass it through, remove
      `AllowAnonymous()`.
- [ ] Swagger declares the bearer scheme and stays reachable anonymously.
- [ ] `TimelyNotes.API.http` sends `Authorization: Bearer {{token}}`, with a comment naming
      `dotnet user-jwts create --audience https://api.timely-notes`.

### 6. Frontend auth boundary (`auth/`)

- [ ] Test first: `static` mode is signed in immediately and its `TokenSource` yields the
      configured token.
- [ ] Test first: `oidc` mode starts signed out when nothing is stored, and `signIn` calls
      `signinRedirect` with `audience` in `extraQueryParams` (library mocked).
- [ ] Test first: `signUp` is the same redirect plus `screen_hint=signup`.
- [ ] Test first: `renew` forces a silent renew and returns the new access token.
- [ ] Implement `AuthBoundary`, `useAuth` and both modes.
- [ ] Test first: the build check rejects `VITE_AUTH_MODE=static` with `mode === 'production'`.
- [ ] Implement the check in `vite.config.ts`.

### 7. The API client (`api/notesApi.ts`)

- [ ] Test first: every call sends `Authorization: Bearer <token>` from its `TokenSource`.
- [ ] Test first: a `401` renews once and retries once, and a second `401` throws.
- [ ] Test first: a non-`401` failure does not renew.
- [ ] Implement.

### 8. The UI (`main.tsx`, `App.tsx`, components)

- [ ] Test first: signed out renders `SignInScreen` and makes no API call; **Sign in** calls
      `signIn` and **Create account** calls `signUp`.
- [ ] Test first: the notice names the provider from `VITE_AUTH_PROVIDER_NAME` and says the app
      keeps no name or email address.
- [ ] Test first: signed in renders `App`, and `App` passes the `TokenSource` to every domain
      call.
- [ ] Test first: `MenuDrawer` shows *Signed in as* the email and **Sign out** calls
      `signOut`.
- [ ] Test first: a save that fails after a failed renewal leaves the dialog open with the
      existing error status.
- [ ] Implement.

### 9. E2E lanes (after Vitest is green)

- [ ] `.env.e2e` sets `VITE_AUTH_MODE=static`; the stubbed lane builds with `--mode e2e`.
- [ ] `ApiStub` records the `Authorization` header; one stubbed spec asserts it is on every
      request.
- [ ] Integrated global setup mints a token with `dotnet user-jwts`; the dev server gets it via
      `webServer.env` in `e2e` mode.
- [ ] One `@integrated` spec: a write then a read round-trips under the minted user.

### 10. Deployment (setup)

- [ ] App Service settings carry `Auth__Authority` and `Auth__Audience`; confirm its CORS
      allows the `Authorization` header from the UI origin.
- [ ] `ui.yml` passes `VITE_AUTH_*` from `vars`.

### 11. Docs

- [ ] `DESIGN DOCUMENT.MD`: *Instance* becomes *User*. Close the authentication open question
      and the Keycloak note. The "single user with one calendar" wording becomes "each user's
      own calendar".
- [ ] `CLAUDE.md`: Navigation gains `Auth/` and `auth/`. Current state, and the setup of
      `dotnet user-jwts` for local API work.

## Verify

- [ ] `dotnet build`, `dotnet test` (from `TimelyNotes.Backend/`).
- [ ] `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`, `npm run test:e2e:integrated`.
- [ ] `npm run build -- --mode production` with `VITE_AUTH_MODE=static` fails.
- [ ] By hand, `Postgres` store, `run-dev.ps1`:
  - [ ] **Create account** opens Auth0's sign-up form; sign up with an email address.
  - [ ] Sign in with Google from the same page and see a separate, empty account.
  - [ ] Write a note, reload, and see it still there.
  - [ ] Sign out.
  - [ ] Sign up as a second address and see an empty grid at the same address.
  - [ ] In `psql`: two `users` rows, and each note under the right `user_id`.
- [ ] Deployed: sign in on the deployed UI; write and read a note.

## Deferred

- **Auth0 account linking** — decision 12.
- **Own Google OAuth keys.** Google sign-in runs on Auth0's development keys:
  - Google's consent screen names Auth0.
  - A Google user may be asked to sign in again in a new tab, where an email-and-password user
    is not.

  Replacing the keys is an Auth0 dashboard change, not a code change.
- **Account deletion and data export** — decides `ON DELETE`, decision 10.
- **Changing the email address** — that is the provider's account settings, not this app's.
- **Row-level security** in Postgres as defence in depth behind decision 6.
- **Optimistic concurrency** — decision 20.
- **Persistence for the deployed app** — still `Memory`; per-user notes vanish on restart.
- **Per-user Schedules** — Schedules stay code; every user has `s1`/`s3`/`s6`.
- **Per-user timezone** — the design document's Schedule-carries-a-timezone note is unchanged.
- **`EmptyNotePruning.MD`** — when scheduled, its SQL gains `user_id`.

## Implementation notes


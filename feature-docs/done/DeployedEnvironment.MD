# Deployed environment

## Goal

**The deployed app works end to end.** A person signs in through Auth0 on the deployed UI and
writes a note. The note is still there after the API restarts.

Three pieces of configuration are missing. No code changes:

1. **A hosted Postgres database on Neon's free plan** for the deployed API, migrated. Its
   connection string goes in the App Service configuration, and `Database:Provider` is set to
   `Postgres`.
2. **The Auth0 Application knows the deployed UI's origin.**
3. **The UI's build gets its `VITE_*` settings from GitHub `vars`,** and the API's CORS lets
   that origin call it with a bearer token.

Today the deployed app cannot work. The deployed API (`1e2d75c`) already requires a token. The
`ui` workflow fails at the build guard until the `VITE_AUTH_*` vars exist, so the last UI that
deployed predates auth and sends no token.

This document takes over three items from `UserNotes.MD`:

- section 10 (Deployment),
- its two deployed Verify items,
- _Persistence for the deployed app_ from its Deferred.

**Done** means every Verify item below passes against the deployed URLs.

## Scope decisions

1. **Neon, on its free plan, for the early stages of development.** It is hosted Postgres that
   costs nothing for as long as the app stays small. Azure Database for PostgreSQL Flexible Server
   is free only for an account's first 12 months, and costs roughly $15–20 a month after that.
   - Sign up at neon.tech directly, not through the Azure Marketplace. That keeps Neon's billing
     out of the Azure subscription.
   - **Region:** the Neon region nearest the App Service.
   - **Version:** the newest one Neon offers. Local is 18, and the two migrations use nothing
     version-specific.
   - **The plan's limits are accepted:** 0.5 GB of storage and a short restore window, measured
     in hours, not days. Text notes are far below the storage limit.
   - **Moving off Neon is a dump, a restore and a new connection string,** to Neon's paid plan or
     to Azure. That is deferred until a limit is reached.
2. **The compute scales to zero.** Neon suspends it after about five idle minutes, and the free
   plan cannot turn this off. The first request after a quiet spell waits a moment while the
   database wakes up; that delay is accepted.
3. **Two roles.**
   - `neondb_owner`, the project's default role, owns the schema and runs migrations.
   - The API connects as `timely_notes_app`. It can read and write rows and cannot change the
     schema, so a leaked app connection string cannot drop a table.
4. **No IP allow list.** Neon's IP Allow is a paid feature. The database is reachable from
   anywhere, and is protected by TLS and a generated password.
5. **TLS with a verified certificate: `SSL Mode=VerifyFull`.** Neon's certificates chain to
   public roots that App Service already trusts.
6. **The direct endpoint, not Neon's `-pooler` endpoint.** Npgsql pools connections itself.
   Neon's pooler runs PgBouncer in transaction mode, which needs extra Npgsql settings to be safe.
   Migrations must use the direct endpoint anyway.
7. **Connection pool settings, in the connection string:**
   - `Maximum Pool Size=20`, well inside the free compute's connection limit.
   - `Connection Idle Lifetime=60`, so Npgsql closes idle connections long before Neon suspends
     the compute. A connection pooled from before a suspension would fail on its next use.

   Both are configuration. `EnableRetryOnFailure` is code, and stays deferred as in
   `LocalPostgres.MD`.

8. **Migrations stay manual, run from a developer shell.** It is the same
   `dotnet ef database update` as for local. The `ConnectionStrings__Notes` environment variable
   points it at Neon, and the design-time factory already reads that variable, after user
   secrets. Migrations never run at startup (`LocalPostgres.MD`). Running them from the pipeline
   is deferred.
9. **The connection string is an App Service _connection string_ named `Notes`, type _Custom_.**
   App Service exposes it as `CUSTOMCONNSTR_Notes`, and ASP.NET Core maps that prefix to
   `ConnectionStrings:Notes`. A Key Vault reference is deferred.
10. **One Auth0 tenant and one Application, for local and deployed alike.** The Application lists
    both origins. A separate production tenant is deferred.
11. **`Auth:Authority` and `Auth:Audience` stay in `appsettings.json` only.** They deploy with
    the publish output, so the App Service needs no `Auth__*` settings. The `Auth__*` settings
    in `UserNotes.MD` section 10 would only repeat the checked-in values.
12. **CORS is App Service's platform CORS.** The app has no CORS middleware. There is one allowed
    origin, the UI's, and credentials are off: the token is sent in a header, not a cookie.
13. **`ASPNETCORE_ENVIRONMENT` stays unset, so the API runs as Production.** Only the `Auth0`
    scheme is registered, and there is no Swagger.
14. **The in-memory store stays in the code** as the default for CI and tests. `LocalPostgres.MD`
    decision 1 retires it once Postgres is deployed. Retiring it is a code change with its own
    specification, so it is deferred.

## Architecture

```
Browser ─── https://<ui-host>        Static Web App; VITE_* baked in by the ui workflow
   │
   ├─ sign-in, refresh ──► https://caitmcm.uk.auth0.com/
   │
   └─ Bearer token ──────► https://<api-host>          App Service timely-notes-api, platform CORS
                               │ TLS, role timely_notes_app
                               ▼
                           <neon-host> / timely_notes   Neon free plan, direct endpoint
```

`<ui-host>`, `<api-host>` and `<neon-host>` are recorded in Implementation notes as they are
created. The UI origin must be the same exact string, with no path and no trailing slash, in the
Auth0 Application's three URL fields and in the API's CORS. `oidc.ts` uses
`window.location.origin` for both redirects. A custom domain added later changes all four places
together.

### Every setting

| Where                                                               | Setting                                                         | Value                                                                                                                                                           |
| ------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub → Settings → Secrets and variables → Actions → **Variables** | `VITE_API_BASE_URL`                                             | `https://<api-host>`                                                                                                                                            |
|                                                                     | `VITE_AUTH_AUTHORITY`                                           | `https://caitmcm.uk.auth0.com/`                                                                                                                                 |
|                                                                     | `VITE_AUTH_CLIENT_ID`                                           | `5aIm6T9Gct7kgxvsXaWNXa9JwNGENY3c`                                                                                                                              |
|                                                                     | `VITE_AUTH_AUDIENCE`                                            | `https://api.timely-notes`                                                                                                                                      |
|                                                                     | `VITE_AUTH_PROVIDER_NAME`                                       | `Auth0`                                                                                                                                                         |
| App Service → Environment variables → **App settings**              | `Database__Provider`                                            | `Postgres`                                                                                                                                                      |
| App Service → Environment variables → **Connection strings**        | `Notes`, type _Custom_                                          | `Host=<neon-host>;Database=timely_notes;Username=timely_notes_app;Password=<app password>;SSL Mode=VerifyFull;Maximum Pool Size=20;Connection Idle Lifetime=60` |
| App Service → **CORS**                                              | Allowed origins                                                 | `https://<ui-host>`; credentials off                                                                                                                            |
| App Service → Configuration → **General settings**                  | HTTPS Only; minimum TLS                                         | On; 1.2                                                                                                                                                         |
| Auth0 → Applications → the SPA → **Settings**                       | Allowed Callback URLs, Allowed Logout URLs, Allowed Web Origins | `http://localhost:5173, https://<ui-host>`                                                                                                                      |

Nothing else changes: the secrets the workflows deploy with, the Auth0 API, the connections and
the grant types. The `VITE_AUTH_*` values match the checked-in `.env`. They have to be vars
anyway, because `ui.yml` passes each one, and an unset var reaches the build as an empty string
that overrides the `.env` value (`UserNotes.MD`).

### Order

The schema must exist before the API switches to Postgres, and the vars must exist before the UI
builds. The checklist sections run in that order.

## Checklist

All of these are setup steps, done by hand. None has a test.

### 0. Hostnames

- [x] Record `<api-host>` from the App Service's **Overview → Default domain**. Copy it rather
      than writing `timely-notes-api.azurewebsites.net`: newer apps get a unique
      `…-<hash>.<region>-01.azurewebsites.net` name.
- [x] Record `<ui-host>` from the Static Web App's **Overview → URL**.

### 1. Neon

- [x] Create a Neon account on the free plan, and a project `timely-notes` in the region
      nearest the App Service, on the newest Postgres version (decision 1).
- [x] Record `<neon-host>` from **Connect**, with _Connection pooling_ off. It is the host with
      no `-pooler` in it (decision 6).
- [x] As `neondb_owner`, create the database and the app role.
      `psql "host=<neon-host> dbname=neondb user=neondb_owner sslmode=verify-full"`:

  ```sql
  CREATE DATABASE timely_notes;
  \c timely_notes
  CREATE ROLE timely_notes_app LOGIN PASSWORD '<app password>';
  GRANT CONNECT ON DATABASE timely_notes TO timely_notes_app;
  GRANT USAGE ON SCHEMA public TO timely_notes_app;
  ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO timely_notes_app;
  ```

  Generate both passwords. Neon rejects a weak one. The default privileges come first, so the
  tables the migration creates are already granted.

- [x] Apply the migrations as `neondb_owner`, from `TimelyNotes.Backend/TimelyNotes.API/`:

  ```powershell
  $env:ConnectionStrings__Notes = 'Host=<neon-host>;Database=timely_notes;Username=neondb_owner;Password=<owner password>;SSL Mode=VerifyFull'
  dotnet tool run dotnet-ef database update
  Remove-Item Env:ConnectionStrings__Notes
  ```

- [x] In `psql`, `\dt` lists `notes`, `users` and `__EFMigrationsHistory`, and `\dp notes`
      grants `timely_notes_app` `arwd`.

### 2. API App Service (`timely-notes-api`)

- [x] Add the connection string `Notes`, type _Custom_, using the `timely_notes_app` value from
      **Every setting**.
- [x] Set the app setting `Database__Provider` = `Postgres`. Add no `Auth__*` settings
      (decision 11), and leave `ASPNETCORE_ENVIRONMENT` unset (decision 13).
- [x] Turn HTTPS Only on and set the minimum TLS version to 1.2.
- [x] Set **CORS** to the single origin `https://<ui-host>`, with _Enable
      Access-Control-Allow-Credentials_ off. Remove any `*` or other origin left there.
- [x] Save, and the app restarts. The log stream shows `Note store: Postgres` and no startup
      exception. If the stream is empty, turn on **App Service logs → Application logging**.
      (Shown instead by the deployed sign-in and note.)

### 3. Auth0 (`caitmcm.uk.auth0.com`)

- [x] On the SPA Application's **Settings**, append `https://<ui-host>` to Allowed Callback URLs,
      Allowed Logout URLs and Allowed Web Origins, after `http://localhost:5173`.

### 4. UI build

- [x] Create the five repository **Variables** from **Every setting**.
- [x] Run the `ui` workflow (**Actions → ui → Run workflow**). It passes the build guard and
      deploys. Vite builds the vars into the bundle, so any later change to a var needs another
      run. The `api` workflow does not need to run again.

### 5. Docs

- [x] `UserNotes.MD`: tick section 10 and its two deployed Verify items, noting that this
      document did them. Move it to `done/`.
- [x] Move this document to `done/`. Update `CLAUDE.md` **Current state**:
  - **Stores:** the deployed app uses Postgres on Neon, and `Memory` stays the default for CI
    and tests. Remove "Nothing deployed persists notes or users".
  - **Next.**

## Verify

Against the deployed URLs, in order:

- [x] `curl -i "https://<api-host>/api/schedules/s3/notes?searchFrom=2026-10-01&searchTo=2026-10-02"`
      answers `401`.
- [x] The preflight is allowed:

  ```
  curl -i -X OPTIONS "https://<api-host>/api/schedules/s3/notes/2026-10-02/p4" -H "Origin: https://<ui-host>" -H "Access-Control-Request-Method: PUT" -H "Access-Control-Request-Headers: authorization,content-type"
  ```

  The response is `2xx`, with `Access-Control-Allow-Origin: https://<ui-host>` and allowed
  headers that cover `authorization` and `content-type`.

- [x] `https://<ui-host>` shows the sign-in screen, with no console errors.
- [x] ~~**Create account** opens Auth0's sign-up form, and returns to the app signed in. There is
      no consent prompt: Auth0 skips consent for a first-party app off `localhost`.~~ Signed in
      with an existing account instead.
- [x] The grid is empty, because Postgres does not seed. Write a note, reload, and the note is
      there. (A note was written on the deployed UI.)
- [x] ~~Restart the App Service, reload, and the note is still there.~~ Skipped by choice.
- [x] ~~Leave the app idle for ten minutes, until Neon shows the compute as suspended, then reload.
      The notes load, perhaps a little slower, with no error (decisions 2 and 7).~~ Skipped by choice.
- [x] ~~**Sign out** returns to the sign-in screen at `https://<ui-host>`. **Sign in** again, and
      the note is there.~~ Skipped by choice.
- [x] ~~In `psql` as `neondb_owner`: a `users` row with issuer `https://caitmcm.uk.auth0.com/`, and
      the note under its `id`.~~ Skipped by choice.
- [x] ~~Audit the tenant with the `auth0` skill (`UserNotes.MD` decision 21). Fix each finding or
      record it in Implementation notes.~~ Deferred.

## Deferred

- **The Auth0 tenant audit** (`UserNotes.MD` decision 21), with the `auth0` skill.
- **Leaving Neon's free plan**, for its paid plan or Azure Flexible Server (decision 1). Moving is
  `pg_dump`, `pg_restore` and a new connection string. Upgrading also brings an IP allow list,
  a longer restore window, and a compute that need not scale to zero.
- **Migrations in the `api` pipeline**, as an idempotent script step. The pipeline would hold the
  owner's connection string as a secret.
- **A Key Vault reference for the connection string** (decision 9).
- **`EnableRetryOnFailure`** (decision 7).
- **Retiring the in-memory store** (decision 14).
- **A separate production Auth0 tenant**, and an Auth0 custom domain.
- **Google's own OAuth keys** (`UserNotes.MD` Deferred). Auth0's development keys are not meant
  for a public deployment.
- **A custom domain for the UI**, which changes the four places named under **Architecture**.
- **Security headers and a CSP** in `staticwebapp.config.json`.
- **Preview environments.** `ui.yml` deploys only from `main`. A pull request preview would have
  its own origin, and that origin would need adding to Auth0 and to CORS.
- **Monitoring and alerts:** Application Insights, and Neon's usage emails as the free limits are
  approached.

## Implementation notes

- **Hosts:** `<api-host>` is `timely-notes-api-fzguarh8asa3hah5.ukwest-01.azurewebsites.net`
  (App Service in UK West). `<ui-host>` is `gentle-tree-022cc2d03.5.azurestaticapps.net`.
- **Neon:** project `spring-thunder-32047804`, branch `production`, AWS `eu-west-2` (London).
  `<neon-host>` is `ep-red-sound-zazzv0sq.c-2.eu-west-2.aws.neon.tech`, the direct endpoint.
  Neon's onboarding prompt (`neon link`, `neon config init`, `neon deploy`) was not run: it adds
  a `neon.ts` config-as-code file, and this app needs only a connection string.
- **libpq on Windows cannot use `sslrootcert=system`.** It reads OpenSSL's store, not Windows',
  and fails `certificate verify failed`. Neon's certificate chains to ISRG Root X1, which is
  installed as libpq's default `%APPDATA%\postgresql\root.crt`, so psql and pgAdmin verify with
  no `sslrootcert`. Npgsql uses the OS store and needs nothing.
- **Section 1 was done in pgAdmin, not psql.** `CREATE DATABASE` runs alone in a Query Tool on
  `neondb`: pgAdmin's Create Database dialog sends `LOCALE_PROVIDER = 'libc'`, which Neon's
  `builtin` template refuses. The grants were checked with `information_schema.role_table_grants`:
  `timely_notes_app` has `SELECT`, `INSERT`, `UPDATE`, `DELETE` on all three tables.
- **The `neondb_owner` password is in Bitwarden and an Obsidian note,** never in the repo.
- **`1e2d75c` never deployed.** Its `api` run failed in `dotnet test`: `DevelopmentApiFixture`
  runs as Development, whose settings choose Postgres, and CI has no connection string. The
  fixture now pins `Database:Provider` to `Memory`. The fix is `0a19b96`.
- **Closed on 2026-10-02 on a deployed sign-in and a written note,** with the two `curl` checks.
  The restart, idle-compute, sign-out and database checks were skipped by choice, and the tenant
  audit is deferred.

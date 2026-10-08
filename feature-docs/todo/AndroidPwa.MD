# Android PWA

## Goal

**Timely Notes runs on an Android phone as the deployed website, installed to the home screen.**
The period grid is a glance-and-jot interface, and the phone is where the glancing happens.

There is no native app and no second build. The phone runs the same bundle, from the same origin,
against the same API as a desktop browser. Three things change:

1. **The layout works at a phone's size and under a finger.** No horizontal scroll at 360 CSS px,
   no target under 44 px, and the note dialog still usable with the on-screen keyboard up.
2. **The site is installable.** A web app manifest and icons, so Chrome on Android installs it as
   a WebAPK: a launcher icon, a task-switcher entry, and no browser chrome.
3. **Sign-in survives a cold launch of the installed app.** Android closes a backgrounded app
   freely. Today the session is in `sessionStorage`, which a new launch does not keep, so the
   installed app would show the sign-in screen almost every time it opened.

Desktop stays the development and test platform, and stays a deployed target in its own right.
`run-dev.ps1`, the Vite proxy, Vitest and both Playwright lanes run exactly as now. Nothing is
built, run or debugged on Android. The phone is checked once, by hand, against the deployed site.

**Done** means every Verify item passes, including the one-off run-through on a phone.

Following TDD (per `CLAUDE.md`): write a failing test before each piece of code below.

## Scope decisions

1. **The deployed website, installed as a PWA, rather than a native app.** The intention is
   "usable on my phone", and the website already is the app. Making it phone-fit and installable
   gets that with no second codebase, build, origin or release process. The options considered:

   | Option | What it is | Verdict |
   | --- | --- | --- |
   | **The website in Chrome** | `https://<ui-host>` in a browser tab | Works today apart from the layout. This feature makes it good. It is also the fallback for anyone who does not install. |
   | **Installed PWA** | The same site, plus a manifest. Chrome installs it as a WebAPK. | **Chosen.** It adds a launcher icon and standalone display. It needs no change to Auth0, CORS, the API or the `ui` workflow, because the origin does not change. A deploy updates the phone on its next launch. |
   | **Trusted Web Activity** (Bubblewrap, PWABuilder) | A Play Store package that opens the PWA in Chrome | **Deferred.** It is only worth doing for a store listing. It costs a signing key, a Digital Asset Links file, and a Play Console account. It builds on this feature, and replaces none of it. |
   | **Capacitor** (or Tauri 2 mobile) | The Vite build bundled into an Android WebView | **Rejected.** Sign-in can be made to work, but not as it works today. Google blocks OAuth in an embedded WebView (`disallowed_useragent`), so sign-in has to leave for the system browser and come back through a custom-scheme deep link. That means `@capacitor/browser`, `@capacitor/app`, a native Auth0 Application, and a new `https://localhost` origin for CORS. It also needs a second build with its own API URL, Android Studio, Gradle and signing, and APK releases separate from SWA deploys. Every one of those is a moving part that, per the brief, would never be tested. In return it gives native APIs this app does not use. |
   | **React Native / Expo** | A second UI, written natively | **Rejected.** It means rewriting every component. `@mdxeditor/editor` has no React Native equivalent, so there would be two UIs to keep in step. |

   Reopen a native wrapper only for something the web cannot do on Android. Push notifications,
   share-target, offline and private on-device storage (IndexedDB, OPFS) are all web features
   there, so none of them is a reason. Writing user-visible files into shared storage is one,
   because Chrome on Android has no File System Access API. Obsidian's model, a watched folder of
   markdown, needs exactly that (`IDEAS.MD`, _A mobile app that keeps notes as files_).

2. **No service worker.** Since Chrome 108 on Android, a site with a valid manifest can be
   installed from the menu (⋮ → _Install app_) without one. A service worker brings a caching and
   update policy that has to be right. A stale `/api` response is worse than an error, and a stale
   bundle against a changed API is worse still. Without a service worker:
   - Chrome shows no automatic install prompt. Its prompt still requires a `fetch` handler.
     Installing from the menu is fine for the people who use this app.
   - An offline launch shows Chrome's default offline page, carrying the app's name and icon. That
     is accepted; every note comes from the API anyway.

3. **Same origin, same redirects.** `oidc.ts` already uses `window.location.origin`. The installed
   app opens Auth0 inside its own window, as a Custom Tab-style overlay, and comes back to the
   origin. That window is Chrome, not a WebView, so Google sign-in works. Auth0's Allowed URLs and
   the App Service CORS stay as they are (`DeployedEnvironment.MD`).

4. **Persistent session in the installed app only.** When the page runs in
   `(display-mode: standalone)`, `oidc-client-ts`'s user store is `localStorage`. In a browser tab
   it stays `sessionStorage` (`UserNotes.MD` decision 14).
   - Why the installed app needs it: in the installed app, every launch after Android has closed
     the app would start signed out.
   - Why only there: the installed app is a single window. Browser tabs that shared one rotating
     refresh token in `localStorage` could race each other to rotate it. Auth0's reuse detection
     would then revoke the whole family and sign every tab out.
   - The XSS argument of decision 14 applies to `localStorage` equally.
   - Auth0's refresh-token lifetimes stay at their defaults, 30 days absolute and 15 days idle. The
     installed app asks for a sign-in at most that often.

5. **A stored session with an expired access token renews before the app decides it is signed
   out.** A persisted session will often be hours old, past the access token's lifetime but well
   inside the refresh token's. While that renewal runs, `status` stays `loading`. If renewal
   fails, the stale user is removed and the app is `signedOut`. A browser tab reopened after a
   day benefits too.

6. **The breakpoints key on capability, not on the device.**
   - Target sizes come from `(pointer: coarse)`.
   - The full-screen note dialog comes from `(max-width: 40rem)`.
   - Sticky-hover fixes come from `(hover: hover)`.

   No user-agent sniffing, and no `Android` in the code. A narrow desktop window gets the
   full-screen dialog too, which is correct.

7. **Targets are at least 44 × 44 CSS px under a coarse pointer** (WCAG 2.5.5).
   - **Rows:** `--day-height` rises to `72rem` so that a 1h row is 48 px. `s3` and `s6` rows scale
     with it, because a day is one height under every Schedule (`App.css`). The grid gets taller,
     which means more scrolling, and that is the accepted price.
   - **Buttons:** every app-styled button reaches 44 px in height.
   - **MDXEditor's own toolbar** is third-party and is excluded (Deferred).

8. **Three days stay on a phone.** `.schedule-view` is already the only scroll container, and it
   behaves the same under a finger. A one-day phone view is a separate design question (Deferred).

9. **The keyboard resizes the layout:**
   `<meta name="viewport" content="…, interactive-widget=resizes-content">`.
   - By default Chrome resizes only the visual viewport, so a centred dialog can sit behind the
     keyboard.
   - With `resizes-content`, `100dvh` and the layout shrink with the keyboard. The full-screen
     note dialog keeps **Done** on screen, and its editor scrolls inside it.
   - On desktop the setting does nothing.

10. **The Android back gesture is Escape.** Chrome sends a close request to an open modal
    `<dialog>` through `CloseWatcher`. That fires `cancel`, the same path Escape takes, so the note
    dialog, calendar and drawer close on back with their existing save and focus behaviour. No
    code is written for it. With no dialog open, back leaves the app, which is what an Android
    user expects.

11. **Phone layout is tested on the desktop, in the `stubbed` lane.**
    - Chromium's phone emulation (`isMobile`, `hasTouch`) at 360 × 640 is the smallest common
      Android width. These are exactly the checks jsdom cannot make (`LeanStubbedLane.MD`).
    - They live in one new spec under `test.use(...)`. That means no new Playwright project and no
      new script, and `npm run test:e2e` runs them.
    - The thresholds 44 and 360 are the requirement, not a restatement of `App.css`.

12. **A real icon.** `public/favicon.svg` is Vite's template logo, which must not end up on a home
    screen.
    - A new `public/icon.svg` mark is the single source for the favicon and the PNGs.
    - The PNGs are generated once with `npx @vite-pwa/assets-generator --preset minimal-2023` and
      checked in. The generator is never a dependency.

13. **The backend is not touched.**

## Architecture

Frontend only, `timely-notes-ui`. No new runtime dependency.

```
public/
  icon.svg                       new: the app mark (also the favicon; favicon.svg removed)
  pwa-64x64.png, pwa-192x192.png, pwa-512x512.png, maskable-icon-512x512.png
                                 generated from icon.svg, checked in
  manifest.webmanifest           new: name, short_name, start_url "/", scope "/",
                                 display "standalone", background_color, theme_color, icons
  staticwebapp.config.json       + "mimeTypes": { ".webmanifest": "application/manifest+json" }
index.html                       + <link rel="manifest">, theme-color metas (light, dark),
                                 icon.svg favicon, interactive-widget=resizes-content
src/
  installable.test.ts            new: reads index.html and the manifest from disk
  auth/displayMode.ts            new: isStandalone(matchMedia) — the only display-mode read
  auth/oidc.ts                   createUserManager({ …, persistent }) picks the user store
  auth/AuthBoundary.tsx          passes persistent: isStandalone(window.matchMedia)
  auth/OidcAuth.tsx              expired stored user → signinSilent before deciding status
  App.css                        @media (pointer: coarse), (max-width: 40rem), (hover: hover)
e2e/
  phone.spec.ts                  new: stubbed lane, 360 × 640, isMobile + hasTouch
```

The data flow is unchanged. `App` still owns every domain call, the API is reached at
`VITE_API_BASE_URL`, and the `ui` workflow deploys `dist/` to the same Static Web App. Everything
in `public/` lands in `dist/` as it is.

**Manifest values.**

| Field | Value |
| --- | --- |
| `name` | `Timely Notes` |
| `short_name` | `Timely Notes` |
| `start_url` | `/` |
| `scope` | `/` |
| `display` | `standalone` |
| `background_color` | the light `--surface`, `#ffffff` |
| `theme_color` | the light `--surface`, `#ffffff` |
| `icons` | the three `pwa-*` PNGs (`purpose: "any"`), plus `maskable-icon-512x512.png` (`purpose: "maskable"`) |

`index.html` carries a light and a dark `theme-color` meta, so the status bar follows the colour
scheme. The splash screen cannot follow it (Deferred).

## Checklist

### 1. Sign-in survives a cold launch

- [ ] `isStandalone(matchMedia)` in `auth/displayMode.ts` is true exactly when
      `(display-mode: standalone)` matches. Test with a stubbed `matchMedia`; jsdom has none.
- [ ] `createUserManager({ …, persistent: true })` stores the user in `localStorage`, and
      `persistent: false` in `sessionStorage`. Test in a new `oidc.test.ts` by signing a user into
      the store and reading which storage holds it.
- [ ] `AuthBoundary` passes `persistent: isStandalone(window.matchMedia)`. Extend
      `AuthBoundary.test.tsx` for both display modes.
- [ ] A stored user whose access token has expired, and who has a refresh token, causes one
      `signinSilent()`. `status` stays `loading` until it settles, then becomes `signedIn`. Test
      in `OidcAuth.test.tsx`. First check whether `react-oidc-context` already does this. If it
      does, the test pins that behaviour and no code is written.
- [ ] When that renewal fails, the stored user is removed and `status` is `signedOut`, with no
      error surfaced. Test in `OidcAuth.test.tsx`.

### 2. A phone-sized layout

- [ ] `e2e/phone.spec.ts` runs at 360 × 640 with `isMobile` and `hasTouch`, and its first test
      shows `(pointer: coarse)` and `(hover: none)` match. If Chromium's emulation does not flip
      them, record that here and key decision 7 on `(max-width: 40rem)` instead.
- [ ] At 1h, every period row is at least 44 px tall (`--day-height: 72rem` under
      `(pointer: coarse)`). Test in `phone.spec.ts`. The existing desktop `layout.spec.ts` stays
      green and unchanged.
- [ ] Every visible app button is at least 44 px tall under a coarse pointer, outside
      `.mdxeditor-toolbar`. Check this in four states: the main view with a row selected, the
      drawer, the calendar, and the note dialog. Test in `phone.spec.ts`.
- [ ] Nothing scrolls horizontally at 360 px in those same four states:
      `document.documentElement.scrollWidth` ≤ its `clientWidth`, and each open dialog's box lies
      within the viewport. Test in `phone.spec.ts`. The header's three icons and title are the
      likeliest overflow.
- [ ] Under `(max-width: 40rem)` the note dialog fills the viewport. The editor area scrolls
      inside it, and the actions stay pinned at its foot. Test in `phone.spec.ts`: at 360 × 400
      (standing in for the keyboard), with a note longer than the dialog, **Done** is in the
      viewport and the page has not scrolled.
- [ ] `:hover` rules (`.schedule-view__step`, `.menu-drawer__close`) sit behind
      `@media (hover: hover)`, so a tap leaves no stuck highlight. This is CSS only, with no test.
      It is checked in the phone run-through.

### 3. Installable

- [ ] `public/icon.svg` is a new app mark that reads at 48 px and fits the maskable safe zone (the
      centre 80%). `index.html` uses it as the favicon, and `favicon.svg` is deleted. This is a
      setup step.
- [ ] The four PNGs are generated from it with
      `npx @vite-pwa/assets-generator --preset minimal-2023 public/icon.svg` and checked in. This
      is a setup step. Record the exact command and version in Implementation notes.
- [ ] `public/manifest.webmanifest` has the fields under **Architecture**. Test in
      `src/installable.test.ts`:
  - `display` is `standalone`, and `start_url` and `scope` are `/`;
  - icons at 192 and 512 are present, and a `maskable` one at 512;
  - every `src` it names exists in `public/`.
- [ ] `index.html` links the manifest, carries both `theme-color` metas, and has `interactive-widget=resizes-content` in its viewport. Test in `src/installable.test.ts`.
- [ ] `staticwebapp.config.json` maps `.webmanifest` to `application/manifest+json`. This is a
      setup step, checked by `curl` under Verify.

### 4. Docs

- [ ] `CLAUDE.md`:
  - **Navigation:** add `auth/displayMode.ts`, and add `phone` to the stubbed spec list.
  - **Current state:** the session store rule; installable as a PWA with no service worker; the
    stubbed test count.
  - Move this document to `done/`.

## Verify

Desktop, as for every feature:

- [ ] `npm test`, `npm run lint` and `npm run build` are green.
- [ ] `npm run test:e2e` is green, with the stubbed count up from 15 by the new `phone.spec.ts`
      tests.
- [ ] `npm run test:e2e:integrated` (5 tests) and `dotnet test` are green and unchanged.
- [ ] `run-dev.ps1`: sign in, write a note, reload. The note is there, and a new tab still does
      one silent redirect, because a tab keeps `sessionStorage`.
- [ ] In Chrome DevTools device mode at 360 px, the view, drawer, calendar and dialog look right.

Deployed, after the `ui` workflow runs:

- [ ] `curl -I https://<ui-host>/manifest.webmanifest` answers `200` with
      `Content-Type: application/manifest+json`.
- [ ] In desktop Chrome at `https://<ui-host>`, DevTools **Application → Manifest** shows the
      icons and no installability errors.

On an Android phone, once, by hand. This is not a test lane:

- [ ] Open `https://<ui-host>` in Chrome. ⋮ → _Install app_ installs it, and its icon is on the
      launcher.
- [ ] Launched from the icon, it shows no address bar.
- [ ] **Sign in** opens Auth0 in the app's window and returns signed in, for both an email account
      and Google.
- [ ] Write a note: the keyboard does not cover **Done**, and the note saves.
- [ ] The back gesture closes an open note, and the note is saved.
- [ ] Swipe the app away and relaunch it. It is still signed in, and the note is there.
- [ ] Taps leave no stuck hover highlight.
- [ ] Leave it in the background over a period boundary and reopen it. The current period has
      moved on, by the same `visibilitychange` path a tab uses.
- [ ] **Sign out** returns to the sign-in screen. Relaunching shows that screen too.

## Deferred

- **A service worker:** Chrome's automatic install prompt, an offline shell, and an update flow
  (decision 2). It needs a caching policy that never serves `/api`.
- **A Play Store listing through a Trusted Web Activity.** It needs Bubblewrap or PWABuilder,
  `/.well-known/assetlinks.json`, a signing key, and a Play Console account.
- **A native wrapper (Capacitor)**, only for a capability the Android web lacks (decision 1).
- **iOS.** Safari's PWA support differs, and nothing here was checked against it.
- **MDXEditor's toolbar on a phone:** its target sizes, and perhaps a smaller toolbar under a
  coarse pointer.
- **A one-day view on a phone** (decision 8).
- **Edge-to-edge display** (`viewport-fit=cover` with `env(safe-area-inset-*)`), and landscape.
- **A dark splash screen.** The manifest takes one `background_color`.
- **`localStorage` for browser tabs too.** It would need a guard against two tabs rotating one
  refresh token (decision 4), or Auth0's reuse interval set above zero.
- **Web push and `share_target`**, both available to an installed PWA on Android.
- **A mobile app that keeps notes as files, the Obsidian way** (`IDEAS.MD`). It is a separate
  architecture: Capacitor, a device folder, no API.

## Implementation notes

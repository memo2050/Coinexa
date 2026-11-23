# Stage 0 — Visual baseline of the original Coinexa (Base44)

Purpose: record how the live Base44 version of Coinexa looks **before** any migration work,
so later stages can be compared against it. Read-only: nothing on coinexa.net or in
Base44 was changed, no data was submitted, no accounts were created.

- Source: https://coinexa.net (live Base44 deployment)
- Captured: 2026-11-23 (UTC) in a signed-out cloud browser
- Viewports: desktop 1440×900, mobile 500×900
- Code baseline: commit `9162c32` / tag `base44-original`

## Finding: the live site is fully behind a login wall

Every route tested redirects a signed-out visitor to the Base44 hosted login page
(`/login?from_url=...`): `/`, `/privacy`, `/forgot-password`.

That differs from the code in this repo, where `/`, `/privacy`, `/terms`, `/register`
and `/forgot-password` are public routes (see `src/App.jsx`). The most likely cause is the
Base44 app's visibility setting ("require login"), not the code. The migrated version
must decide deliberately which behaviour to keep.

The login screen offers Google, Microsoft, Facebook and Apple sign-in plus email/password.
Those providers need replacing when Base44 auth is removed.

## Screenshots captured

| # | Page | Desktop | Mobile |
|---|------|---------|--------|
| 1 | Login (top) | [01-login.png](screenshots/desktop/01-login.png) | [01-login.png](screenshots/mobile/01-login.png) |
| 2 | Login (bottom: forgot password / sign up links) | [02-login-bottom.png](screenshots/desktop/02-login-bottom.png) | (included in mobile 01) |

## Still to capture (needs the owner signed in)

These pages are behind sign-in. Capture them while signed in as the owner, viewing only:

- `/` Home (signed-in view)
- `/agents`, `/agents/new`, `/agents/:id`
- `/tasks`, `/inbox`, `/usage`, `/security-check`
- `/admin`, `/admin/agents`, `/admin/runs`, `/admin/usage`, `/admin/customers`,
  `/admin/billing`, `/admin/reports`, `/admin/activity`
- `/privacy`, `/terms`
- 404 page (any unknown path)
- Sign-up and forgot-password views of the login card

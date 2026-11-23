# Stage 0 — Visual baseline of the original Coinexa (Base44)

Purpose: record how the live Base44 version of Coinexa looks **before** any migration work,
so later stages can be compared against it. Read-only: nothing on coinexa.net or in
Base44 was changed, no forms were submitted, no accounts were created.

- Source: https://coinexa.net (live Base44 deployment, public/"published" mode)
- Captured: 2026-11-23 (UTC), signed-out cloud browser
- Viewports: desktop 1440×900 (images 1389×868), mobile 500×900
- Code baseline: commit `9162c32` / tag `base44-original`

## Screenshots

| # | Page / section | Desktop | Mobile |
|---|----------------|---------|--------|
| 10 | Home: hero | [desktop](screenshots/desktop/10-home-hero.png) | [mobile](screenshots/mobile/10-home-hero.png) |
| 10a | Home: showreel video | [desktop](screenshots/desktop/10a-home-showreel.png) | [mobile](screenshots/mobile/10a-home-showreel.png) |
| 10b | Home: mobile menu open | n/a | [mobile](screenshots/mobile/10b-home-menu-open.png) |
| 11 | Home: stats, client logos, services intro | [desktop](screenshots/desktop/11-home-stats-services.png) | [mobile](screenshots/mobile/11-home-stats-services.png) |
| 11a | Home: services grid | [desktop](screenshots/desktop/11a-home-services.png) | — |
| 12 | Home: AI agents | [desktop](screenshots/desktop/12-home-ai-agents.png) | — |
| 13 | Home: portfolio | [desktop](screenshots/desktop/13-home-portfolio.png) | — |
| 13a | Home: process | [desktop](screenshots/desktop/13a-home-process.png) | — |
| 13b | Home: agent explainer video (tone / speaker) | [desktop](screenshots/desktop/13b-home-video-agent.png) | — |
| 14 | Home: pricing | [desktop](screenshots/desktop/14-home-pricing.png) | [mobile](screenshots/mobile/14-home-pricing.png) |
| 15 | Home: about | [desktop](screenshots/desktop/15-home-about.png) | — |
| 16 | Home: testimonials | [desktop](screenshots/desktop/16-home-testimonials.png) | — |
| 17 | Home: contact form | [desktop](screenshots/desktop/17-home-contact.png) | [mobile](screenshots/mobile/17-home-contact.png) |
| 18 | Home: footer | [desktop](screenshots/desktop/18-home-footer.png) | [mobile](screenshots/mobile/18-home-footer.png) |
| 20 | /privacy | [desktop](screenshots/desktop/20-privacy.png) | [mobile](screenshots/mobile/20-privacy.png) |
| 21 | /terms | [desktop](screenshots/desktop/21-terms.png) | [mobile](screenshots/mobile/21-terms.png) |
| 30 | /login (app's own page) | [desktop](screenshots/desktop/30-login.png) | [mobile](screenshots/mobile/30-login.png) |
| 31 | /register | [desktop](screenshots/desktop/31-register.png) | [mobile](screenshots/mobile/31-register.png) |
| 32 | /forgot-password | [desktop](screenshots/desktop/32-forgot-password.png) | [mobile](screenshots/mobile/32-forgot-password.png) |
| 40 | 404 (unknown path) | [desktop](screenshots/desktop/40-404.png) | [mobile](screenshots/mobile/40-404.png) |
| 01 | Base44 hosted login wall (app set to private, captured before it was published) | [desktop](screenshots/desktop/01-base44-login-wall-private-mode.png), [bottom](screenshots/desktop/02-base44-login-wall-private-mode-bottom.png) | [mobile](screenshots/mobile/01-base44-login-wall-private-mode.png) |

## Observations to carry into the migration

1. **Public vs private.** With the Base44 app private, every route showed Base44's own hosted
   login (Google, Microsoft, Facebook, Apple + email). Published, the app's own pages render and
   its login/register offer only Google + email. The migrated app must replace both Base44 auth
   and Google sign-in.
2. **Protected routes still redirect.** `/agents` (and the other routes under `ProtectedRoute`)
   send a signed-out visitor to `/login`, matching `src/App.jsx`.
3. **404 page is off-brand.** It's a light Base44 default page, unlike the dark site theme.
4. **Mobile menu is cut off.** The open menu panel clips the "Sign Up" button and hides
   "Build a new AI Agent" (see mobile 10b).
5. **Scroll-reveal animations.** Sections fade in on scroll; full-page screenshots render blank,
   so screenshots were taken per section. Anchor links (`/#pricing`) on mobile land slightly
   above the section.
6. **Footer "Download deck"** links to `/presentation/autoadjust-net-deck.pptx` — an AutoAdjust
   file, probably left over; worth confirming.
7. **Legal pages** contain a visible "REQUIRES LEGAL REVIEW" notice.

## Still to capture (needs the owner signed in)

`/agents`, `/agents/new`, `/agents/:id`, `/tasks`, `/inbox`, `/usage`, `/security-check`,
`/billing/success`, and the admin area: `/admin`, `/admin/agents`, `/admin/runs`,
`/admin/usage`, `/admin/customers`, `/admin/billing`, `/admin/reports`, `/admin/activity`.

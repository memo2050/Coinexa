# Stage 0 reference screenshots

Visual baseline of the exported Coinexa project (tag `base44-original`), captured before any migration work.
Later stages are compared against these images.

- `screenshots/{desktop,tablet,mobile}/` — 24 pages at 1440px, 820px and 390px wide (72 full-page images).
  - `public__*` — pages visible without signing in.
  - `app__*` — signed-in pages, shown as the owner account (admin), using the exported CSV data.
- `screenshots/live-login-*.png` — the live coinexa.net login screen (Base44-hosted), for comparison.
- `screenshots/report.json` — page list, final URL and any page errors (none).

How they were made: the export was built unchanged (`npm ci && npm run build`) and served locally.
Signed-in pages ran against the exported data; the 9 admin/usage backend functions ran from their
real source with a local stand-in for the Base44 SDK (`capture-tools/`). No source file was changed.

Known gaps (sandbox could not reach these hosts): images and videos hosted on media.base44.com,
base44.app and static.wixstatic.com appear as blanks or alt text. Fonts (Inter, Space Grotesk) were
loaded from the same font families published on npm. Billing shows the "Stripe key not configured"
state because no secrets were used.

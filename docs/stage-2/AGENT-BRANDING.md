# Agent names and icons (super admin only)

**Where:** Admin console → AI agents. The featured agents are at the top; every other
agent has a **Name & icon** button when its row is expanded.

**What the admin can do:** edit the name (2–80 characters), ask for an icon suggestion,
pick an icon from the approved Lucide library (36 icons), upload a PNG, WebP or SVG,
preview at the real 32 × 32 px size, save, or reset to the default name and icon.

**AI suggests, admin approves.** The suggestion is always one of the 36 approved icons.
Catalog agents get their type's icon; custom agents are suggested by AI, limited to the
library, with keyword rules as a fallback. The same agent description always gets the same
suggestion (stored, not regenerated). Nothing changes until the admin presses Save.

**Security**
- Server: `adminAgentBranding` checks the admin role and two-step sign-in on every
  request, behind the platform's sign-in check. Regular users get 403.
- Database: `agent_branding` is read-only for browsers (no insert/update grant). A
  trigger stops any agent rename through the API (`agents_name_admin_only`): only the
  admin function (service role) can rename. Customers can still pause/activate their agents.
- Uploads: the type is read from the file's bytes. PNG/WebP must be ≤ 256 KB,
  32–2048 px and close to square; SVG ≤ 64 KB and limited to a strict allow-list of
  drawing elements (no scripts, event handlers, external links or entities). Files
  are written only by the server to the `agent-icons` bucket; old files are deleted.
- Every save and reset goes to the audit log (`agent.branding_updated`, `agent.branding_reset`).

**Display:** cards show the 32 × 32 icon only once the admin has set one, so existing
cards look unchanged until then. Featured cards keep their tile; the chosen icon replaces
the glyph inside it.

**Tests:** `supabase/functions/_tests/agent_branding_test.ts` (unit), RLS checks 60–67,
`scripts/e2e-branding.mjs` (staging API, including direct-API attacks), browser check
"NAME & ICON EDITOR".

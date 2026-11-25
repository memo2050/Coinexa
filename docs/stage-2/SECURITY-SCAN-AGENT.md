# Cyber Security Scan Agent — delivery notes

Staging: https://forward-darkblue-rook-76.hostingersite.com/network-security (Agents page → featured card).
Branch `stage-2/build`. Production website and `main` untouched.

## Phase 1 (25 Nov 2026): linked PCs and signed uploads — DONE, tested on staging

What exists:
- **Agent card** on the Agents page (under the Recruitment card, same design) → `/network-security`.
- **Link a Windows PC**: an owner/admin creates a one-time 10-character code (valid 10 minutes, single use,
  only its SHA-256 hash stored; max 10 codes/hour and 10 active PCs per workspace). The PC creates its own Ed25519
  key pair, sends only the public key, and signs the linking request to prove it holds the private key.
- **Signed uploads**: every upload is signed over device id, timestamp, nonce and the SHA-256 of the scan. Refused
  if the signature is wrong, the time is more than 5 minutes off, the nonce was used before (database-enforced), the
  PC is unlinked, or the PC sent more than 20 uploads in an hour.
- **Strict scan contract** (`coinexa.scan.v1`): private IPv4 networks only (10/8, 172.16/12, 192.168/16; /16 or
  smaller), every device inside the scanned networks, authorisation confirmed with a name and the current statement
  version, TCP open ports only, size limits (512 KB, 1,024 devices, 200 ports per device), timestamps sane.
- **Storage**: four server-only tables (RLS on, no browser grants). Network ranges, IP addresses, host names and MAC
  addresses are encrypted with AES-256-GCM (`SECURITY_DATA_KEY`, created once by the deploy, never replaced).
- **Pages**: overview (linked PCs, unlink, scans) and scan detail (devices and open ports). Members see addresses
  masked (192.168.50.x) and cannot link or unlink; owners/admins see full details and can delete scans.
- **Audit log**: code created, PC linked, scan uploaded, scan viewed, PC unlinked, scan deleted.
- Not yet: the Windows scanner itself (Phase 2), analysis (Phase 3), PDF report (Phase 4).

Files: `supabase/migrations/20261125000009_security_scan.sql`, `supabase/functions/securityScan/index.ts`,
`supabase/functions/_shared/securityScanLogic.ts`, `supabase/functions/_tests/security_scan_test.ts`,
`src/api/securityScan.js`, `src/pages/security/*`, `scripts/sim-scanner.mjs` (simulated signed PC for tests);
modified `src/App.jsx`, `src/pages/Agents.jsx`, `supabase/config.toml`, `.github/workflows/staging-deploy.yml`,
`scripts/e2e-staging.mjs`, `scripts/ui-staging.mjs`, `supabase/tests/rls_test.sql`.

### Test results (actual)
- Unit: 40/40 (7 new: validation of networks/devices/authorisation/ports, Ed25519 signatures and tampering,
  pairing proof, timestamps, IP helpers). Node-signed messages verify in Deno (scanner/server compatibility).
- Database policies: 43/43 locally (39–43: scans, PCs and codes server-only; replayed nonce rejected; malformed keys rejected).
- Staging end-to-end: 93 passed, 0 failed, 3 skipped (16 new security checks, run with a simulated PC that signs
  exactly like the real scanner, sample data only).
- Browser: 74 page views (desktop and mobile, incl. both new pages): 0 problems.

### Fixed during Phase 1
- PC actions were not written to the audit log (empty user id rejected by the uuid column); now recorded with the
  PC name.
- E2E harness: a check that *returned* its failure text was counted as a pass. Failures are now explicit
  (`{ fail }`); this also corrected one older admin check that could never fail. No other hidden failures were found.

### Phase 2 plan (awaiting approval)
Go scanner, single unsigned `.exe` for staging tests: enter linking code → key stored with Windows DPAPI → confirm
authorisation → discover devices on the directly attached private /24 (or smaller) networks → TCP connect scan of
common ports with service banners → signed upload. Expect Windows SmartScreen / antivirus warnings while unsigned.

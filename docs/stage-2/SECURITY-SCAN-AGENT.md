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

## Phase 2 (25 Nov 2026): Windows Network Scanner — DONE, tested, published to staging

Download (staging only): https://forward-darkblue-rook-76.hostingersite.com/downloads/coinexa-network-scanner-staging.exe
(also linked on the Network security page with version and SHA-256). Version 0.2.0-staging.6,
6.3 MB, SHA-256 `5a6f355dc1e3cecebfc94bf637524bf6ba811d8d7eed02acd8e238d4a3e969b2`. Not code-signed (by decision).
Each build is published only after its own Windows test run passes (staging.4 and .5: 15/15; staging.6: 16/16 incl. link-then-scan; the
hash changes between builds because the commit id is stamped into the file).

What it does (`scanner/`, Go, single .exe, Windows 10/11 64-bit, no install, no admin rights, no drivers):
- Double-click menu: 1 Link this PC · 2 Scan my network · 3 Check link · 4 Unlink · 5 Exit. Command line too:
  `link CODE`, `scan [--range CIDR] [--confirm-authorized "Name"] [--dry-run] [--output FILE]`, `status`, `unlink`, `version`.
- **Scope**: only private IPv4 (10/8, 172.16/12, 192.168/16) networks the PC is attached to; max 1,024 addresses
  (larger networks narrowed to the PC's /24); a custom range must lie inside an attached network. Public internet,
  loopback, link-local and oversized ranges are refused before any connection is made. The server checks it all again.
- **Authorisation before every scan**: shows the exact ranges and the statement; the user types their full name and
  YES. Unattended runs must pass `--confirm-authorized "Full Name"` on each run. Cancelling scans nothing.
- **Scan**: TCP connection probes + the Windows ARP table to find devices; 66 common ports per device; reads the
  service's own greeting / HTTP Server header (product and version); reverse DNS names; cautious device hints labelled
  "guess". No logins, no password guessing, no exploits, no UDP, no raw packets.
- **Key**: Ed25519 key made on the PC; private key protected with Windows DPAPI (only that Windows user on that PC can
  unlock it); uploads signed; PC clock errors corrected from the server's time. A local copy of each scan is saved
  in `%AppData%\CoinexaScanner\last-scan.json`.

Pipeline (`.github/workflows/scanner.yml`): Linux build + tests → real Windows test machine (unit tests, Microsoft
Defender scan, end-to-end against staging) → publish to `/downloads` only if all pass → download it back from the
site and verify the SHA-256 equals the tested file. Site deploys no longer delete `/downloads`.

### Test report (actual results)
- Go unit tests: 12/12 on Linux and 12/12 on Windows (scope rules, private/public addresses, oversize, ranges outside
  attached networks, ARP parsing (Windows and Unix), banner parsing, payload format, DPAPI key round trip on Windows,
  live scan of the machine's own address with a test service).
- Microsoft Defender on Windows: no threats found. Authenticode: NotSigned (expected).
- Windows end-to-end with the real .exe against staging: **15/15 passed** — version/server; scan refused before
  linking; invalid code refused; link with a real code, key stored as a 262-byte DPAPI blob (raw key 32 bytes, header
  01000000); signed status; 8.8.8.0/24 and 1.1.1.1 refused with no connection; 10.0.0.0/8 and a non-attached /24
  refused; scan cancelled without name / without YES (nothing uploaded); interactive authorised scan of the test
  machine's own address found 10 open ports incl. the test services `21/ftp vsFTPd 3.0.3` and `8080 CoinexaTestServer
  1.2.3` and Windows' own `22/ssh OpenSSH_for_Windows 9.5`; unattended scan with --confirm-authorized and local copy;
  dry run uploads nothing; after unlinking in Coinexa the .exe can no longer upload or check status; unlinking on the
  PC removes the key; the scan opens in Coinexa. Test account, workspace, PC and scans deleted afterwards.
- Published file hash = tested file hash (verified by downloading from the staging site).
- Website regression after the change: E2E 83 passed / 0 failed; browser 74 page views / 0 problems.
- Only the test machine's own address was ever scanned in automated tests.

### Fixed during Phase 2 (test harness only; the scanner needed no fixes)
- Test services crashed on the scanner's quick probe connections (Windows reports a reset) → errors handled.
- A crashed run left a test account on staging → removed; runs now always clean up and remove stale test accounts.
- The .exe was launched with a blocking call, so the test services could not answer while it scanned → asynchronous.

### Known limitations
- Unsigned: Windows SmartScreen shows “Windows protected your PC” (More info → Run anyway); some antivirus products
  may warn about an unsigned network scanner. Code signing needs approval (≈$10/month Azure Trusted Signing).
- No admin rights: devices whose firewall blocks every probe port and that are not in the ARP table can be missed;
  OS/device type are guesses; versions only when the service announces them. IPv4 only; TCP only.
- Device maker (vendor) from MAC is not filled yet (planned server-side in Phase 3).
- Typical home /24 scan: about 1–4 minutes depending on how many devices answer.

## Phase 3 (next, awaiting approval): analysis
Fixed rules for risky services, known-vulnerability lookup by product/version (OSV/NVD, labelled "potential"),
AI explanation and prioritisation within the $20/month cap.

### 25 Nov follow-up: "scan is not working"
Read-only diagnosis (`scanner-diagnose.yml`, prints no personal data): the owner's workspace had the Network
security page open and loading normally, but had never created a linking code, so no PC was linked and no scan
could be sent. Changes: choosing Scan on an unlinked PC now asks for the linking code and continues; the page shows
Step 1 download → Step 2 linking code → Step 3 scan; refusal reasons are now logged (addresses masked). Also fixed:
Supabase retired the `logs.all` endpoint, which had silently disabled the error-log step in the E2E workflow.

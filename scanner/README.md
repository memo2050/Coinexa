# Coinexa Network Scanner (Windows)

Scans **private local networks you own or are authorised to test** and sends signed results
to Coinexa. Staging build only. See `docs/stage-2/SECURITY-SCAN-AGENT.md` for the full report.

## Install and use
1. In Coinexa open **Agents → Cyber Security Scan Agent** (Network security).
2. Press **Download for Windows** and save `coinexa-network-scanner-staging.exe`.
3. Optional check: in PowerShell run `Get-FileHash .\coinexa-network-scanner-staging.exe` and compare it with the
   SHA-256 shown on the page.
4. Double-click the file. Windows may say “Windows protected your PC” because this test build is not signed yet:
   choose **More info → Run anyway**.
5. Choose **1** and enter the linking code from the Coinexa page (press **Create linking code** there first).
6. Choose **2**, pick your network, type your full name and **YES** to confirm you are authorised.
7. Open the Network security page in Coinexa: the scan appears under **Scans**.

No installation or administrator rights are needed. To remove it: choose **4** (Unlink), delete the .exe, and
optionally delete `%AppData%\CoinexaScanner`. Unlink the PC on the Coinexa page too.

## Build
`CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -ldflags "-X main.serverURL=... -X main.anonKey=..."` —
done by `.github/workflows/scanner.yml`, which tests the .exe on Windows before publishing it.

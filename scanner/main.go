package main

// Coinexa Network Scanner (Windows). Double-click for a simple menu, or use commands:
//
//	coinexa-scanner link ABCDE-FGH23 [--name "Office PC"]
//	coinexa-scanner scan [--range 192.168.1.0/24] [--confirm-authorized "Full Name"] [--dry-run] [--output scan.json]
//	coinexa-scanner status | unlink | version
//
// Every scan requires the person running it to confirm, for that scan, that they own
// the network or have written permission to scan it. Interactive runs ask every time;
// unattended runs must pass --confirm-authorized "<full name>" on each run.

import (
	"bufio"
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

var stdin = bufio.NewReader(os.Stdin)

const (
	exitOK        = 0
	exitUsage     = 2
	exitNotLinked = 3
	exitServer    = 4
	exitCancelled = 5
)

func main() {
	if len(os.Args) < 2 {
		os.Exit(menu())
	}
	os.Exit(run(os.Args[1], os.Args[2:]))
}

func banner() {
	fmt.Printf("Coinexa Network Scanner %s (%s)\n", version, channel)
	fmt.Println("Scans only private local networks you own or are authorised to test.")
	fmt.Println()
}

func ask(prompt string) string {
	fmt.Print(prompt)
	line, _ := stdin.ReadString('\n')
	return strings.TrimSpace(line)
}

func menu() int {
	banner()
	code := exitOK
	for {
		c, _ := loadConfig()
		if c != nil {
			fmt.Printf("Linked as %q to %s\n\n", c.DeviceName, c.Server)
		} else {
			fmt.Print("This PC is not linked to Coinexa yet.\n\n")
		}
		fmt.Println("  1  Link this PC to Coinexa")
		fmt.Println("  2  Scan my network")
		fmt.Println("  3  Check link")
		fmt.Println("  4  Unlink this PC")
		fmt.Println("  5  Exit")
		switch ask("\nChoose 1-5: ") {
		case "1":
			code = run("link", nil)
		case "2":
			code = run("scan", nil)
		case "3":
			code = run("status", nil)
		case "4":
			code = run("unlink", nil)
		case "5", "":
			return code
		}
		ask("\nPress Enter to continue…")
		fmt.Println()
	}
}

func run(cmd string, args []string) int {
	switch cmd {
	case "link":
		return cmdLink(args)
	case "scan":
		return cmdScan(args)
	case "status":
		return cmdStatus()
	case "unlink":
		return cmdUnlink(args)
	case "version", "--version", "-v":
		fmt.Printf("coinexa-scanner %s (%s) server=%s\n", version, channel, serverURL)
		return exitOK
	case "help", "--help", "-h":
		usage()
		return exitOK
	default:
		usage()
		return exitUsage
	}
}

func usage() {
	fmt.Println(`Usage:
  coinexa-scanner                       open the menu
  coinexa-scanner link CODE [--name NAME]
  coinexa-scanner scan [--range CIDR] [--confirm-authorized "Full Name"] [--dry-run] [--output FILE]
  coinexa-scanner status
  coinexa-scanner unlink [--yes]
  coinexa-scanner version`)
}

func fail(code int, format string, a ...any) int {
	fmt.Fprintf(os.Stderr, "\n✗ "+format+"\n", a...)
	return code
}

func safeDeviceName(name string) string {
	var b strings.Builder
	for _, r := range strings.TrimSpace(name) {
		if r >= 32 && r != 127 {
			b.WriteRune(r)
		}
	}
	s := strings.TrimSpace(b.String())
	if len([]rune(s)) > 80 {
		s = string([]rune(s)[:80])
	}
	return s
}

// ----------------------------------------------------------------- link --

func cmdLink(args []string) int {
	fs := flag.NewFlagSet("link", flag.ContinueOnError)
	name := fs.String("name", "", "name for this PC in Coinexa")
	code := ""
	if len(args) > 0 && !strings.HasPrefix(args[0], "-") {
		code, args = args[0], args[1:]
	}
	if err := fs.Parse(args); err != nil {
		return exitUsage
	}
	if existing, _ := loadConfig(); existing != nil {
		return fail(exitUsage, "This PC is already linked as %q. Unlink it first to link again.", existing.DeviceName)
	}
	interactive := code == ""
	if interactive {
		fmt.Println("In Coinexa, open Network security and press “Create linking code”.")
		code = ask("Enter the linking code: ")
	}
	if *name == "" {
		host, _ := os.Hostname()
		*name = host
		if interactive {
			if v := ask(fmt.Sprintf("Name for this PC in Coinexa [%s]: ", host)); v != "" {
				*name = v
			}
		}
	}
	deviceName := safeDeviceName(*name)
	if deviceName == "" {
		deviceName = "Windows PC"
	}
	c, _, err := Link(code, deviceName)
	if err != nil {
		return fail(exitServer, "Linking failed: %v", err)
	}
	fmt.Printf("\n✓ Linked %q to Coinexa. The signing key stays on this PC (%s).\n", c.DeviceName, c.KeyProtection)
	return exitOK
}

// ----------------------------------------------------------------- scan --

func cmdScan(args []string) int {
	fs := flag.NewFlagSet("scan", flag.ContinueOnError)
	rangeFlag := fs.String("range", "", "private range to scan, inside a network this PC is connected to")
	confirm := fs.String("confirm-authorized", "", "your full name: confirms you own or may scan this network (required for unattended runs)")
	dryRun := fs.Bool("dry-run", false, "scan but do not upload")
	output := fs.String("output", "", "also save the scan as JSON to this file")
	if err := fs.Parse(args); err != nil {
		return exitUsage
	}
	interactive := *confirm == ""

	c, err := loadConfig()
	if err != nil {
		return fail(exitNotLinked, "%v", err)
	}
	if c == nil && !*dryRun {
		return fail(exitNotLinked, "This PC is not linked to Coinexa. Link it first (menu option 1).")
	}

	attached, err := LocalNetworks()
	if err != nil {
		return fail(exitUsage, "Could not read this PC's network settings: %v", err)
	}
	if len(attached) == 0 {
		return fail(exitUsage, "This PC is not connected to a private local network (10.x, 172.16-31.x or 192.168.x). Nothing can be scanned.")
	}

	var chosen []Network
	if *rangeFlag != "" {
		n, err := ResolveRange(*rangeFlag, attached)
		if err != nil {
			return fail(exitUsage, "Refused: %v", err)
		}
		chosen = []Network{n}
	} else if interactive {
		fmt.Println("Private networks this PC is connected to:")
		for i, n := range attached {
			note := ""
			if n.Narrowed {
				note = " (larger network; only this PC's /24 is scanned)"
			}
			fmt.Printf("  %d  %s  via %s, this PC is %s%s\n", i+1, n.CIDR, n.Interface, n.LocalIP, note)
		}
		pick := ask(fmt.Sprintf("\nWhich network? 1-%d (or Enter to cancel): ", len(attached)))
		i, err := strconv.Atoi(pick)
		if err != nil || i < 1 || i > len(attached) {
			return fail(exitCancelled, "Cancelled. Nothing was scanned.")
		}
		chosen = []Network{attached[i-1]}
	} else {
		if len(attached) > maxNetworks {
			attached = attached[:maxNetworks]
		}
		chosen = attached
	}
	for _, n := range chosen {
		if err := CheckScanRange(n.CIDR); err != nil {
			return fail(exitUsage, "Refused: %v", err)
		}
	}

	// Authorisation: required for every scan.
	statement := defaultAuthStatement
	authorizedBy := strings.TrimSpace(*confirm)
	fmt.Println("\nBefore scanning:")
	for _, n := range chosen {
		hosts, _ := Hosts(n.CIDR)
		fmt.Printf("  • %s (%d addresses) via %s\n", n.CIDR, len(hosts), n.Interface)
	}
	fmt.Printf("\n  “%s”\n\n", statement)
	if interactive {
		authorizedBy = ask("Type your full name to confirm (or press Enter to cancel): ")
		if len([]rune(authorizedBy)) < 2 {
			return fail(exitCancelled, "Cancelled. Nothing was scanned.")
		}
		if !strings.EqualFold(ask("Type YES to start the scan: "), "yes") {
			return fail(exitCancelled, "Cancelled. Nothing was scanned.")
		}
	} else {
		if len([]rune(authorizedBy)) < 2 {
			return fail(exitUsage, "--confirm-authorized needs your full name.")
		}
		fmt.Printf("Confirmed by %s (--confirm-authorized).\n", authorizedBy)
	}
	if len([]rune(authorizedBy)) > 120 {
		authorizedBy = string([]rune(authorizedBy)[:120])
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	opt := DefaultOptions()
	last := time.Time{}
	opt.Progress = func(done, total int64, stage string) {
		if time.Since(last) > 500*time.Millisecond || done == total {
			last = time.Now()
			fmt.Printf("\r  %s… %d%%   ", stage, done*100/max(total, 1))
		}
	}
	fmt.Println("\nScanning. Press Ctrl+C to stop.")
	started := time.Now()
	hosts, err := Scan(ctx, chosen, opt)
	fmt.Println()
	if errors.Is(err, context.Canceled) {
		return fail(exitCancelled, "Stopped. Nothing was uploaded.")
	}
	if err != nil {
		return fail(exitUsage, "Scan failed: %v", err)
	}
	finished := time.Now()

	open := 0
	for _, h := range hosts {
		open += len(h.Ports)
	}
	fmt.Printf("\n✓ Found %d devices with %d open ports in %s.\n\n", len(hosts), open, finished.Sub(started).Round(time.Second))
	for _, h := range hosts {
		ports := make([]string, 0, len(h.Ports))
		for _, p := range h.Ports {
			label := strconv.Itoa(p.Port)
			if p.Service != "" {
				label += "/" + p.Service
			}
			ports = append(ports, label)
		}
		fmt.Printf("  %-15s %-28s %s\n", h.IP, firstNonEmpty(h.Hostname, h.DeviceType, "—"), strings.Join(ports, ", "))
	}

	payload, err := BuildPayload(started, finished, authorizedBy, chosen, hosts)
	if err != nil {
		return fail(exitUsage, "Could not prepare the results: %v", err)
	}
	saveTo := *output
	if saveTo == "" {
		if d, err := configDir(); err == nil {
			_ = os.MkdirAll(d, 0o700)
			saveTo = filepath.Join(d, "last-scan.json")
		}
	}
	if saveTo != "" {
		if err := os.WriteFile(saveTo, payload, 0o600); err == nil {
			fmt.Printf("\nA copy of the results is saved at %s\n", saveTo)
		}
	}
	if *dryRun {
		fmt.Println("Dry run: nothing was uploaded.")
		return exitOK
	}
	res, err := Upload(c, payload)
	if err != nil {
		return fail(exitServer, "Upload failed: %v", err)
	}
	fmt.Printf("\n✓ Uploaded to Coinexa (scan %v). Open Network security in Coinexa to see it.\n", res["scan_id"])
	return exitOK
}

func firstNonEmpty(v ...string) string {
	for _, s := range v {
		if s != "" {
			return s
		}
	}
	return ""
}

// --------------------------------------------------------- status/unlink --

func cmdStatus() int {
	c, err := loadConfig()
	if err != nil {
		return fail(exitNotLinked, "%v", err)
	}
	if c == nil {
		return fail(exitNotLinked, "This PC is not linked to Coinexa.")
	}
	res, err := Status(c)
	if err != nil {
		return fail(exitServer, "Link check failed: %v", err)
	}
	fmt.Printf("✓ Linked as %q (device %s). Key protection: %s.\n", res["device_name"], c.DeviceID, c.KeyProtection)
	return exitOK
}

func cmdUnlink(args []string) int {
	c, _ := loadConfig()
	if c == nil {
		fmt.Println("This PC is not linked.")
		return exitOK
	}
	if !(len(args) > 0 && args[0] == "--yes") {
		if !strings.EqualFold(ask(fmt.Sprintf("Remove the link for %q from this PC? Type YES: ", c.DeviceName)), "yes") {
			return fail(exitCancelled, "Cancelled.")
		}
	}
	if err := forgetConfig(); err != nil {
		return fail(exitUsage, "Could not remove the link: %v", err)
	}
	fmt.Println("✓ The link and key were removed from this PC. To stop it in Coinexa as well, press Unlink next to it on the Network security page.")
	return exitOK
}

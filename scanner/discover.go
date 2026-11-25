package main

// Discovery and port checks. Only ordinary TCP connections are made (the same kind
// any program makes), so no administrator rights or packet drivers are needed:
//
//  1. Probe each address on a few common ports. A completed or actively refused
//     connection means a device answered. Probing also fills Windows' ARP table.
//  2. Read the ARP table: devices that answered ARP but blocked every probe port
//     are still found (with their MAC address).
//  3. Check the common ports on each device found, and read the service's own
//     greeting (banner) where it sends one. Nothing is logged into or exploited.

import (
	"bufio"
	"context"
	"fmt"
	"net"
	"os/exec"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// CommonPorts are checked on every device found.
var CommonPorts = []int{
	21, 22, 23, 25, 53, 80, 81, 88, 110, 111, 135, 139, 143, 389, 443, 445, 465, 515, 548, 554,
	587, 631, 636, 873, 993, 995, 1080, 1433, 1521, 1723, 1883, 2049, 2375, 2376, 3000, 3128, 3306,
	3389, 5000, 5001, 5060, 5357, 5432, 5555, 5900, 5985, 5986, 6379, 7547, 8000, 8008, 8080, 8081,
	8088, 8443, 8888, 9000, 9090, 9100, 9200, 10000, 11211, 27017, 32400, 49152, 62078,
}

// probePorts are tried on every address to find devices.
var probePorts = []int{80, 443, 445, 139, 22, 135, 3389, 8080, 62078, 554, 9100, 53}

var serviceNames = map[int]string{
	21: "ftp", 22: "ssh", 23: "telnet", 25: "smtp", 53: "dns", 80: "http", 81: "http", 88: "kerberos",
	110: "pop3", 111: "rpcbind", 135: "msrpc", 139: "netbios-ssn", 143: "imap", 389: "ldap", 443: "https",
	445: "microsoft-ds", 465: "smtps", 515: "printer", 548: "afp", 554: "rtsp", 587: "submission",
	631: "ipp", 636: "ldaps", 873: "rsync", 993: "imaps", 995: "pop3s", 1080: "socks", 1433: "ms-sql",
	1521: "oracle", 1723: "pptp", 1883: "mqtt", 2049: "nfs", 2375: "docker", 2376: "docker-tls",
	3000: "http-alt", 3128: "http-proxy", 3306: "mysql", 3389: "ms-wbt-server", 5000: "http-alt",
	5001: "http-alt", 5060: "sip", 5357: "wsdapi", 5432: "postgresql", 5555: "adb", 5900: "vnc",
	5985: "winrm", 5986: "winrm-https", 6379: "redis", 7547: "tr-069", 8000: "http-alt", 8008: "http-alt",
	8080: "http-proxy", 8081: "http-alt", 8088: "http-alt", 8443: "https-alt", 8888: "http-alt",
	9000: "http-alt", 9090: "http-alt", 9100: "jetdirect", 9200: "elasticsearch", 10000: "http-alt",
	11211: "memcached", 27017: "mongodb", 32400: "plex", 49152: "upnp", 62078: "iphone-sync",
}

var httpPorts = map[int]bool{80: true, 81: true, 3000: true, 5000: true, 5001: true, 8000: true, 8008: true,
	8080: true, 8081: true, 8088: true, 8888: true, 9000: true, 9090: true, 10000: true, 9200: true, 631: true}

// Options control how hard the scanner works. Defaults stay gentle on home networks.
type Options struct {
	Workers        int
	ConnectTimeout time.Duration
	BannerTimeout  time.Duration
	Ports          []int
	Progress       func(done, total int64, stage string)
}

func DefaultOptions() Options {
	return Options{Workers: 64, ConnectTimeout: 900 * time.Millisecond, BannerTimeout: 1500 * time.Millisecond, Ports: CommonPorts}
}

type Port struct {
	Port     int    `json:"port"`
	Protocol string `json:"protocol"`
	State    string `json:"state"`
	Service  string `json:"service,omitempty"`
	Product  string `json:"product,omitempty"`
	Version  string `json:"version,omitempty"`
	Banner   string `json:"banner,omitempty"`
}

type Host struct {
	IP         string `json:"ip"`
	MAC        string `json:"mac,omitempty"`
	Hostname   string `json:"hostname,omitempty"`
	Vendor     string `json:"vendor,omitempty"`
	DeviceType string `json:"device_type,omitempty"`
	OSGuess    string `json:"os_guess,omitempty"`
	Ports      []Port `json:"ports"`
}

type dialResult int

const (
	dialNoAnswer dialResult = iota
	dialOpen
	dialRefused
)

func dial(ctx context.Context, ip string, port int, timeout time.Duration) (net.Conn, dialResult) {
	d := net.Dialer{Timeout: timeout}
	conn, err := d.DialContext(ctx, "tcp4", net.JoinHostPort(ip, strconv.Itoa(port)))
	if err == nil {
		return conn, dialOpen
	}
	msg := strings.ToLower(err.Error())
	if strings.Contains(msg, "refused") { // Linux "connection refused"; Windows "actively refused"
		return nil, dialRefused
	}
	return nil, dialNoAnswer
}

// Scan discovers devices in the given networks and checks their ports.
func Scan(ctx context.Context, networks []Network, opt Options) ([]Host, error) {
	var targets []string
	inScope := func(ip net.IP) bool {
		for _, n := range networks {
			if n.CIDR.Contains(ip) {
				return true
			}
		}
		return false
	}
	for _, n := range networks {
		hosts, err := Hosts(n.CIDR)
		if err != nil {
			return nil, err
		}
		for _, h := range hosts {
			targets = append(targets, h.String())
		}
	}

	// 1. Probe.
	alive := map[string]bool{}
	var mu sync.Mutex
	var done int64
	total := int64(len(targets))
	work := make(chan string)
	var wg sync.WaitGroup
	for i := 0; i < opt.Workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for ip := range work {
				for _, p := range probePorts {
					if ctx.Err() != nil {
						break
					}
					conn, res := dial(ctx, ip, p, opt.ConnectTimeout)
					if conn != nil {
						conn.Close()
					}
					if res != dialNoAnswer {
						mu.Lock()
						alive[ip] = true
						mu.Unlock()
						break
					}
				}
				if opt.Progress != nil {
					opt.Progress(atomic.AddInt64(&done, 1), total, "Finding devices")
				}
			}
		}()
	}
	for _, t := range targets {
		if ctx.Err() != nil {
			break
		}
		work <- t
	}
	close(work)
	wg.Wait()
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}

	// 2. ARP table (devices that answered ARP but no probe port), plus MAC addresses.
	macs := ReadARPTable()
	for ip := range macs {
		if parsed := net.ParseIP(ip); parsed != nil && inScope(parsed) && IsPrivateIPv4(parsed) {
			alive[ip] = true
		}
	}
	// This PC itself is always a device on its own network.
	for _, n := range networks {
		if n.LocalIP != nil && n.CIDR.Contains(n.LocalIP) {
			alive[n.LocalIP.String()] = true
		}
	}

	ips := make([]string, 0, len(alive))
	for ip := range alive {
		ips = append(ips, ip)
	}
	sort.Slice(ips, func(i, j int) bool { return ipToU32(net.ParseIP(ips[i])) < ipToU32(net.ParseIP(ips[j])) })
	if len(ips) > maxAddressesPerNetwork {
		ips = ips[:maxAddressesPerNetwork]
	}

	// 3. Ports and banners on each device.
	type job struct {
		ip   string
		port int
	}
	results := map[string][]Port{}
	jobs := make(chan job)
	done = 0
	total = int64(len(ips) * len(opt.Ports))
	for i := 0; i < opt.Workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := range jobs {
				if ctx.Err() == nil {
					if conn, res := dial(ctx, j.ip, j.port, opt.ConnectTimeout); res == dialOpen {
						p := Port{Port: j.port, Protocol: "tcp", State: "open", Service: serviceNames[j.port]}
						identify(conn, &p, opt.BannerTimeout)
						conn.Close()
						mu.Lock()
						results[j.ip] = append(results[j.ip], p)
						mu.Unlock()
					}
				}
				if opt.Progress != nil {
					opt.Progress(atomic.AddInt64(&done, 1), total, "Checking ports")
				}
			}
		}()
	}
	for _, ip := range ips {
		for _, p := range opt.Ports {
			if ctx.Err() != nil {
				break
			}
			jobs <- job{ip, p}
		}
	}
	close(jobs)
	wg.Wait()
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}

	hosts := make([]Host, 0, len(ips))
	for _, ip := range ips {
		ports := results[ip]
		sort.Slice(ports, func(i, j int) bool { return ports[i].Port < ports[j].Port })
		if ports == nil {
			ports = []Port{}
		}
		h := Host{IP: ip, MAC: macs[ip], Hostname: reverseName(ctx, ip), Ports: ports}
		h.DeviceType, h.OSGuess = guessDevice(ports)
		hosts = append(hosts, h)
	}
	return hosts, nil
}

// --------------------------------------------------------------- banners --

var (
	versionRE = regexp.MustCompile(`([A-Za-z][A-Za-z0-9._-]{1,40})[/ _-]v?(\d+(?:\.\d+)+[A-Za-z0-9.]*)`)
	sshRE     = regexp.MustCompile(`^SSH-[\d.]+-([A-Za-z0-9._-]+?)[_-]?(\d+(?:\.\d+)*[A-Za-z0-9]*)?(?:\s|$)`)
)

// identify reads the service's greeting (or HTTP Server header) without logging in.
func identify(conn net.Conn, p *Port, timeout time.Duration) {
	_ = conn.SetDeadline(time.Now().Add(timeout))
	if httpPorts[p.Port] {
		_, _ = fmt.Fprintf(conn, "HEAD / HTTP/1.0\r\nHost: %s\r\nUser-Agent: CoinexaNetworkScanner\r\n\r\n", conn.RemoteAddr().(*net.TCPAddr).IP)
		r := bufio.NewReader(conn)
		for i := 0; i < 30; i++ {
			line, err := r.ReadString('\n')
			if err != nil {
				break
			}
			line = strings.TrimSpace(line)
			if i == 0 && strings.HasPrefix(line, "HTTP/") && p.Service == "" {
				p.Service = "http"
			}
			if strings.HasPrefix(strings.ToLower(line), "server:") {
				server := strings.TrimSpace(line[7:])
				p.Banner = cleanBanner(server)
				p.Product, p.Version = productVersion(server)
				break
			}
			if line == "" {
				break
			}
		}
		return
	}
	buf := make([]byte, 256)
	n, _ := conn.Read(buf)
	if n == 0 {
		return
	}
	text := cleanBanner(string(buf[:n]))
	p.Banner = text
	if m := sshRE.FindStringSubmatch(text); m != nil {
		p.Service, p.Product, p.Version = "ssh", m[1], m[2]
		return
	}
	p.Product, p.Version = productVersion(text)
}

func productVersion(text string) (string, string) {
	if m := versionRE.FindStringSubmatch(text); m != nil {
		return m[1], m[2]
	}
	if f := strings.Fields(text); len(f) > 0 && !strings.ContainsAny(f[0], "0123456789") && len(f[0]) <= 40 {
		return strings.Trim(f[0], "()[]"), ""
	}
	return "", ""
}

func cleanBanner(s string) string {
	var b strings.Builder
	for _, r := range s {
		switch {
		case r == '\r' || r == '\n' || r == '\t':
			b.WriteRune(' ')
		case r >= 32 && r < 127:
			b.WriteRune(r)
		}
	}
	out := strings.Join(strings.Fields(b.String()), " ")
	if len(out) > 200 {
		out = out[:200]
	}
	return out
}

// ----------------------------------------------------------- device hints --

// guessDevice gives a cautious hint from open ports only; it is labelled a guess.
func guessDevice(ports []Port) (deviceType, os string) {
	has := map[int]bool{}
	for _, p := range ports {
		has[p.Port] = true
	}
	switch {
	case has[9100] || has[515] || has[631]:
		deviceType = "printer"
	case has[554]:
		deviceType = "camera or video device"
	case has[62078]:
		deviceType = "phone or tablet"
		os = "iOS (guess)"
	case has[5555]:
		deviceType = "android device"
	case has[2049] || has[873] || has[548]:
		deviceType = "storage / NAS"
	case has[3389] || has[135] || has[445] || has[139]:
		deviceType = "computer"
	case has[53] && (has[80] || has[443]):
		deviceType = "router or network device"
	}
	if os == "" && (has[135] || has[3389] || has[5985]) {
		os = "Windows (guess)"
	}
	return
}

var hostnameRE = regexp.MustCompile(`^[A-Za-z0-9._-]{1,253}$`)

func reverseName(ctx context.Context, ip string) string {
	c, cancel := context.WithTimeout(ctx, 1200*time.Millisecond)
	defer cancel()
	names, err := net.DefaultResolver.LookupAddr(c, ip)
	if err != nil || len(names) == 0 {
		return ""
	}
	name := strings.TrimSuffix(names[0], ".")
	if !hostnameRE.MatchString(name) {
		return ""
	}
	return name
}

// ------------------------------------------------------------------ ARP --

var arpLineRE = regexp.MustCompile(`(\d{1,3}(?:\.\d{1,3}){3})\s+(?:\S+\s+)?\(?([0-9A-Fa-f]{2}(?:[:-][0-9A-Fa-f]{2}){5})\)?`)

// ReadARPTable returns IP -> MAC from the system's ARP table (`arp -a`; no admin needed).
func ReadARPTable() map[string]string {
	out := map[string]string{}
	args := []string{"-a"}
	if runtime.GOOS != "windows" {
		args = []string{"-an"}
	}
	cmd := exec.Command("arp", args...)
	hideWindow(cmd)
	data, err := cmd.Output()
	if err != nil {
		return out
	}
	return ParseARP(string(data))
}

// ParseARP extracts unicast IP/MAC pairs from Windows or Unix `arp` output.
func ParseARP(text string) map[string]string {
	out := map[string]string{}
	for _, line := range strings.Split(text, "\n") {
		m := arpLineRE.FindStringSubmatch(line)
		if m == nil {
			// Unix format: "? (192.168.1.1) at aa:bb:cc:dd:ee:ff [ether] on eth0"
			if u := unixARP.FindStringSubmatch(line); u != nil {
				m = []string{"", u[1], u[2]}
			} else {
				continue
			}
		}
		ip := net.ParseIP(m[1])
		parts := strings.Split(strings.ReplaceAll(m[2], "-", ":"), ":")
		for i, part := range parts {
			if len(part) == 1 {
				parts[i] = "0" + part
			}
		}
		mac := strings.ToUpper(strings.Join(parts, ":"))
		if ip == nil || ip4(ip) == nil || mac == "FF:FF:FF:FF:FF:FF" || mac == "00:00:00:00:00:00" {
			continue
		}
		if first, err := strconv.ParseUint(mac[:2], 16, 8); err == nil && first&1 == 1 { // multicast
			continue
		}
		out[ip.String()] = mac
	}
	return out
}

var unixARP = regexp.MustCompile(`\((\d{1,3}(?:\.\d{1,3}){3})\) at ([0-9A-Fa-f]{1,2}(?::[0-9A-Fa-f]{1,2}){5})`)

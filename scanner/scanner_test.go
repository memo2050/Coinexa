package main

import (
	"context"
	"encoding/json"
	"net"
	"strings"
	"testing"
	"time"
)

func cidr(t *testing.T, s string) *net.IPNet {
	t.Helper()
	_, n, err := net.ParseCIDR(s)
	if err != nil {
		t.Fatal(err)
	}
	return n
}

func TestPrivateOnly(t *testing.T) {
	for _, ip := range []string{"10.1.2.3", "172.16.0.1", "172.31.255.254", "192.168.1.1"} {
		if !IsPrivateIPv4(net.ParseIP(ip)) {
			t.Errorf("%s should be private", ip)
		}
	}
	for _, ip := range []string{"8.8.8.8", "1.1.1.1", "172.32.0.1", "172.15.255.255", "127.0.0.1", "169.254.1.1", "100.64.0.1", "192.169.0.1", "0.0.0.0", "255.255.255.255"} {
		if IsPrivateIPv4(net.ParseIP(ip)) {
			t.Errorf("%s must not be private", ip)
		}
	}
	if IsPrivateIPv4(net.ParseIP("fd00::1")) {
		t.Error("IPv6 is not supported and must be refused")
	}
}

func TestCheckScanRange(t *testing.T) {
	ok := []string{"192.168.1.0/24", "10.0.0.0/22", "172.20.5.7/32", "192.168.50.0/23"}
	for _, c := range ok {
		if err := CheckScanRange(cidr(t, c)); err != nil {
			t.Errorf("%s should be allowed: %v", c, err)
		}
	}
	bad := map[string]string{
		"8.8.8.0/24":     "not a private",
		"127.0.0.0/24":   "not a private",
		"169.254.0.0/24": "not a private",
		"10.0.0.0/8":     "too large",
		"192.168.0.0/16": "too large",
		"192.168.0.0/15": "not a private",
		"172.0.0.0/8":    "not a private",
	}
	for c, want := range bad {
		err := CheckScanRange(cidr(t, c))
		if err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("%s: want error containing %q, got %v", c, want, err)
		}
	}
}

func TestHosts(t *testing.T) {
	h, err := Hosts(cidr(t, "192.168.1.0/24"))
	if err != nil || len(h) != 254 || h[0].String() != "192.168.1.1" || h[253].String() != "192.168.1.254" {
		t.Fatalf("got %d hosts, err %v", len(h), err)
	}
	h, _ = Hosts(cidr(t, "10.0.0.0/22"))
	if len(h) != 1022 {
		t.Fatalf("/22: got %d", len(h))
	}
	h, _ = Hosts(cidr(t, "10.0.0.5/32"))
	if len(h) != 1 || h[0].String() != "10.0.0.5" {
		t.Fatalf("/32: got %v", h)
	}
	if _, err := Hosts(cidr(t, "8.8.8.0/30")); err == nil {
		t.Fatal("public range must be refused")
	}
}

func TestNetworkNarrowing(t *testing.T) {
	n := networkFor(net.ParseIP("10.20.30.40").To4(), net.CIDRMask(8, 32))
	if n.CIDR.String() != "10.20.30.0/24" || !n.Narrowed {
		t.Fatalf("got %s narrowed=%v", n.CIDR, n.Narrowed)
	}
	n = networkFor(net.ParseIP("192.168.1.9").To4(), net.CIDRMask(24, 32))
	if n.CIDR.String() != "192.168.1.0/24" || n.Narrowed {
		t.Fatalf("got %s", n.CIDR)
	}
}

func TestResolveRange(t *testing.T) {
	attached := []Network{{CIDR: cidr(t, "192.168.1.0/24"), Interface: "Wi-Fi", LocalIP: net.ParseIP("192.168.1.9")}}
	if n, err := ResolveRange("192.168.1.20", attached); err != nil || n.CIDR.String() != "192.168.1.20/32" {
		t.Fatalf("single address in own network: %v %v", n.CIDR, err)
	}
	if _, err := ResolveRange("192.168.1.0/25", attached); err != nil {
		t.Fatalf("subnet of own network: %v", err)
	}
	for in, want := range map[string]string{
		"192.168.2.0/24": "not part of a network",
		"10.0.0.0/24":    "not part of a network",
		"8.8.8.8":        "not a private",
		"192.168.0.0/16": "too large",
		"hello":          "not a valid",
	} {
		if _, err := ResolveRange(in, attached); err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("%s: want %q, got %v", in, want, err)
		}
	}
}

func TestParseARP(t *testing.T) {
	windows := `
Interface: 192.168.1.9 --- 0x5
  Internet Address      Physical Address      Type
  192.168.1.1           a4-2b-b0-11-22-33     dynamic
  192.168.1.20          00-1b-a9-44-55-66     dynamic
  192.168.1.255         ff-ff-ff-ff-ff-ff     static
  224.0.0.22            01-00-5e-00-00-16     static
`
	m := ParseARP(windows)
	if m["192.168.1.1"] != "A4:2B:B0:11:22:33" || m["192.168.1.20"] != "00:1B:A9:44:55:66" || len(m) != 2 {
		t.Fatalf("windows arp: %v", m)
	}
	unix := "? (10.0.0.1) at a:b:c:d:e:f [ether] on eth0\n? (10.0.0.9) at <incomplete> on eth0\n"
	m = ParseARP(unix)
	if m["10.0.0.1"] != "0A:0B:0C:0D:0E:0F" || len(m) != 1 {
		t.Fatalf("unix arp: %v", m)
	}
}

func TestBannerParsing(t *testing.T) {
	if p, v := productVersion("nginx/1.18.0 (Ubuntu)"); p != "nginx" || v != "1.18.0" {
		t.Errorf("nginx: %s %s", p, v)
	}
	if p, v := productVersion("Apache/2.4.41 (Ubuntu)"); p != "Apache" || v != "2.4.41" {
		t.Errorf("apache: %s %s", p, v)
	}
	if p, v := productVersion("220 (vsFTPd 3.0.3)"); p != "vsFTPd" || v != "3.0.3" {
		t.Errorf("vsftpd: %s %s", p, v)
	}
	m := sshRE.FindStringSubmatch("SSH-2.0-OpenSSH_7.4p1 Debian-10")
	if m == nil || m[1] != "OpenSSH" || m[2] != "7.4p1" {
		t.Errorf("ssh: %v", m)
	}
	if got := cleanBanner("220 hello\r\n\x00\x1bworld" + strings.Repeat("x", 300)); strings.ContainsAny(got, "\r\n\x00\x1b") || len(got) > 200 {
		t.Errorf("clean: %q", got)
	}
}

func TestGuessDevice(t *testing.T) {
	if d, _ := guessDevice([]Port{{Port: 9100}}); d != "printer" {
		t.Error(d)
	}
	if d, os := guessDevice([]Port{{Port: 3389}, {Port: 445}}); d != "computer" || os != "Windows (guess)" {
		t.Error(d, os)
	}
}

func TestBuildPayload(t *testing.T) {
	nets := []Network{{CIDR: cidr(t, "192.168.1.0/24"), Interface: "Wi-Fi"}}
	hosts := []Host{{IP: "192.168.1.20", Ports: []Port{{Port: 80, Protocol: "tcp", State: "open", Service: "http"}}}}
	now := time.Now()
	data, err := BuildPayload(now.Add(-time.Minute), now, "Ramy", nets, hosts)
	if err != nil {
		t.Fatal(err)
	}
	var p map[string]any
	_ = json.Unmarshal(data, &p)
	auth := p["authorization"].(map[string]any)
	if p["schema"] != "coinexa.scan.v1" || auth["confirmed"] != true || auth["confirmed_by"] != "Ramy" || auth["statement_version"] != "scan-authorization-v1" {
		t.Fatalf("payload: %s", data)
	}
	if _, err := BuildPayload(now, now, "Ramy", []Network{{CIDR: cidr(t, "8.8.8.0/24")}}, nil); err == nil {
		t.Fatal("public network must not be packaged")
	}
	data, _ = BuildPayload(now, now, "Ramy", nets, nil)
	if !strings.Contains(string(data), `"hosts":[]`) {
		t.Fatalf("empty hosts must be a list: %s", data)
	}
}

func TestNormaliseCode(t *testing.T) {
	if normaliseCode(" abcde-fgh23 ") != "ABCDEFGH23" {
		t.Fatal(normaliseCode(" abcde-fgh23 "))
	}
}

func TestKeyProtectionRoundTrip(t *testing.T) {
	secret := []byte("0123456789abcdef0123456789abcdef")
	blob, err := protectKey(secret)
	if err != nil {
		t.Fatal(err)
	}
	back, err := unprotectKey(blob)
	if err != nil || string(back) != string(secret) {
		t.Fatalf("round trip failed: %v", err)
	}
}

// Scans this machine's own private address with a local listener: the engine must
// find the device and the open port, and nothing outside the range.
func TestScanOwnAddress(t *testing.T) {
	attached, _ := LocalNetworks()
	if len(attached) == 0 || attached[0].LocalIP == nil {
		t.Skip("no private network on this machine")
	}
	local := attached[0].LocalIP.String()
	ln, err := net.Listen("tcp4", local+":0")
	if err != nil {
		t.Skip(err)
	}
	defer ln.Close()
	port := ln.Addr().(*net.TCPAddr).Port
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			_, _ = c.Write([]byte("SSH-2.0-OpenSSH_9.6 TestServer\r\n"))
			c.Close()
		}
	}()
	n, err := ResolveRange(local+"/32", attached)
	if err != nil {
		t.Fatal(err)
	}
	opt := DefaultOptions()
	opt.Ports = []int{port}
	hosts, err := Scan(context.Background(), []Network{n}, opt)
	if err != nil {
		t.Fatal(err)
	}
	if len(hosts) != 1 || hosts[0].IP != local || len(hosts[0].Ports) != 1 || hosts[0].Ports[0].Product != "OpenSSH" || hosts[0].Ports[0].Version != "9.6" {
		t.Fatalf("got %+v", hosts)
	}
}

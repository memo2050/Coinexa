package main

// Scope rules: what this scanner may touch. They mirror the server's checks, so a
// scan the server would refuse is never started in the first place.
//
//   - Only private IPv4 ranges (RFC 1918): 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16.
//     Public internet addresses, loopback, link-local (169.254/16) and carrier-grade
//     NAT (100.64/10) are refused.
//   - Only networks this PC is directly attached to. A custom range must fall inside
//     one of them.
//   - At most 1,024 addresses per network (/22 or smaller). Larger attached networks
//     are narrowed to the /24 that contains this PC.

import (
	"encoding/binary"
	"errors"
	"fmt"
	"net"
	"sort"
	"strings"
)

const (
	maxAddressesPerNetwork = 1024
	minPrefix              = 22 // /22 = 1,024 addresses
	defaultNarrowPrefix    = 24
	maxNetworks            = 8
)

var privateBlocks = mustCIDRs("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")

func mustCIDRs(list ...string) []*net.IPNet {
	out := make([]*net.IPNet, 0, len(list))
	for _, c := range list {
		_, n, err := net.ParseCIDR(c)
		if err != nil {
			panic(err)
		}
		out = append(out, n)
	}
	return out
}

// Network is a range the user may choose to scan.
type Network struct {
	CIDR      *net.IPNet
	Interface string
	LocalIP   net.IP
	Narrowed  bool // the attached network was larger; only this PC's /24 is offered
}

func (n Network) String() string { return n.CIDR.String() }

func ip4(ip net.IP) net.IP { return ip.To4() }

func ipToU32(ip net.IP) uint32 { return binary.BigEndian.Uint32(ip4(ip)) }

func u32ToIP(v uint32) net.IP {
	b := make(net.IP, 4)
	binary.BigEndian.PutUint32(b, v)
	return b
}

// IsPrivateIPv4 reports whether ip is inside an RFC 1918 private range.
func IsPrivateIPv4(ip net.IP) bool {
	v4 := ip4(ip)
	if v4 == nil {
		return false
	}
	for _, b := range privateBlocks {
		if b.Contains(v4) {
			return true
		}
	}
	return false
}

// IsPrivateNetwork reports whether the whole network lies inside one private range.
func IsPrivateNetwork(n *net.IPNet) bool {
	ones, bits := n.Mask.Size()
	if bits != 32 {
		return false
	}
	for _, b := range privateBlocks {
		bOnes, _ := b.Mask.Size()
		if ones >= bOnes && b.Contains(n.IP) {
			return true
		}
	}
	return false
}

// CheckScanRange validates a range before anything is sent on the network.
func CheckScanRange(n *net.IPNet) error {
	ones, bits := n.Mask.Size()
	if bits != 32 || ip4(n.IP) == nil {
		return errors.New("only IPv4 networks are supported")
	}
	if !IsPrivateNetwork(n) {
		return fmt.Errorf("%s is not a private local network; only 10.x, 172.16-31.x and 192.168.x can be scanned", n)
	}
	if ones < minPrefix {
		return fmt.Errorf("%s is too large; scan a /%d or smaller (at most %d addresses)", n, minPrefix, maxAddressesPerNetwork)
	}
	return nil
}

// ParseRange parses a user-supplied CIDR (or a single address) into its network.
func ParseRange(text string) (*net.IPNet, error) {
	text = strings.TrimSpace(text)
	if !strings.Contains(text, "/") {
		text += "/32"
	}
	ip, n, err := net.ParseCIDR(text)
	if err != nil || ip4(ip) == nil {
		return nil, fmt.Errorf("%q is not a valid IPv4 range (example: 192.168.1.0/24)", text)
	}
	return n, nil
}

// Contains reports whether inner lies completely inside outer.
func Contains(outer, inner *net.IPNet) bool {
	oOnes, _ := outer.Mask.Size()
	iOnes, _ := inner.Mask.Size()
	return iOnes >= oOnes && outer.Contains(inner.IP)
}

// Hosts lists the addresses to probe in a network: network and broadcast addresses
// are skipped for /30 and larger. Refuses anything outside the scope rules.
func Hosts(n *net.IPNet) ([]net.IP, error) {
	if err := CheckScanRange(n); err != nil {
		return nil, err
	}
	ones, _ := n.Mask.Size()
	size := uint32(1) << (32 - ones)
	base := ipToU32(n.IP)
	first, last := base, base+size-1
	if ones <= 30 {
		first, last = base+1, base+size-2
	}
	out := make([]net.IP, 0, size)
	for v := first; v <= last && v >= first; v++ {
		ip := u32ToIP(v)
		if !IsPrivateIPv4(ip) { // defence in depth
			return nil, fmt.Errorf("address %s is not private", ip)
		}
		out = append(out, ip)
		if v == last {
			break
		}
	}
	return out, nil
}

// LocalNetworks returns the private IPv4 networks this PC is directly attached to.
func LocalNetworks() ([]Network, error) {
	ifaces, err := net.Interfaces()
	if err != nil {
		return nil, err
	}
	var out []Network
	seen := map[string]bool{}
	for _, iface := range ifaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, a := range addrs {
			ipn, ok := a.(*net.IPNet)
			if !ok || ip4(ipn.IP) == nil || !IsPrivateIPv4(ipn.IP) {
				continue
			}
			nw := networkFor(ip4(ipn.IP), ipn.Mask)
			nw.Interface = iface.Name
			if seen[nw.CIDR.String()] {
				continue
			}
			seen[nw.CIDR.String()] = true
			out = append(out, nw)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CIDR.String() < out[j].CIDR.String() })
	return out, nil
}

// networkFor builds the scan network for a local address and mask, narrowing large
// networks to this PC's /24.
func networkFor(ip net.IP, mask net.IPMask) Network {
	ones, _ := mask.Size()
	narrowed := false
	if ones < minPrefix {
		ones = defaultNarrowPrefix
		narrowed = true
	}
	m := net.CIDRMask(ones, 32)
	return Network{CIDR: &net.IPNet{IP: ip.Mask(m), Mask: m}, LocalIP: ip, Narrowed: narrowed}
}

// ResolveRange checks a custom range against the PC's attached networks.
func ResolveRange(text string, attached []Network) (Network, error) {
	n, err := ParseRange(text)
	if err != nil {
		return Network{}, err
	}
	if err := CheckScanRange(n); err != nil {
		return Network{}, err
	}
	for _, a := range attached {
		full := a.CIDR
		if Contains(full, n) {
			return Network{CIDR: n, Interface: a.Interface, LocalIP: a.LocalIP}, nil
		}
	}
	return Network{}, fmt.Errorf("%s is not part of a network this PC is connected to", n)
}

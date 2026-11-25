package main

// Talking to Coinexa: linking this PC, and signed uploads. The private key is created
// here, protected with Windows DPAPI, and never sent anywhere. Every upload is signed
// over the device id, a timestamp, a single-use nonce and the SHA-256 of the scan.

import (
	"bytes"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Set at build time (-ldflags "-X main.serverURL=... -X main.anonKey=..."). The anon key
// is the website's public key; it grants nothing by itself.
var (
	serverURL = ""
	anonKey   = ""
	version   = "dev"
	channel   = "staging"
)

const (
	scanSchema           = "coinexa.scan.v1"
	authStatementVersion = "scan-authorization-v1"
	defaultAuthStatement = "I confirm I own this network or have written permission to scan it, and I understand the scan only covers private local addresses."
	maxUploadBytes       = 512 * 1024
)

type Config struct {
	Server        string `json:"server"`
	DeviceID      string `json:"device_id"`
	DeviceName    string `json:"device_name"`
	PublicKey     string `json:"public_key"`
	ProtectedKey  string `json:"protected_private_key"`
	KeyProtection string `json:"key_protection"`
	LinkedAt      string `json:"linked_at"`
}

func configDir() (string, error) {
	if d := os.Getenv("COINEXA_SCANNER_HOME"); d != "" { // tests only
		return d, nil
	}
	base, err := os.UserConfigDir() // %AppData% on Windows
	if err != nil {
		return "", err
	}
	return filepath.Join(base, "CoinexaScanner"), nil
}

func configPath() (string, error) {
	d, err := configDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(d, "config.json"), nil
}

func loadConfig() (*Config, error) {
	p, err := configPath()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(p)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var c Config
	if err := json.Unmarshal(data, &c); err != nil {
		return nil, fmt.Errorf("the link file is damaged (%v); unlink and link again", err)
	}
	return &c, nil
}

func saveConfig(c *Config) error {
	d, err := configDir()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(d, 0o700); err != nil {
		return err
	}
	data, _ := json.MarshalIndent(c, "", "  ")
	p := filepath.Join(d, "config.json")
	tmp := p + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, p)
}

func forgetConfig() error {
	p, err := configPath()
	if err != nil {
		return err
	}
	if err := os.Remove(p); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

func (c *Config) privateKey() (ed25519.PrivateKey, error) {
	blob, err := base64.StdEncoding.DecodeString(c.ProtectedKey)
	if err != nil {
		return nil, errors.New("the stored key is damaged; unlink and link again")
	}
	seed, err := unprotectKey(blob)
	if err != nil {
		return nil, err
	}
	if len(seed) != ed25519.SeedSize {
		return nil, errors.New("the stored key is damaged; unlink and link again")
	}
	return ed25519.NewKeyFromSeed(seed), nil
}

// ----------------------------------------------------------------- HTTP --

type apiError struct {
	Status  int
	Message string
}

func (e *apiError) Error() string { return e.Message }

var httpClient = &http.Client{Timeout: 60 * time.Second}

// clockOffset corrects a wrong PC clock using the server's Date header.
var clockOffset time.Duration

func post(server string, body any) (map[string]any, error) {
	if server == "" || anonKey == "" {
		return nil, errors.New("this build has no Coinexa server configured")
	}
	data, _ := json.Marshal(body)
	req, err := http.NewRequest(http.MethodPost, strings.TrimRight(server, "/")+"/functions/v1/securityScan", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apikey", anonKey)
	req.Header.Set("User-Agent", "CoinexaNetworkScanner/"+version)
	res, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("could not reach Coinexa (%v); check the internet connection", err)
	}
	defer res.Body.Close()
	if d, err := http.ParseTime(res.Header.Get("Date")); err == nil {
		clockOffset = time.Until(d)
	}
	raw, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	out := map[string]any{}
	_ = json.Unmarshal(raw, &out)
	if res.StatusCode != http.StatusOK {
		msg, _ := out["error"].(string)
		if msg == "" {
			msg = fmt.Sprintf("Coinexa answered with HTTP %d", res.StatusCode)
		}
		return out, &apiError{Status: res.StatusCode, Message: msg}
	}
	return out, nil
}

func b64(b []byte) string { return base64.StdEncoding.EncodeToString(b) }

func normaliseCode(code string) string {
	var b strings.Builder
	for _, r := range strings.ToUpper(code) {
		if (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// Link creates this PC's key pair, proves possession to Coinexa, and stores the link.
func Link(code, deviceName string) (*Config, map[string]any, error) {
	code = normaliseCode(code)
	if len(code) != 10 {
		return nil, nil, errors.New("the linking code has 10 letters and numbers, like ABCDE-FGH23")
	}
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, nil, err
	}
	pubB64 := b64(pub)
	msg := fmt.Sprintf("coinexa-scan-pair-v1\n%s\n%s\n%s", code, pubB64, deviceName)
	res, err := post(serverURL, map[string]any{
		"action": "device_pair", "code": code, "public_key": pubB64, "device_name": deviceName,
		"app_version": version, "signature": b64(ed25519.Sign(priv, []byte(msg))),
	})
	if err != nil {
		return nil, nil, err
	}
	protected, err := protectKey(priv.Seed())
	if err != nil {
		return nil, nil, err
	}
	id, _ := res["device_id"].(string)
	if id == "" {
		return nil, nil, errors.New("Coinexa did not return a device id")
	}
	c := &Config{Server: serverURL, DeviceID: id, DeviceName: deviceName, PublicKey: pubB64,
		ProtectedKey: b64(protected), KeyProtection: keyProtection, LinkedAt: time.Now().UTC().Format(time.RFC3339)}
	if err := saveConfig(c); err != nil {
		return nil, nil, fmt.Errorf("linked, but could not save the link on this PC: %v", err)
	}
	return c, res, nil
}

func newNonce() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func sha256Hex(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

func signedTimestamp() string {
	return time.Now().Add(clockOffset).UTC().Format("2006-01-02T15:04:05.000Z")
}

// signedPost sends a device request signed with this PC's key. If the PC clock is
// wrong, it retries once using the server's clock.
func signedPost(c *Config, action, payload string) (map[string]any, error) {
	key, err := c.privateKey()
	if err != nil {
		return nil, err
	}
	send := func() (map[string]any, error) {
		ts, nonce := signedTimestamp(), newNonce()
		msg := fmt.Sprintf("coinexa-scan-upload-v1\n%s\n%s\n%s\n%s", c.DeviceID, ts, nonce, sha256Hex(payload))
		return post(c.Server, map[string]any{
			"action": action, "device_id": c.DeviceID, "timestamp": ts, "nonce": nonce,
			"signature": b64(ed25519.Sign(key, []byte(msg))), "payload": payload,
		})
	}
	res, err := send()
	var ae *apiError
	if errors.As(err, &ae) && ae.Status == 401 && strings.Contains(ae.Message, "time") {
		return send() // clockOffset now holds the server's time
	}
	return res, err
}

func Status(c *Config) (map[string]any, error) { return signedPost(c, "device_status", "") }

func Upload(c *Config, payload []byte) (map[string]any, error) {
	if len(payload) > maxUploadBytes {
		return nil, fmt.Errorf("the scan is too large to upload (%d KB); scan a smaller range", len(payload)/1024)
	}
	return signedPost(c, "device_upload", string(payload))
}

// ------------------------------------------------------------- payload --

type scanPayload struct {
	Schema         string           `json:"schema"`
	ScannerVersion string           `json:"scanner_version"`
	StartedAt      string           `json:"started_at"`
	FinishedAt     string           `json:"finished_at"`
	Authorization  authorization    `json:"authorization"`
	Networks       []payloadNetwork `json:"networks"`
	Hosts          []Host           `json:"hosts"`
}

type authorization struct {
	Confirmed        bool   `json:"confirmed"`
	ConfirmedBy      string `json:"confirmed_by"`
	StatementVersion string `json:"statement_version"`
}

type payloadNetwork struct {
	CIDR      string `json:"cidr"`
	Interface string `json:"interface"`
}

// BuildPayload assembles the scan in the format the server accepts (coinexa.scan.v1).
func BuildPayload(started, finished time.Time, authorizedBy string, networks []Network, hosts []Host) ([]byte, error) {
	p := scanPayload{
		Schema: scanSchema, ScannerVersion: version,
		StartedAt: started.UTC().Format(time.RFC3339Nano), FinishedAt: finished.UTC().Format(time.RFC3339Nano),
		Authorization: authorization{Confirmed: true, ConfirmedBy: authorizedBy, StatementVersion: authStatementVersion},
		Hosts:         hosts,
	}
	if p.Hosts == nil {
		p.Hosts = []Host{}
	}
	for _, n := range networks {
		if err := CheckScanRange(n.CIDR); err != nil {
			return nil, err
		}
		iface := n.Interface
		if len(iface) > 80 {
			iface = iface[:80]
		}
		p.Networks = append(p.Networks, payloadNetwork{CIDR: n.CIDR.String(), Interface: iface})
	}
	return json.Marshal(p)
}

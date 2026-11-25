// Cyber Security Scan Agent: pure logic shared by the server function and tests.
// No I/O here. Covers: the signed-message format, Ed25519 verification, IPv4 and
// private-network rules, and strict validation of an uploaded scan (schema v1).

export const SCAN_SCHEMA = 'coinexa.scan.v1';
export const AUTH_STATEMENT_VERSION = 'scan-authorization-v1';
export const MAX_PAYLOAD_BYTES = 512 * 1024;
export const MAX_HOSTS = 1024;
export const MAX_PORTS_PER_HOST = 200;
export const MAX_NETWORKS = 8;
export const SIGNATURE_WINDOW_MS = 5 * 60 * 1000;
export const NONCE_RE = /^[A-Za-z0-9_-]{16,64}$/;
export const PUBLIC_KEY_RE = /^[A-Za-z0-9+/]{43}=$/;
const PAIR_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I

// ---------------------------------------------------------------- encoding --

export function b64ToBytes(text: string): Uint8Array<ArrayBuffer> {
  const bin = atob(text);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function sha256Hex(text: string | Uint8Array<ArrayBuffer>) {
  const data = typeof text === 'string' ? new TextEncoder().encode(text) : text;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ------------------------------------------------------------- signatures --

// What a linked PC signs for an upload. Every field the server relies on is bound in.
export const uploadMessage = (deviceId: string, timestamp: string, nonce: string, payloadSha256: string) =>
  `coinexa-scan-upload-v1\n${deviceId}\n${timestamp}\n${nonce}\n${payloadSha256}`;

// What a PC signs when linking: proves it holds the private key for the public key it sends.
export const pairMessage = (code: string, publicKey: string, deviceName: string) =>
  `coinexa-scan-pair-v1\n${normaliseCode(code)}\n${publicKey}\n${deviceName}`;

export async function verifyEd25519(publicKeyB64: string, message: string, signatureB64: string): Promise<boolean> {
  try {
    if (!PUBLIC_KEY_RE.test(publicKeyB64)) return false;
    const signature = b64ToBytes(signatureB64);
    if (signature.length !== 64) return false;
    const key = await crypto.subtle.importKey('raw', b64ToBytes(publicKeyB64), { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, signature, new TextEncoder().encode(message));
  } catch {
    return false;
  }
}

export function timestampFresh(timestamp: string, now = Date.now()) {
  const t = Date.parse(timestamp);
  return Number.isFinite(t) && /^\d{4}-\d{2}-\d{2}T/.test(timestamp) && Math.abs(now - t) <= SIGNATURE_WINDOW_MS;
}

// ------------------------------------------------------------ pairing code --

export function newPairingCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const chars = [...bytes].map((b) => PAIR_CODE_ALPHABET[b % PAIR_CODE_ALPHABET.length]).join('');
  return `${chars.slice(0, 5)}-${chars.slice(5)}`;
}

export const normaliseCode = (code: string) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// ------------------------------------------------------------------- IPv4 --

export function ipToInt(ip: string): number | null {
  const parts = String(ip).split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^(0|[1-9]\d{0,2})$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

export function parseCidr(cidr: string): { base: number; prefix: number; text: string } | null {
  const m = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/.exec(String(cidr).trim());
  if (!m) return null;
  const ip = ipToInt(m[1]);
  const prefix = Number(m[2]);
  if (ip === null || prefix < 0 || prefix > 32) return null;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const base = (ip & mask) >>> 0;
  return { base, prefix, text: `${intToIp(base)}/${prefix}` };
}

export const intToIp = (n: number) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');

export function inCidr(ip: number, net: { base: number; prefix: number }) {
  const mask = net.prefix === 0 ? 0 : (0xffffffff << (32 - net.prefix)) >>> 0;
  return ((ip & mask) >>> 0) === net.base;
}

// Private (RFC 1918) ranges only. Loopback, link-local, carrier-grade NAT and every
// public address are refused: the scanner is for the customer's own local network.
const PRIVATE = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'].map((c) => parseCidr(c)!);
export const isPrivateIp = (ip: number) => PRIVATE.some((net) => inCidr(ip, net));
export const isPrivateNetwork = (net: { base: number; prefix: number }) =>
  PRIVATE.some((p) => net.prefix >= p.prefix && inCidr(net.base, p));

// ------------------------------------------------------ payload validation --

export type ValidPort = { port: number; protocol: 'tcp'; service: string; product: string; version: string; banner: string };
export type ValidHost = { ip: string; ip_int: number; mac: string; hostname: string; vendor: string; device_type: string; os_guess: string; ports: ValidPort[] };
export type ValidScan = {
  scanner_version: string; started_at: string; finished_at: string;
  networks: { cidr: string; interface: string }[];
  authorized_by: string; hosts: ValidHost[]; open_port_count: number;
};

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max) : '');
const MAC_RE = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;
const HOSTNAME_RE = /^[A-Za-z0-9._-]{1,253}$/;

export class ScanRejected extends Error {}
const reject = (message: string): never => {
  throw new ScanRejected(message);
};

// Validates and normalises an uploaded scan. Anything outside the contract is refused
// with a reason; nothing is silently "fixed" into a different meaning.
export function validateScan(raw: unknown, now = Date.now()): ValidScan {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) reject('The scan must be a JSON object.');
  const s = raw as Record<string, any>;
  if (s.schema !== SCAN_SCHEMA) reject(`Unsupported scan format (expected ${SCAN_SCHEMA}).`);

  const started = Date.parse(s.started_at);
  const finished = Date.parse(s.finished_at);
  if (!Number.isFinite(started) || !Number.isFinite(finished)) reject('The scan start and finish times are missing.');
  if (started > finished) reject('The scan finished before it started.');
  if (finished > now + SIGNATURE_WINDOW_MS) reject('The scan finish time is in the future.');
  if (now - finished > 24 * 3600 * 1000) reject('The scan is more than 24 hours old; run it again.');

  const auth = s.authorization || {};
  if (auth.confirmed !== true) reject('The scan was not confirmed as authorised on the PC.');
  if (auth.statement_version !== AUTH_STATEMENT_VERSION) reject('The authorisation statement is out of date; update the scanner.');
  const authorizedBy = str(auth.confirmed_by, 120);
  if (authorizedBy.length < 2) reject('The name of the person who authorised the scan is missing.');

  if (!Array.isArray(s.networks) || !s.networks.length) reject('The scanned network range is missing.');
  if (s.networks.length > MAX_NETWORKS) reject(`At most ${MAX_NETWORKS} networks per scan.`);
  const nets = s.networks.map((n: any) => {
    const parsed = parseCidr(n?.cidr);
    if (!parsed) reject(`“${str(n?.cidr, 40)}” is not a valid IPv4 network.`);
    if (!isPrivateNetwork(parsed!)) reject(`${parsed!.text} is not a private local network. Only private ranges (10.x, 172.16–31.x, 192.168.x) can be scanned.`);
    if (parsed!.prefix < 16) reject(`${parsed!.text} is too large; scan /16 or smaller.`);
    return { ...parsed!, interface: str(n?.interface, 80) };
  });

  if (!Array.isArray(s.hosts)) reject('The device list is missing.');
  if (s.hosts.length > MAX_HOSTS) reject(`At most ${MAX_HOSTS} devices per scan.`);
  const seen = new Set<number>();
  let openPorts = 0;
  const hosts: ValidHost[] = s.hosts.map((h: any, i: number) => {
    const ipInt = ipToInt(h?.ip);
    if (ipInt === null) reject(`Device ${i + 1} has an invalid IPv4 address.`);
    if (!isPrivateIp(ipInt!)) reject(`Device ${h.ip} is not a private address.`);
    if (!nets.some((n: any) => inCidr(ipInt!, n))) reject(`Device ${h.ip} is outside the scanned networks.`);
    if (seen.has(ipInt!)) reject(`Device ${h.ip} appears twice.`);
    seen.add(ipInt!);
    const mac = str(h.mac, 17);
    const hostname = str(h.hostname, 253);
    if (mac && !MAC_RE.test(mac)) reject(`Device ${h.ip} has an invalid MAC address.`);
    if (hostname && !HOSTNAME_RE.test(hostname)) reject(`Device ${h.ip} has an invalid host name.`);
    const ports = h.ports ?? [];
    if (!Array.isArray(ports)) reject(`Device ${h.ip}: ports must be a list.`);
    if (ports.length > MAX_PORTS_PER_HOST) reject(`Device ${h.ip}: at most ${MAX_PORTS_PER_HOST} open ports.`);
    const portSeen = new Set<number>();
    const clean: ValidPort[] = ports.map((p: any) => {
      const port = Number(p?.port);
      if (!Number.isInteger(port) || port < 1 || port > 65535) reject(`Device ${h.ip}: invalid port.`);
      if ((p.protocol ?? 'tcp') !== 'tcp') reject(`Device ${h.ip}: only TCP ports are supported.`);
      if (p.state !== undefined && p.state !== 'open') reject(`Device ${h.ip}: only open ports are uploaded.`);
      if (portSeen.has(port)) reject(`Device ${h.ip}: port ${port} appears twice.`);
      portSeen.add(port);
      return { port, protocol: 'tcp' as const, service: str(p.service, 40), product: str(p.product, 80), version: str(p.version, 40), banner: str(p.banner, 200) };
    }).sort((a: ValidPort, b: ValidPort) => a.port - b.port);
    openPorts += clean.length;
    return {
      ip: intToIp(ipInt!), ip_int: ipInt!, mac: mac.toUpperCase().replace(/-/g, ':'), hostname,
      vendor: str(h.vendor, 80), device_type: str(h.device_type, 40), os_guess: str(h.os_guess, 80), ports: clean,
    };
  });

  return {
    scanner_version: str(s.scanner_version, 40),
    started_at: new Date(started).toISOString(),
    finished_at: new Date(finished).toISOString(),
    networks: nets.map((n: any) => ({ cidr: n.text, interface: n.interface })),
    authorized_by: authorizedBy,
    hosts: hosts.sort((a, b) => a.ip_int - b.ip_int),
    open_port_count: openPorts,
  };
}

export const networkSummary = (networks: { cidr: string }[]) =>
  `${networks.length} private network${networks.length === 1 ? '' : 's'} (${networks.map((n) => `/${n.cidr.split('/')[1]}`).join(', ')})`;

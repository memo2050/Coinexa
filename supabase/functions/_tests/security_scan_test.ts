import { strict as assert } from 'node:assert';
import {
  validateScan, ScanRejected, verifyEd25519, uploadMessage, pairMessage, timestampFresh, parseCidr, ipToInt,
  isPrivateIp, newPairingCode, normaliseCode, sha256Hex, SCAN_SCHEMA, AUTH_STATEMENT_VERSION,
} from '../_shared/securityScanLogic.ts';

const b64 = (bytes: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(bytes)));

async function keyPair() {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']) as CryptoKeyPair;
  const publicKey = b64(await crypto.subtle.exportKey('raw', pair.publicKey));
  const sign = async (message: string) => b64(await crypto.subtle.sign({ name: 'Ed25519' }, pair.privateKey, new TextEncoder().encode(message)));
  return { publicKey, sign };
}

const now = Date.parse('2026-11-25T04:00:00Z');
const scan = (over: Record<string, unknown> = {}) => ({
  schema: SCAN_SCHEMA, scanner_version: '0.1.0',
  started_at: '2026-11-25T03:55:00Z', finished_at: '2026-11-25T03:58:00Z',
  authorization: { confirmed: true, confirmed_by: 'Ramy (owner)', statement_version: AUTH_STATEMENT_VERSION },
  networks: [{ cidr: '192.168.1.0/24', interface: 'Wi-Fi' }],
  hosts: [
    { ip: '192.168.1.20', mac: 'aa-bb-cc-dd-ee-ff', hostname: 'printer', ports: [{ port: 9100 }, { port: 80, service: 'http', product: 'nginx', version: '1.18.0' }] },
    { ip: '192.168.1.1', ports: [{ port: 443, service: 'https' }] },
  ],
  ...over,
});
const rejects = (fn: () => unknown, re: RegExp) => assert.throws(fn, (e: Error) => e instanceof ScanRejected && re.test(e.message));

Deno.test('scan validation: a correct scan is normalised (sorted, MAC format, port count)', () => {
  const v = validateScan(scan(), now);
  assert.deepEqual(v.hosts.map((h) => h.ip), ['192.168.1.1', '192.168.1.20']);
  assert.equal(v.hosts[1].mac, 'AA:BB:CC:DD:EE:FF');
  assert.deepEqual(v.hosts[1].ports.map((p) => p.port), [80, 9100]);
  assert.equal(v.open_port_count, 3);
  assert.equal(v.authorized_by, 'Ramy (owner)');
});

Deno.test('scan validation: public, loopback, link-local and oversized networks are refused', () => {
  rejects(() => validateScan(scan({ networks: [{ cidr: '8.8.8.0/24' }], hosts: [] }), now), /not a private/);
  rejects(() => validateScan(scan({ networks: [{ cidr: '127.0.0.0/8' }], hosts: [] }), now), /not a private/);
  rejects(() => validateScan(scan({ networks: [{ cidr: '169.254.0.0/16' }], hosts: [] }), now), /not a private/);
  rejects(() => validateScan(scan({ networks: [{ cidr: '172.32.0.0/24' }], hosts: [] }), now), /not a private/);
  rejects(() => validateScan(scan({ networks: [{ cidr: '10.0.0.0/8' }], hosts: [] }), now), /too large/);
  rejects(() => validateScan(scan({ networks: [{ cidr: '192.168.0.0/15' }], hosts: [] }), now), /not a private/);
});

Deno.test('scan validation: devices outside the scanned range or public are refused', () => {
  rejects(() => validateScan(scan({ hosts: [{ ip: '192.168.2.5', ports: [] }] }), now), /outside the scanned/);
  rejects(() => validateScan(scan({ hosts: [{ ip: '1.1.1.1', ports: [] }] }), now), /not a private/);
  rejects(() => validateScan(scan({ hosts: [{ ip: '192.168.1.5' }, { ip: '192.168.1.5' }] }), now), /twice/);
  rejects(() => validateScan(scan({ hosts: [{ ip: '192.168.01.5' }] }), now), /invalid IPv4/);
});

Deno.test('scan validation: authorisation, times, ports and fields are enforced', () => {
  rejects(() => validateScan(scan({ authorization: { confirmed: false, confirmed_by: 'x y', statement_version: AUTH_STATEMENT_VERSION } }), now), /not confirmed/);
  rejects(() => validateScan(scan({ authorization: { confirmed: true, confirmed_by: '', statement_version: AUTH_STATEMENT_VERSION } }), now), /name/);
  rejects(() => validateScan(scan({ schema: 'other' }), now), /Unsupported/);
  rejects(() => validateScan(scan({ started_at: '2026-11-25T03:59:00Z' }), now), /finished before/);
  rejects(() => validateScan(scan({ started_at: '2026-11-22T00:00:00Z', finished_at: '2026-11-22T01:00:00Z' }), now), /24 hours/);
  rejects(() => validateScan(scan({ hosts: [{ ip: '192.168.1.5', ports: [{ port: 70000 }] }] }), now), /invalid port/);
  rejects(() => validateScan(scan({ hosts: [{ ip: '192.168.1.5', ports: [{ port: 53, protocol: 'udp' }] }] }), now), /TCP/);
  rejects(() => validateScan(scan({ hosts: [{ ip: '192.168.1.5', mac: 'zz' }] }), now), /MAC/);
  rejects(() => validateScan(scan({ hosts: [{ ip: '192.168.1.5', hostname: '<script>' }] }), now), /host name/);
  rejects(() => validateScan(scan({ hosts: Array.from({ length: 1025 }, (_, i) => ({ ip: `192.168.1.${i % 250}` })) }), now), /At most 1024/);
});

Deno.test('signatures: a valid Ed25519 signature verifies; any change to the upload breaks it', async () => {
  const k = await keyPair();
  const hash = await sha256Hex(JSON.stringify(scan()));
  const msg = uploadMessage('dev-1', '2026-11-25T04:00:00.000Z', 'nonce_abcdefghijklmnop', hash);
  const sig = await k.sign(msg);
  assert.equal(await verifyEd25519(k.publicKey, msg, sig), true);
  assert.equal(await verifyEd25519(k.publicKey, uploadMessage('dev-2', '2026-11-25T04:00:00.000Z', 'nonce_abcdefghijklmnop', hash), sig), false);
  assert.equal(await verifyEd25519(k.publicKey, uploadMessage('dev-1', '2026-11-25T04:00:00.000Z', 'nonce_abcdefghijklmnop', await sha256Hex('tampered')), sig), false);
  const other = await keyPair();
  assert.equal(await verifyEd25519(other.publicKey, msg, sig), false);
  assert.equal(await verifyEd25519(k.publicKey, msg, 'AAAA'), false);
  assert.equal(await verifyEd25519('bad', msg, sig), false);
});

Deno.test('pairing: proof of key possession; codes are unambiguous and normalised', async () => {
  const k = await keyPair();
  const code = newPairingCode();
  assert.match(code, /^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
  const sig = await k.sign(pairMessage(code.toLowerCase(), k.publicKey, 'RAMY-PC'));
  assert.equal(await verifyEd25519(k.publicKey, pairMessage(code, k.publicKey, 'RAMY-PC'), sig), true);
  assert.equal(normaliseCode(' abcde-fghjk '), 'ABCDEFGHJK');
});

Deno.test('timestamps and IP helpers', () => {
  assert.equal(timestampFresh('2026-11-25T04:04:00Z', now), true);
  assert.equal(timestampFresh('2026-11-25T04:06:00Z', now), false);
  assert.equal(timestampFresh('yesterday', now), false);
  assert.equal(parseCidr('192.168.1.77/24')!.text, '192.168.1.0/24');
  assert.equal(parseCidr('192.168.1.0/33'), null);
  assert.equal(isPrivateIp(ipToInt('172.31.255.1')!), true);
  assert.equal(isPrivateIp(ipToInt('172.32.0.1')!), false);
});

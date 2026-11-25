// Simulated linked Windows PC for staging tests. It talks to the `securityScan`
// function exactly as the real scanner will: its own Ed25519 key pair (private key
// never sent), a signed linking request, and signed, timestamped, single-use uploads.
// It never scans anything: the scan contents are sample data supplied by the test.
import { webcrypto as crypto } from 'node:crypto';

const b64 = (bytes) => Buffer.from(bytes).toString('base64');
const sha256Hex = async (text) => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))).toString('hex');
const nonce = () => crypto.randomUUID().replace(/-/g, '');

export const SCAN_SCHEMA = 'coinexa.scan.v1';
export const AUTH_STATEMENT_VERSION = 'scan-authorization-v1';

export async function simulatedPc(url, anonKey, name = 'TEST-PC') {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const publicKey = b64(await crypto.subtle.exportKey('raw', pair.publicKey));
  const sign = async (message) => b64(await crypto.subtle.sign({ name: 'Ed25519' }, pair.privateKey, new TextEncoder().encode(message)));
  const post = async (body) => {
    const res = await fetch(`${url}/functions/v1/securityScan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey },
      body: JSON.stringify(body),
    });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };
  const pc = {
    name, publicKey, deviceId: null,
    async link(code) {
      const normal = String(code).toUpperCase().replace(/[^A-Z0-9]/g, '');
      const signature = await sign(`coinexa-scan-pair-v1\n${normal}\n${publicKey}\n${name}`);
      const r = await post({ action: 'device_pair', code, public_key: publicKey, device_name: name, app_version: 'sim-0.1', signature });
      if (r.status === 200) pc.deviceId = r.data.device_id;
      return r;
    },
    // opts: { timestamp, nonce, deviceId, payloadOverride, signWith } to build bad requests on purpose.
    async signedRequest(action, payload, opts = {}) {
      const deviceId = opts.deviceId ?? pc.deviceId;
      const timestamp = opts.timestamp ?? new Date().toISOString();
      const n = opts.nonce ?? nonce();
      const signature = await (opts.signWith ?? sign)(`coinexa-scan-upload-v1\n${deviceId}\n${timestamp}\n${n}\n${await sha256Hex(payload)}`);
      const body = { action, device_id: deviceId, timestamp, nonce: n, signature, payload: opts.payloadOverride ?? payload };
      return { request: body, response: await post(body) };
    },
    upload(scan, opts) {
      return pc.signedRequest('device_upload', typeof scan === 'string' ? scan : JSON.stringify(scan), opts);
    },
    status() {
      return pc.signedRequest('device_status', '');
    },
    replay(body) {
      return post(body);
    },
    sign,
  };
  return pc;
}

// Sample scan of a small office network (fictional devices; addresses are private).
export function sampleScan(over = {}) {
  const finished = new Date();
  const started = new Date(finished.getTime() - 3 * 60 * 1000);
  return {
    schema: SCAN_SCHEMA,
    scanner_version: 'sim-0.1',
    started_at: started.toISOString(),
    finished_at: finished.toISOString(),
    authorization: { confirmed: true, confirmed_by: 'E2E Test Owner', statement_version: AUTH_STATEMENT_VERSION },
    networks: [{ cidr: '192.168.50.0/24', interface: 'Ethernet' }],
    hosts: [
      { ip: '192.168.50.1', mac: '00:11:22:33:44:01', hostname: 'router', vendor: 'Sample Router Co', device_type: 'router',
        ports: [{ port: 53, service: 'dns' }, { port: 80, service: 'http', product: 'lighttpd', version: '1.4.45' }, { port: 443, service: 'https' }] },
      { ip: '192.168.50.20', mac: '00:11:22:33:44:20', hostname: 'office-printer', vendor: 'Sample Printers', device_type: 'printer',
        ports: [{ port: 23, service: 'telnet' }, { port: 9100, service: 'jetdirect' }] },
      { ip: '192.168.50.35', hostname: 'nas', vendor: 'Sample Storage', device_type: 'storage', os_guess: 'Linux',
        ports: [{ port: 445, service: 'microsoft-ds', product: 'Samba', version: '4.9.5' }, { port: 22, service: 'ssh', product: 'OpenSSH', version: '7.4' }] },
      { ip: '192.168.50.101', hostname: 'desk-01', device_type: 'workstation', os_guess: 'Windows', ports: [{ port: 3389, service: 'ms-wbt-server' }] },
      { ip: '192.168.50.150', device_type: 'phone', ports: [] },
    ],
    ...over,
  };
}

import { strict as assert } from 'node:assert';
import { ICONS, ICON_KEYS, PLAN_ICON, suggestByRules } from '../_shared/agentIcons.ts';
import { checkSvg, rasterSize, validateIcon } from '../_shared/iconUpload.ts';
import { FEATURED, cleanName } from '../_shared/agentBrandingLogic.ts';

const b64 = (bytes: Uint8Array) => { let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(s); };
const text64 = (s: string) => b64(new TextEncoder().encode(s));

function png(width: number, height: number, extra = 0): Uint8Array {
  const b = new Uint8Array(33 + extra);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const dv = new DataView(b.buffer);
  dv.setUint32(16, width);
  dv.setUint32(20, height);
  return b;
}
function webpVp8x(width: number, height: number): Uint8Array {
  const b = new Uint8Array(40);
  b.set(new TextEncoder().encode('RIFF'), 0);
  b.set(new TextEncoder().encode('WEBPVP8X'), 8);
  const w = width - 1, h = height - 1;
  b.set([w & 255, (w >> 8) & 255, (w >> 16) & 255, h & 255, (h >> 8) & 255, (h >> 16) & 255], 24);
  return b;
}

Deno.test('the website and the server offer exactly the same approved icons', async () => {
  const src = await Deno.readTextFile(new URL('../../../src/components/agents/brandIcons.jsx', import.meta.url));
  const web = [...src.matchAll(/\{ key: '([a-z0-9-]+)', label: '[^']+', Icon: \w+ \}/g)].map((m) => m[1]);
  assert.deepEqual(web, ICONS.map((i) => i.key));
  assert.equal(new Set(web).size, web.length, 'no duplicate keys');
  for (const icon of Object.values(PLAN_ICON)) assert.ok(ICON_KEYS.has(icon), icon);
  for (const f of Object.values(FEATURED)) assert.ok(ICON_KEYS.has(f.icon), f.icon);
});

Deno.test('rule suggestions are deterministic and always from the library', () => {
  const cases: [string, string | null, string][] = [
    ['Dental clinic appointment reminders for patients', null, 'stethoscope'],
    ['Handles freight shipping and delivery tracking', null, 'truck'],
    ['Answers customer service tickets', null, 'headset'],
    ['Property listings for a realtor', null, 'house'],
    ['Something entirely unrelated', null, 'bot'],
    ['anything', 'legal', 'scale'],
    ['anything', 'fadel', 'calculator'],
  ];
  for (const [text, plan, want] of cases) {
    const a = suggestByRules(text, plan);
    const b = suggestByRules(text, plan);
    assert.equal(a.icon, want, text);
    assert.deepEqual(a, b);
    assert.ok(ICON_KEYS.has(a.icon));
  }
});

Deno.test('names: trimmed, 2–80 characters, no markup or control characters', () => {
  assert.equal(cleanName('  Sales   Pro  '), 'Sales Pro');
  assert.throws(() => cleanName('a'), /2 to 80/);
  assert.throws(() => cleanName('x'.repeat(81)), /2 to 80/);
  assert.throws(() => cleanName('<img src=x onerror=alert(1)>'), /not allowed/);
  assert.throws(() => cleanName('Tab\u0007bell'), /not allowed/);
  assert.equal(cleanName('R&D Assistant — v2'), 'R&D Assistant — v2');
});

Deno.test('PNG and WebP: real sizes read from the file, limits enforced', () => {
  assert.deepEqual(rasterSize(png(64, 64)), { type: 'png', width: 64, height: 64 });
  assert.deepEqual(rasterSize(webpVp8x(128, 96)), { type: 'webp', width: 128, height: 96 });
  assert.equal(validateIcon(b64(png(64, 64))).contentType, 'image/png');
  assert.equal(validateIcon(b64(webpVp8x(128, 128))).ext, 'webp');
  assert.throws(() => validateIcon(b64(png(16, 16))), /at least 32/);
  assert.throws(() => validateIcon(b64(png(4096, 4096))), /at most 2048/);
  assert.throws(() => validateIcon(b64(png(300, 64))), /close to square/);
  assert.throws(() => validateIcon(b64(png(64, 64, 300 * 1024))), /256 KB/);
});

Deno.test('a file that only claims to be an image is refused', () => {
  assert.throws(() => validateIcon(text64('GIF89a fake gif payload here......')), /Only PNG, WebP or SVG/);
  assert.throws(() => validateIcon(text64('<html><script>alert(1)</script></html>')), /Only PNG, WebP or SVG/);
  assert.throws(() => validateIcon('not base64 at all!!'), /could not be read/);
  const exe = new Uint8Array(200); exe.set([0x4d, 0x5a]);
  assert.throws(() => validateIcon(b64(exe)), /Only PNG, WebP or SVG/);
});

Deno.test('SVG: clean icons pass, anything active or external is refused', () => {
  const ok = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g fill="none" stroke="#0ea5e9"><path d="M2 2h20v20H2z"/><circle cx="12" cy="12" r="4"/></g></svg>';
  assert.equal(validateIcon(text64(ok)).contentType, 'image/svg+xml');
  assert.doesNotThrow(() => checkSvg('<?xml version="1.0"?><!-- logo --><svg viewBox="0 0 10 10"><defs><linearGradient id="a"><stop offset="0"/></linearGradient></defs><rect fill="url(#a)" width="10" height="10"/><use href="#a"/></svg>'));
  const bad: [string, RegExp][] = [
    ['<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>', /<script>/],
    ['<svg viewBox="0 0 1 1" onload="alert(1)"><path d="M0 0"/></svg>', /event handlers/],
    ['<svg viewBox="0 0 1 1"><foreignObject><div/></foreignObject></svg>', /foreignObject/],
    ['<svg viewBox="0 0 1 1"><image href="https://evil.example/x.png"/></svg>', /<image>/],
    ['<svg viewBox="0 0 1 1"><use href="https://evil.example/s.svg#x"/></svg>', /outside resource/],
    ['<svg viewBox="0 0 1 1"><a href="javascript:alert(1)"><path d="M0 0"/></a></svg>', /<a>|script/],
    ['<!DOCTYPE svg [<!ENTITY x "y">]><svg viewBox="0 0 1 1"></svg>', /start with an <svg>|declarations/],
    ['<svg viewBox="0 0 1 1"><rect style="fill:url(https://evil.example/a)"/></svg>', /outside resources/],
    ['<svg viewBox="0 0 1 1"><style>@import url(x)</style></svg>', /<style>/],
    ['<svg><path d="M0 0"/></svg>', /viewBox/],
  ];
  for (const [svg, msg] of bad) assert.throws(() => checkSvg(svg), msg, svg);
  assert.throws(() => validateIcon(text64(ok.replace('</svg>', `${'<path d="M0 0"/>'.repeat(5000)}</svg>`))), /64 KB/);
});

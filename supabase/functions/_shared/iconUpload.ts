// Validation of admin-uploaded agent icons (PNG, WebP, SVG). The file type is decided
// from the file's own bytes, never from its name or the browser's claim.
//   - size: PNG/WebP up to 256 KB, SVG up to 64 KB
//   - raster: 32–2048 px each side, aspect ratio between 1:2 and 2:1 (no stretched icons;
//     icons are drawn inside a 32 × 32 box with their proportions kept)
//   - SVG: strict allow-list of drawing elements; no scripts, event handlers, external
//     links, embedded documents or entities. Anything outside the list is refused, not
//     cleaned, so what is stored is exactly what was checked.
export type IconFile = { ext: 'png' | 'webp' | 'svg'; contentType: string; bytes: Uint8Array; width?: number; height?: number };

export const MAX_RASTER = 256 * 1024;
export const MAX_SVG = 64 * 1024;

const fail = (message: string) => Object.assign(new Error(message), { status: 400 });

export function decodeBase64(data: string): Uint8Array {
  const clean = String(data || '').replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
  if (!clean || !/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) throw fail('The file could not be read.');
  if (clean.length > Math.ceil(MAX_RASTER / 3) * 4 + 4) throw fail('The file is larger than 256 KB.');
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const u24 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
const ascii = (b: Uint8Array, o: number, n: number) => String.fromCharCode(...b.slice(o, o + n));

export function rasterSize(b: Uint8Array): { type: 'png' | 'webp'; width: number; height: number } | null {
  if (b.length > 24 && b[0] === 0x89 && ascii(b, 1, 3) === 'PNG' && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a && ascii(b, 12, 4) === 'IHDR') {
    const dv = new DataView(b.buffer, b.byteOffset);
    return { type: 'png', width: dv.getUint32(16), height: dv.getUint32(20) };
  }
  if (b.length > 30 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') {
    const chunk = ascii(b, 12, 4);
    if (chunk === 'VP8X') return { type: 'webp', width: u24(b, 24) + 1, height: u24(b, 27) + 1 };
    if (chunk === 'VP8L' && b[20] === 0x2f) {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return { type: 'webp', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8 ' && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) {
      return { type: 'webp', width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff };
    }
  }
  return null;
}

const SVG_TAGS = new Set(['svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'defs',
  'lineargradient', 'radialgradient', 'stop', 'title', 'desc', 'clippath', 'mask', 'use', 'symbol', 'metadata']);

export function checkSvg(text: string): void {
  const body = text.replace(/^﻿/, '').replace(/^\s*<\?xml[^>]*\?>/i, '').replace(/<!--[\s\S]*?-->/g, '').trim();
  if (!/^<svg[\s>]/i.test(body)) throw fail('The SVG file must start with an <svg> element.');
  if (/<!(DOCTYPE|ENTITY)|<!\[CDATA\[/i.test(body)) throw fail('The SVG contains declarations that are not allowed.');
  for (const m of body.matchAll(/<\s*\/?\s*([a-zA-Z][\w:-]*)/g)) {
    if (!SVG_TAGS.has(m[1].toLowerCase())) throw fail(`The SVG contains a <${m[1]}> element, which is not allowed in icons.`);
  }
  if (/\son[a-z]+\s*=/i.test(body)) throw fail('The SVG contains event handlers (on…=), which are not allowed.');
  if (/javascript:|vbscript:|data:(?!image\/(png|webp|svg\+xml);)/i.test(body)) throw fail('The SVG contains script or data links, which are not allowed.');
  for (const m of body.matchAll(/(?:xlink:)?href\s*=\s*["']([^"']*)["']/gi)) {
    if (!m[1].startsWith('#')) throw fail('The SVG links to an outside resource, which is not allowed.');
  }
  if (/url\(\s*["']?(?!#)/i.test(body) || /@import|expression\s*\(/i.test(body)) throw fail('The SVG loads outside resources in its styles, which is not allowed.');
  if (!/viewBox\s*=|width\s*=/i.test(body.slice(0, body.indexOf('>') + 1))) throw fail('The SVG needs a viewBox or width/height.');
}

export function validateIcon(data: string): IconFile {
  const bytes = decodeBase64(data);
  if (bytes.length < 20) throw fail('The file is empty or too small to be an icon.');
  const raster = rasterSize(bytes);
  if (raster) {
    if (bytes.length > MAX_RASTER) throw fail('PNG and WebP icons must be 256 KB or smaller.');
    const { width, height } = raster;
    if (width < 32 || height < 32) throw fail(`The image is ${width} × ${height} px; icons must be at least 32 × 32 px.`);
    if (width > 2048 || height > 2048) throw fail(`The image is ${width} × ${height} px; icons must be at most 2048 px on each side.`);
    const ratio = width / height;
    if (ratio > 2 || ratio < 0.5) throw fail(`The image is ${width} × ${height} px; icons must be close to square (at most 2:1).`);
    return { ext: raster.type, contentType: raster.type === 'png' ? 'image/png' : 'image/webp', bytes, width, height };
  }
  let text = '';
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw fail('Only PNG, WebP or SVG files can be used as icons.'); }
  if (!/<svg[\s>]/i.test(text)) throw fail('Only PNG, WebP or SVG files can be used as icons.');
  if (bytes.length > MAX_SVG) throw fail('SVG icons must be 64 KB or smaller.');
  checkSvg(text);
  return { ext: 'svg', contentType: 'image/svg+xml', bytes };
}

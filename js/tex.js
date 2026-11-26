// Every texture is painted on canvases at load time (nothing is downloaded): sand, plaster, concrete,
// corrugated steel, shipping containers, camouflage patterns, skin, blood. Most also get a normal map
// worked out from their brightness, so the light catches the bumps.
import * as THREE from 'three';

const cache = new Map();
export const rng = (seed) => { let s = (seed * 2654435761) >>> 0 || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };
const mk = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
export const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
export const shade = (n, k) => { const r = Math.min(255, ((n >> 16) & 255) * k) | 0, g = Math.min(255, ((n >> 8) & 255) * k) | 0, b = Math.min(255, (n & 255) * k) | 0; return `rgb(${r},${g},${b})`; };
let ANISO = 4;
export const setAniso = (a) => { ANISO = a; };

function noise(g, w, h, r, amt, size = 1, n = 0.5) {
  // straight into the pixels (hundreds of thousands of fillRects took seconds)
  const img = g.getImageData(0, 0, w, h), d = img.data, count = (w * h) / (size * size) * n;
  for (let i = 0; i < count; i++) {
    const v = (r() - 0.5) * amt, x0 = (r() * w) | 0, y0 = (r() * h) | 0;
    for (let yy = y0; yy < Math.min(h, y0 + size); yy++) for (let xx = x0; xx < Math.min(w, x0 + size); xx++) {
      const k = (yy * w + xx) * 4;
      if (v > 0) { d[k] += (255 - d[k]) * v; d[k + 1] += (255 - d[k + 1]) * v; d[k + 2] += (255 - d[k + 2]) * v; }
      else { d[k] *= 1 + v; d[k + 1] *= 1 + v; d[k + 2] *= 1 + v; }
    }
  }
  g.putImageData(img, 0, 0);
}
function blotch(g, w, h, r, n, col, rmin, rmax, a0 = 0.1, a1 = 0.2) {
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, rad = rmin + r() * (rmax - rmin);
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, col.replace('A', (a0 + r() * (a1 - a0)).toFixed(3))); gr.addColorStop(1, col.replace('A', '0'));
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}
function tex(c, name, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = ANISO; cache.set(name, t); return t;
}
// a normal map from a canvas's brightness (a height map)
function normalOf(src, name, strength = 2) {
  if (cache.has(name)) return cache.get(name);
  // worked out on a quarter-size copy: four times faster, and the bumps are soft anyway
  if (src.width > 128) { const [c2, g2] = mk(src.width >> 1, src.height >> 1); g2.drawImage(src, 0, 0, c2.width, c2.height); src = c2; strength *= 0.5; }
  const w = src.width, h = src.height, d = src.getContext('2d').getImageData(0, 0, w, h).data;
  const [c, g] = mk(w, h), out = g.createImageData(w, h), o = out.data;
  const L = (x, y) => { x = (x + w) % w; y = (y + h) % h; const i = (y * w + x) * 4; return (d[i] + d[i + 1] + d[i + 2]) / 765; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (L(x + 1, y) - L(x - 1, y)) * strength, dy = (L(x, y + 1) - L(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    o[i] = (-dx / l * 0.5 + 0.5) * 255; o[i + 1] = (dy / l * 0.5 + 0.5) * 255; o[i + 2] = (1 / l * 0.5 + 0.5) * 255; o[i + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  return tex(c, name, { srgb: false });
}
const pair = (name, draw, size = 512, strength = 2) => {
  if (cache.has(name)) return { map: cache.get(name), normalMap: cache.get(name + ':n') };
  const [c, g] = mk(size); draw(g, size, c);
  return { map: tex(c, name), normalMap: normalOf(c, name + ':n', strength) };
};

// ---------- ground ----------
export const sand = (seed = 3) => pair('sand' + seed, (g, s) => {
  const r = rng(seed);
  g.fillStyle = '#b59a72'; g.fillRect(0, 0, s, s);
  blotch(g, s, s, r, 40, 'rgba(120,92,58,A)', 30, 120, 0.05, 0.18);
  blotch(g, s, s, r, 30, 'rgba(220,200,160,A)', 20, 90, 0.05, 0.15);
  noise(g, s, s, r, 0.22, 1, 1.2); noise(g, s, s, r, 0.12, 2, 0.4);
  // pebbles: the same brown, lighter or darker (independent channels made confetti)
  for (let i = 0; i < 260; i++) { const k = 0.55 + r() * 0.75; g.fillStyle = `rgba(${(150 * k) | 0},${(124 * k) | 0},${(92 * k) | 0},${0.4 + r() * 0.5})`; const z = 1 + r() * 3; g.beginPath(); g.ellipse(r() * s, r() * s, z, z * (0.6 + r() * 0.4), r() * 3, 0, 7); g.fill(); }
  // tyre ruts / foot traffic
  g.strokeStyle = 'rgba(90,70,45,0.08)'; g.lineWidth = 14; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(0, r() * s); g.bezierCurveTo(s * 0.3, r() * s, s * 0.6, r() * s, s, r() * s); g.stroke(); }
}, 512, 3);
export const asphalt = (seed = 5) => pair('asph' + seed, (g, s) => {
  const r = rng(seed);
  g.fillStyle = '#3c3d3d'; g.fillRect(0, 0, s, s);
  noise(g, s, s, r, 0.3, 1, 1.5); noise(g, s, s, r, 0.15, 3, 0.3);
  blotch(g, s, s, r, 20, 'rgba(20,20,20,A)', 20, 80, 0.1, 0.25);
  blotch(g, s, s, r, 8, 'rgba(70,60,40,A)', 30, 90, 0.05, 0.12);
  g.strokeStyle = 'rgba(15,15,15,0.6)'; g.lineWidth = 1.5;
  for (let i = 0; i < 10; i++) { let x = r() * s, y = r() * s; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); }
}, 512, 2.5);
export const concreteFloor = (seed = 6) => pair('cfloor' + seed, (g, s) => {
  const r = rng(seed);
  g.fillStyle = '#8d8a83'; g.fillRect(0, 0, s, s);
  blotch(g, s, s, r, 30, 'rgba(60,55,50,A)', 20, 110, 0.04, 0.12);
  noise(g, s, s, r, 0.14, 1, 1); noise(g, s, s, r, 0.08, 4, 0.2);
  g.fillStyle = 'rgba(40,38,35,0.5)'; g.fillRect(0, 0, s, 2); g.fillRect(0, 0, 2, s);
  blotch(g, s, s, r, 4, 'rgba(30,25,15,A)', 20, 60, 0.15, 0.3); // oil
}, 512, 2);

// ---------- walls ----------
export const plaster = (base = 0xcdb896, seed = 7) => pair('plas' + base + ':' + seed, (g, s) => {
  const r = rng(seed);
  g.fillStyle = hex(base); g.fillRect(0, 0, s, s);
  blotch(g, s, s, r, 50, 'rgba(110,85,55,A)', 20, 100, 0.04, 0.12);
  blotch(g, s, s, r, 30, 'rgba(255,245,225,A)', 20, 80, 0.04, 0.1);
  noise(g, s, s, r, 0.16, 1, 1); noise(g, s, s, r, 0.1, 3, 0.3);
  // flaked plaster showing the block underneath: a few soft-edged patches
  for (let i = 0; i < 3; i++) {
    const x = r() * s, y = r() * s, w = 30 + r() * 70, h = 20 + r() * 40;
    const gr = g.createRadialGradient(x, y, 2, x, y, Math.max(w, h) / 2);
    gr.addColorStop(0, 'rgba(150,140,125,0.55)'); gr.addColorStop(0.7, 'rgba(150,140,125,0.35)'); gr.addColorStop(1, 'rgba(150,140,125,0)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, w / 2, h / 2, r(), 0, 7); g.fill();
  }
  // dirt rising from the ground (the texture's bottom is the base of the wall)
  const gr = g.createLinearGradient(0, s * 0.7, 0, s); gr.addColorStop(0, 'rgba(110,85,55,0)'); gr.addColorStop(1, 'rgba(110,85,55,0.35)'); g.fillStyle = gr; g.fillRect(0, 0, s, s);
  g.strokeStyle = 'rgba(60,45,30,0.35)'; g.lineWidth = 1;
  for (let i = 0; i < 5; i++) { let x = r() * s, y = r() * s; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 30; y += r() * 25; g.lineTo(x, y); } g.stroke(); }
}, 512, 2.5);
export const concrete = (seed = 8) => pair('conc' + seed, (g, s) => {
  const r = rng(seed);
  g.fillStyle = '#9a978f'; g.fillRect(0, 0, s, s);
  blotch(g, s, s, r, 40, 'rgba(70,65,58,A)', 20, 90, 0.04, 0.12);
  noise(g, s, s, r, 0.16, 1, 1);
  for (let i = 0; i < 120; i++) { g.fillStyle = 'rgba(50,48,45,0.5)'; g.beginPath(); g.arc(r() * s, r() * s, 0.8 + r() * 1.8, 0, 7); g.fill(); } // air holes
  // form-tie holes and panel seams
  g.fillStyle = 'rgba(50,48,45,0.4)'; g.fillRect(0, s / 2, s, 2); g.fillRect(s / 2, 0, 2, s);
  for (const [x, y] of [[s / 4, s / 4], [s * 3 / 4, s / 4], [s / 4, s * 3 / 4], [s * 3 / 4, s * 3 / 4]]) { g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); }
  const gr = g.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, 'rgba(40,35,30,0.15)'); gr.addColorStop(0.15, 'rgba(40,35,30,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 12; i++) { const x = r() * s, len = 40 + r() * 160; const dg = g.createLinearGradient(0, 0, 0, len); dg.addColorStop(0, 'rgba(40,35,25,0.25)'); dg.addColorStop(1, 'rgba(40,35,25,0)'); g.fillStyle = dg; g.fillRect(x, 0, 2 + r() * 4, len); }
}, 512, 2.5);
export const blocks = (seed = 9) => pair('blk' + seed, (g, s) => { // cinder blocks
  const r = rng(seed);
  g.fillStyle = '#8f8a80'; g.fillRect(0, 0, s, s);
  const bw = s / 4, bh = s / 8;
  for (let y = 0; y < 8; y++) for (let x = -1; x < 5; x++) {
    const ox = (y % 2) * bw / 2, k = 0.85 + r() * 0.25;
    g.fillStyle = shade(0x8f8a80, k); g.fillRect(x * bw + ox + 2, y * bh + 2, bw - 4, bh - 4);
  }
  noise(g, s, s, r, 0.2, 1, 1);
  g.fillStyle = 'rgba(40,38,35,0.7)'; for (let y = 0; y <= 8; y++) g.fillRect(0, y * bh - 1, s, 3);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 5; x++) g.fillRect(x * bw + (y % 2) * bw / 2 - 1, y * bh, 3, bh);
}, 512, 3);
export const corrugated = (base = 0x7c8288, seed = 10, rust = 0.4) => pair('corr' + base + seed, (g, s) => {
  const r = rng(seed);
  for (let x = 0; x < s; x++) { const k = 0.75 + Math.sin(x / s * Math.PI * 32) * 0.22; g.fillStyle = shade(base, k); g.fillRect(x, 0, 1, s); }
  noise(g, s, s, r, 0.1, 1, 0.6);
  blotch(g, s, s, r, (30 * rust) | 0, 'rgba(120,60,25,A)', 8, 50, 0.15, 0.45);
  for (let i = 0; i < 20 * rust; i++) { const x = r() * s, y = r() * s, len = 20 + r() * 90; const dg = g.createLinearGradient(0, y, 0, y + len); dg.addColorStop(0, 'rgba(110,50,20,0.5)'); dg.addColorStop(1, 'rgba(110,50,20,0)'); g.fillStyle = dg; g.fillRect(x, y, 2 + r() * 3, len); }
}, 512, 3);
export const container = (base, seed = 11, label = '') => pair('cont' + base + seed, (g, s) => {
  const r = rng(seed);
  // vertical ribs (a 40' box is ~12 m: this texture covers 2.4 m)
  for (let x = 0; x < s; x++) { const ph = (x / s * 12) % 1; const k = ph < 0.15 ? 0.7 : ph < 0.5 ? 1 : ph < 0.65 ? 0.82 : 0.95; g.fillStyle = shade(base, k); g.fillRect(x, 0, 1, s); }
  noise(g, s, s, r, 0.12, 1, 0.7);
  blotch(g, s, s, r, 30, 'rgba(110,55,25,A)', 6, 40, 0.2, 0.5);
  blotch(g, s, s, r, 12, 'rgba(30,25,20,A)', 20, 90, 0.08, 0.2);
  g.fillStyle = shade(base, 0.6); g.fillRect(0, 0, s, 10); g.fillRect(0, s - 12, s, 12);
  if (label) { g.font = 'bold 54px Arial'; g.fillStyle = 'rgba(240,240,235,0.85)'; g.fillText(label, 30, 120); g.font = 'bold 22px Arial'; g.fillText((r() * 9e6 | 0) + ' 22G1', 30, 160); }
  for (let i = 0; i < 25; i++) { g.fillStyle = 'rgba(200,190,170,0.25)'; g.fillRect(r() * s, r() * s, 1 + r() * 20, 1); } // scrapes
}, 512, 2.5);
export const woodPlanks = (base = 0x7a5a3a, seed = 12) => pair('wood' + base + seed, (g, s) => {
  const r = rng(seed);
  for (let x = 0; x < s; x += 64) {
    g.fillStyle = shade(base, 0.8 + r() * 0.35); g.fillRect(x, 0, 64, s);
    g.strokeStyle = 'rgba(0,0,0,0.15)';
    for (let i = 0; i < 8; i++) { const xx = x + 4 + r() * 56; g.beginPath(); g.moveTo(xx, 0); g.bezierCurveTo(xx + r() * 8 - 4, s * 0.3, xx + r() * 8 - 4, s * 0.6, xx, s); g.stroke(); }
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x, 0, 2, s);
  }
  noise(g, s, s, r, 0.12, 1, 0.8);
}, 512, 2);
export const sandbag = (seed = 13) => pair('sbag' + seed, (g, s) => {
  const r = rng(seed);
  g.fillStyle = '#8f7d5c'; g.fillRect(0, 0, s, s);
  const rows = 4, bw = s / 2;
  for (let y = 0; y < rows; y++) for (let x = -1; x < 3; x++) {
    const ox = (y % 2) * bw / 2, cx = x * bw + ox + bw / 2, cy = y * s / rows + s / rows / 2;
    const gr = g.createRadialGradient(cx, cy - 6, 4, cx, cy, bw * 0.55);
    gr.addColorStop(0, shade(0x9c8a66, 1.1 + r() * 0.1)); gr.addColorStop(0.8, shade(0x8a7756, 0.85)); gr.addColorStop(1, 'rgba(40,32,22,1)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(cx, cy, bw / 2 - 3, s / rows / 2 - 3, 0, 0, 7); g.fill();
  }
  for (let i = 0; i < 4000; i++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)'; g.fillRect(r() * s, r() * s, 2, 1); } // weave
}, 256, 3);
export const metalPlate = (base = 0x55585a, seed = 14) => pair('mplate' + base + seed, (g, s) => {
  const r = rng(seed);
  g.fillStyle = hex(base); g.fillRect(0, 0, s, s);
  noise(g, s, s, r, 0.12, 1, 1);
  for (let i = 0; i < 60; i++) { g.strokeStyle = `rgba(255,255,255,${0.03 + r() * 0.06})`; g.beginPath(); const x = r() * s, y = r() * s; g.moveTo(x, y); g.lineTo(x + r() * 60 - 30, y + r() * 4); g.stroke(); }
  blotch(g, s, s, r, 10, 'rgba(110,60,30,A)', 10, 40, 0.1, 0.3);
}, 256, 1.5);

// ---------- camouflage, skin, gear ----------
export function camo(u, seed = 21) {
  const name = 'camo' + u.name;
  if (cache.has(name)) return { map: cache.get(name), normalMap: cache.get(name + ':n') };
  const s = 256, [c, g] = mk(s), r = rng(seed);
  g.fillStyle = hex(u.base); g.fillRect(0, 0, s, s);
  const cols = u.cols;
  if (u.kind === 'blob') for (let i = 0; i < 70; i++) {
    g.fillStyle = hex(cols[i % cols.length]); g.beginPath();
    const x = r() * s, y = r() * s, n = 7, rad = 6 + r() * 20;
    for (let k = 0; k <= n; k++) { const a = k / n * 6.283, rr = rad * (0.5 + r() * 0.8); g.lineTo(x + Math.cos(a) * rr * 1.5, y + Math.sin(a) * rr); }
    g.fill();
  } else if (u.kind === 'pixel') for (let i = 0; i < 900; i++) { g.fillStyle = hex(cols[i % cols.length]); const z = 3 + (r() * 3 | 0) * 3; g.fillRect((r() * s / 3 | 0) * 3, (r() * s / 3 | 0) * 3, z, z * (r() < 0.5 ? 1 : 2)); }
  else if (u.kind === 'dots') for (let i = 0; i < 700; i++) { g.fillStyle = hex(cols[i % cols.length]); g.beginPath(); g.arc(r() * s, r() * s, 1.5 + r() * 3.5, 0, 7); g.fill(); }
  else if (u.kind === 'scale') for (let i = 0; i < 260; i++) { g.strokeStyle = hex(cols[i % cols.length]); g.lineWidth = 2 + r() * 3; g.beginPath(); g.arc(r() * s, r() * s, 4 + r() * 10, r() * 3, r() * 3 + 3); g.stroke(); }
  else blotch(g, s, s, r, 30, 'rgba(255,255,255,A)', 10, 50, 0.01, 0.04);
  // the weave of the ripstop
  for (let x = 0; x < s; x += 6) { g.fillStyle = 'rgba(0,0,0,0.02)'; g.fillRect(x, 0, 1, s); g.fillRect(0, x, s, 1); }
  noise(g, s, s, r, 0.12, 1, 1);
  const t = tex(c, name); normalOf(c, name + ':n', 0.7);
  return { map: t, normalMap: cache.get(name + ':n') };
}
export const skin = (tone = 0xc89474, seed = 30) => pair('skin' + tone, (g, s) => {
  const r = rng(seed);
  g.fillStyle = hex(tone); g.fillRect(0, 0, s, s);
  blotch(g, s, s, r, 30, 'rgba(160,80,60,A)', 6, 30, 0.04, 0.1);
  noise(g, s, s, r, 0.07, 1, 1);
}, 128, 1);
export const cordura = (base = 0x6a604a, seed = 31) => pair('cord' + base, (g, s) => {
  const r = rng(seed);
  g.fillStyle = hex(base); g.fillRect(0, 0, s, s);
  for (let y = 0; y < s; y += 2) { g.fillStyle = y % 4 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.05)'; g.fillRect(0, y, s, 1); }
  for (let x = 0; x < s; x += 2) { g.fillStyle = 'rgba(0,0,0,0.07)'; g.fillRect(x, 0, 1, s); }
  // MOLLE webbing rows
  for (let y = 24; y < s; y += 26) { g.fillStyle = shade(base, 0.72); g.fillRect(0, y, s, 7); for (let x = 0; x < s; x += 24) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, y, 2, 7); } }
  noise(g, s, s, r, 0.1, 1, 0.6);
}, 128, 2);

// ---------- blood ----------
export function splat(seed = 1, wall = false) {
  const name = 'splat' + seed + wall; if (cache.has(name)) return cache.get(name);
  const s = 256, [c, g] = mk(s), r = rng(seed);
  const col = (a) => `rgba(${90 + r() * 30 | 0},${4 + r() * 6 | 0},${4 + r() * 4 | 0},${a})`;
  g.fillStyle = col(0.92); g.beginPath(); g.arc(s / 2, s / 2, s * 0.2, 0, 7); g.fill();
  for (let i = 0; i < 26; i++) { const a = r() * 6.283, d = s * (0.12 + r() * 0.24), rad = 3 + r() * 20; g.fillStyle = col(0.6 + r() * 0.35); g.beginPath(); g.arc(s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, rad, 0, 7); g.fill(); }
  for (let i = 0; i < 60; i++) { const a = r() * 6.283, d = s * (0.25 + r() * 0.22); g.fillStyle = col(0.75); g.beginPath(); g.arc(s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, 1 + r() * 3, 0, 7); g.fill(); }
  if (wall) for (let i = 0; i < 6; i++) { const x = s * 0.35 + r() * s * 0.3, len = 30 + r() * 90; const dg = g.createLinearGradient(0, s / 2, 0, s / 2 + len); dg.addColorStop(0, col(0.85)); dg.addColorStop(1, col(0)); g.fillStyle = dg; g.fillRect(x, s / 2, 2 + r() * 3, len); }
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.2); gr.addColorStop(0, 'rgba(30,0,0,0.5)'); gr.addColorStop(1, 'rgba(30,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s);
  return tex(c, name, { repeat: false });
}
export function poolTex() {
  if (cache.has('pool')) return cache.get('pool');
  const s = 256, [c, g] = mk(s), r = rng(77);
  g.fillStyle = 'rgba(70,3,3,0.96)'; g.beginPath();
  for (let k = 0; k <= 24; k++) { const a = k / 24 * 6.283, rr = s * (0.36 + r() * 0.1); g.lineTo(s / 2 + Math.cos(a) * rr, s / 2 + Math.sin(a) * rr); }
  g.fill();
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.45); gr.addColorStop(0, 'rgba(25,0,0,0.6)'); gr.addColorStop(0.8, 'rgba(25,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s);
  return tex(c, 'pool', { repeat: false });
}
export function wound(seed = 1) { // an entry wound: dark hole, torn ring, blood around it
  const name = 'wound' + seed; if (cache.has(name)) return cache.get(name);
  const s = 64, [c, g] = mk(s), r = rng(seed);
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, 'rgba(15,0,0,1)'); gr.addColorStop(0.2, 'rgba(60,2,2,1)'); gr.addColorStop(0.45, 'rgba(110,8,6,0.9)'); gr.addColorStop(1, 'rgba(90,4,4,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 5; i++) { const x = s / 2 + (r() - 0.5) * 10, len = 8 + r() * 22; g.fillStyle = 'rgba(100,6,4,0.8)'; g.fillRect(x, s / 2, 1.5, len); }
  return tex(c, name, { repeat: false });
}
export function meat() {
  if (cache.has('meat')) return cache.get('meat');
  const s = 128, [c, g] = mk(s), r = rng(91);
  g.fillStyle = '#6e0f0c'; g.fillRect(0, 0, s, s);
  blotch(g, s, s, r, 30, 'rgba(180,40,40,A)', 4, 18, 0.2, 0.5); blotch(g, s, s, r, 10, 'rgba(230,200,170,A)', 3, 10, 0.3, 0.6); blotch(g, s, s, r, 20, 'rgba(30,0,0,A)', 4, 14, 0.3, 0.6);
  return tex(c, 'meat');
}
// a scuffed patch on a wall where a bullet hit
export function bulletHole(kind = 'stone') {
  const name = 'hole' + kind; if (cache.has(name)) return cache.get(name);
  const s = 64, [c, g] = mk(s), r = rng(kind.length * 7);
  if (kind === 'metal') { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 10); gr.addColorStop(0, 'rgba(5,5,5,1)'); gr.addColorStop(0.5, 'rgba(40,40,40,0.9)'); gr.addColorStop(1, 'rgba(180,180,180,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }
  else {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 28); gr.addColorStop(0, 'rgba(10,8,6,1)'); gr.addColorStop(0.15, 'rgba(40,32,24,0.95)'); gr.addColorStop(0.4, 'rgba(90,80,65,0.6)'); gr.addColorStop(1, 'rgba(90,80,65,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(30,25,20,0.6)'; for (let i = 0; i < 6; i++) { const a = r() * 6.28; g.beginPath(); g.moveTo(32, 32); g.lineTo(32 + Math.cos(a) * (10 + r() * 18), 32 + Math.sin(a) * (10 + r() * 18)); g.stroke(); }
  }
  return tex(c, name, { repeat: false });
}
// scope reticles, drawn on a transparent canvas
export function reticle(kind) {
  const name = 'ret' + kind; if (cache.has(name)) return cache.get(name);
  const s = 256, [c, g] = mk(s), m = s / 2;
  if (kind === 'dot') { g.fillStyle = '#ff2a1a'; g.shadowColor = '#ff2a1a'; g.shadowBlur = 8; g.beginPath(); g.arc(m, m, 5, 0, 7); g.fill(); }
  else if (kind === 'holo') { g.strokeStyle = '#ff3020'; g.fillStyle = '#ff3020'; g.shadowColor = '#ff3020'; g.shadowBlur = 6; g.lineWidth = 3; g.beginPath(); g.arc(m, m, 50, 0, 7); g.stroke(); g.beginPath(); g.arc(m, m, 4, 0, 7); g.fill(); for (const a of [0, 1.5708, 3.1416, 4.712]) { g.fillRect(m + Math.cos(a) * 50 - 2, m + Math.sin(a) * 50 - 2, 4 + Math.cos(a) * 6, 4 + Math.sin(a) * 6); } }
  else if (kind === 'chevron') { g.fillStyle = '#ff2a1a'; g.shadowColor = '#ff2a1a'; g.shadowBlur = 5; g.beginPath(); g.moveTo(m, m); g.lineTo(m - 9, m + 14); g.lineTo(m - 5, m + 14); g.lineTo(m, m + 6); g.lineTo(m + 5, m + 14); g.lineTo(m + 9, m + 14); g.closePath(); g.fill(); g.shadowBlur = 0; g.fillStyle = '#111'; g.fillRect(m - 1, m + 16, 2, 110); for (let i = 1; i < 5; i++) g.fillRect(m - 10 + i, m + 20 + i * 20, 20 - i * 2, 2); }
  else if (kind === 'lpvo') { g.fillStyle = '#111'; g.fillRect(0, m - 1, m - 12, 2); g.fillRect(m + 12, m - 1, m, 2); g.fillRect(m - 1, m + 12, 2, m); g.fillRect(0, m - 3, 40, 6); g.fillRect(s - 40, m - 3, 40, 6); g.fillRect(m - 3, s - 40, 6, 40); g.fillStyle = '#ff2a1a'; g.shadowColor = '#ff2a1a'; g.shadowBlur = 6; g.beginPath(); g.arc(m, m, 3, 0, 7); g.fill(); }
  else { // mil-dot
    g.fillStyle = '#0a0a0a'; g.fillRect(0, m - 1, s, 2); g.fillRect(m - 1, 0, 2, s); g.fillRect(0, m - 3, 50, 6); g.fillRect(s - 50, m - 3, 50, 6); g.fillRect(m - 3, s - 50, 6, 50); g.fillRect(m - 3, 0, 6, 50);
    for (let i = 1; i <= 5; i++) for (const sg of [-1, 1]) { g.beginPath(); g.arc(m + sg * i * 14, m, 2.2, 0, 7); g.fill(); g.beginPath(); g.arc(m, m + sg * i * 14, 2.2, 0, 7); g.fill(); }
  }
  return tex(c, name, { repeat: false });
}
// soft round particle (smoke, dust, muzzle flash)
export function puff(col = '255,255,255') {
  const name = 'puff' + col; if (cache.has(name)) return cache.get(name);
  const s = 128, [c, g] = mk(s), r = rng(4);
  for (let i = 0; i < 9; i++) { const x = 64 + (r() - 0.5) * 40, y = 64 + (r() - 0.5) * 40, rad = 25 + r() * 30; const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(${col},0.35)`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; g.fillRect(0, 0, s, s); }
  return tex(c, name, { repeat: false });
}
export function flashTex() {
  if (cache.has('mflash')) return cache.get('mflash');
  const s = 128, [c, g] = mk(s);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(0.2, 'rgba(255,200,90,0.9)'); gr.addColorStop(0.5, 'rgba(255,120,30,0.35)'); gr.addColorStop(1, 'rgba(255,80,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) { g.save(); g.translate(64, 64); g.rotate(i / 5 * 6.283 + 0.3); const lg = g.createLinearGradient(0, 0, 60, 0); lg.addColorStop(0, 'rgba(255,230,150,0.9)'); lg.addColorStop(1, 'rgba(255,140,40,0)'); g.fillStyle = lg; g.beginPath(); g.moveTo(0, -6); g.lineTo(62, 0); g.lineTo(0, 6); g.fill(); g.restore(); }
  return tex(c, 'mflash', { repeat: false });
}
export function finishTex(f) { // a gun finish with a pattern (hydro-dip MultiCam, tiger stripe)
  const name = 'fin' + f.name; if (cache.has(name)) return cache.get(name);
  const s = 256, [c, g] = mk(s), r = rng(55);
  g.fillStyle = hex(f.color); g.fillRect(0, 0, s, s);
  if (f.pattern === 'multicam') for (let i = 0; i < 60; i++) { g.fillStyle = hex([0x5d5a3a, 0x9c8c66, 0x4a3b28, 0xb7a988][i % 4]); g.beginPath(); g.ellipse(r() * s, r() * s, 6 + r() * 22, 4 + r() * 12, r() * 3, 0, 7); g.fill(); }
  if (f.pattern === 'tiger') for (let i = 0; i < 18; i++) { g.fillStyle = 'rgba(25,24,15,0.9)'; g.beginPath(); const y = r() * s; g.moveTo(0, y); g.bezierCurveTo(s * 0.3, y - 10 + r() * 20, s * 0.6, y - 10 + r() * 20, s, y + r() * 10); g.lineTo(s, y + 8); g.bezierCurveTo(s * 0.6, y + 6, s * 0.3, y + 10, 0, y + 6); g.fill(); }
  noise(g, s, s, r, 0.08, 1, 1);
  return tex(c, name);
}
export function polymer(base = 0x1c1d1f) { // a gun's texture: fine stipple, wear on the edges
  const name = 'poly' + base; if (cache.has(name)) return cache.get(name);
  const s = 128, [c, g] = mk(s), r = rng(base & 255);
  g.fillStyle = hex(base); g.fillRect(0, 0, s, s); noise(g, s, s, r, 0.12, 1, 1.4);
  for (let i = 0; i < 30; i++) { g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(r() * s, r() * s, 1 + r() * 8, 1); }
  return tex(c, name);
}
export function skyTex(top, mid, bot, sunY = 0.4) {
  const name = 'sky' + top + mid + bot; if (cache.has(name)) return cache.get(name);
  const [c, g] = mk(8, 512);
  const gr = g.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, top); gr.addColorStop(sunY, mid); gr.addColorStop(0.5, bot); gr.addColorStop(1, bot);
  g.fillStyle = gr; g.fillRect(0, 0, 8, 512);
  return tex(c, name, { repeat: false });
}
export function nameTag(text, color) {
  const [c, g] = mk(256, 48);
  g.font = '600 26px "Barlow Condensed", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,0.7)'; g.strokeText(text, 128, 24); g.fillStyle = color; g.fillText(text, 128, 24);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function signTex(text, bg = '#20402a', fg = '#e8e8e0', w = 512, h = 128) {
  const name = 'sign' + text + bg; if (cache.has(name)) return cache.get(name);
  const [c, g] = mk(w, h), r = rng(text.length);
  g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.font = `bold ${h * 0.45}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2);
  noise(g, w, h, r, 0.2, 1, 0.5); blotch(g, w, h, r, 8, 'rgba(60,40,20,A)', 10, 40, 0.1, 0.3);
  return tex(c, name, { repeat: false });
}

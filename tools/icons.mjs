// Renders icons/icon.svg to the PNG sizes the app manifest needs, and cover.png (a firefight in Al-Hadra).
import { open, sleep } from './harness.mjs';
import { spawn } from 'child_process';
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 8600 + Math.floor(Math.random() * 300);
const srv = spawn(process.execPath, ['serve.js'], { cwd: root, env: { ...process.env, PORT: port }, stdio: 'ignore' });
process.env.SH_URL = `http://localhost:${port}/`;
await sleep(600);
const { ev, send, done } = await open(import.meta.url, { size: [1280, 720] });
await sleep(6000);
const svg = fs.readFileSync(path.join(root, 'icons/icon.svg'), 'utf8');
const png = async (file, size, pad = 0, bleed = false) => {
  await send('Emulation.setDeviceMetricsOverride', { width: size, height: size, deviceScaleFactor: 1, mobile: false });
  await ev(`document.body.innerHTML = ''; document.body.style.cssText = 'margin:0;background:${bleed ? '#0f100f' : 'transparent'}'; const d = document.createElement('div'); d.style.cssText = 'width:${size}px;height:${size}px;display:grid;place-items:center'; d.innerHTML = ${JSON.stringify(svg)}; const s = d.firstElementChild; s.setAttribute('width', ${size - pad * 2}); s.setAttribute('height', ${size - pad * 2}); document.body.appendChild(d);`);
  await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  await sleep(300);
  const r = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: size, height: size, scale: 1 } });
  fs.writeFileSync(path.join(root, file), Buffer.from(r.result.data, 'base64'));
};
// cover: aiming down an EOTech across the market at two OPFOR soldiers by the stalls
await ev(`document.getElementById('warnOk').click(); const q = document.getElementById('sQual'); q.value = 'ultra'; q.dispatchEvent(new Event('input')); __s.hostMatch(__s.newMatchCfg({ mode: 'tdm', map: 'hadra', bots: 6, pub: false }), true)`); await sleep(2500);
await ev(`const me = __s.G.me; me.money = 20000; __s.buy(me, 'hk416'); __s.buy(me, 'optic_holo', 'hk416'); __s.buy(me, 'grip_vert', 'hk416'); __s.buy(me, 'las_peq', 'hk416'); __s.buy(me, 'iii'); __s.deploy();`); await sleep(1500);
await ev(`__s.tp(-21, 1.5, -Math.PI / 2 - 0.12, -0.03);
  const L = [...__s.G.ents.values()].filter((e) => e.bot);
  const spots = [[-7, 3.8, 1.3, 1], [-3, 0.2, 1.7, 0], [2.5, 2.5, 1.4, 0], [-10, -3, 1.9, 0]];
  L.forEach((b, i) => { if (!b.alive) __s.spawnEnt(b); b.frozen = true; const s = spots[i % spots.length]; b.pos.set(s[0], 0, s[1] + (i >= 4 ? 30 : 0)); b.yaw = s[2]; b.stance = s[3]; });
  document.getElementById('hud').hidden = true;`);
await sleep(1200);
await ev(`const me = __s.G.me; me.yaw = -Math.PI / 2 - 0.12; me.pitch = -0.02; __s.input.rmb = true;`);
await sleep(2500);
const c = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(root, 'cover.png'), Buffer.from(c.result.data, 'base64'));
await send('Page.navigate', { url: 'about:blank' }); await sleep(800);
await png('icons/icon-512.png', 512); await png('icons/icon-192.png', 192); await png('icons/apple-touch-icon.png', 180, 0, true); await png('icons/maskable-512.png', 512, 60, true);
srv.kill(); await done();

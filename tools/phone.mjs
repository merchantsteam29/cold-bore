// A phone (844×390, touch): tap through the menus, deploy, walk with the stick, look by dragging, fire, buy.
import { open, sleep } from './harness.mjs';
import { spawn } from 'child_process';
import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 8700 + Math.floor(Math.random() * 200);
const srv = spawn(process.execPath, ['serve.js'], { cwd: root, env: { ...process.env, PORT: port }, stdio: 'ignore' });
process.env.SH_URL = `http://localhost:${port}/`;
await sleep(600);
const { ev, shot, check, done, touch, tapEl, tapAt } = await open(import.meta.url, { mobile: true });
await sleep(7000);
await tapEl('#warnOk'); await sleep(1200);
await shot('1-title');
check(await ev(`return __s.input.touchMode`), 'touch mode on a phone');
await tapEl('#bOffline'); await sleep(3500);
check(await ev(`return __s.state`) === 'play', 'in a match');
await shot('2-deploy');
await tapEl('#dDeploy'); await sleep(2000);
check(await ev(`return __s.G.me.alive`), 'deployed by tapping');
const vis = await ev(`return getComputedStyle(document.getElementById('touch')).display`);
check(vis === 'block', 'touch controls showing (' + vis + ')');
await shot('3-controls');
// walk: put a thumb down on the left and push up
const p0 = await ev(`return [__s.G.me.pos.x, __s.G.me.pos.z]`);
await touch('touchStart', [[160, 260]]); await sleep(100);
for (let i = 1; i <= 6; i++) { await touch('touchMove', [[160, 260 - i * 10]]); await sleep(60); }
await sleep(2500);
const p1 = await ev(`return [__s.G.me.pos.x, __s.G.me.pos.z]`);
await touch('touchEnd', []);
const moved = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
console.log('walked', moved.toFixed(2), 'm');
check(moved > 0.8, 'the stick walks');
// look: drag on the right half
const y0 = await ev(`return __s.G.me.yaw`);
await touch('touchStart', [[560, 200]]); for (let i = 1; i <= 6; i++) { await touch('touchMove', [[560 - i * 15, 200]]); await sleep(50); } await touch('touchEnd', []);
await sleep(600);
const y1 = await ev(`return __s.G.me.yaw`);
console.log('turned', (y1 - y0).toFixed(3), 'rad');
check(Math.abs(y1 - y0) > 0.05, 'dragging turns the view');
// fire
const a0 = await ev(`const me = __s.G.me; return me.ammo[me.ws.id].mag`);
const fire = await ev(`const b = document.querySelector('[data-t=fire]').getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]`);
await touch('touchStart', [fire]); await sleep(900); await touch('touchEnd', []); await sleep(500);
const a1 = await ev(`const me = __s.G.me; return me.ammo[me.ws.id].mag`);
console.log('ammo', a0, '->', a1);
check(a1 < a0, 'the fire button shoots');
await shot('4-fired');
// buy
await tapEl('[data-t=buy]'); await sleep(1200);
check(!(await ev(`return document.getElementById('buy').hidden`)), 'the buy button opens the buy menu');
await shot('5-buy');
await tapEl('#buyClose'); await sleep(800);
void tapAt;
srv.kill(); await done();

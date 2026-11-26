// Screenshots for judging the picture: both maps at a quality level (Q=low|medium|high|ultra), first person and a
// third-person look at soldiers. Shots go to tools/shots/look-<Q>/.
import { open, sleep } from './harness.mjs';
import { spawn } from 'child_process';
import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 8700 + Math.floor(Math.random() * 200);
const srv = spawn(process.execPath, ['serve.js'], { cwd: root, env: { ...process.env, PORT: port }, stdio: 'ignore' });
process.env.SH_URL = `http://localhost:${port}/`;
const Q = process.env.Q || 'high';
await sleep(600);
const { ev, shot, done } = await open(import.meta.url, { tag: '-' + Q });
await sleep(6000);
await ev(`document.getElementById('warnOk').click(); __s.set.quality = '${Q}'; document.getElementById('sQual').value = '${Q}'; document.getElementById('sQual').dispatchEvent(new Event('input'));`);
await sleep(2500); await shot('0-title');
const spots = { hadra: [[-21, 1.5, -Math.PI / 2 - 0.12], [-40, -30, -0.6]], kessel: [[0, 14, Math.PI], [-46, 4, -Math.PI / 2]] };
for (const map of ['hadra', 'kessel']) {
  await ev(`__s.hostMatch(__s.newMatchCfg({ mode: 'tdm', map: '${map}', bots: 6, pub: false }), true)`); await sleep(2500);
  await ev(`const me = __s.G.me; me.money = 30000; __s.buy(me, 'hk416'); __s.buy(me, 'optic_holo', 'hk416'); __s.buy(me, 'grip_vert', 'hk416'); __s.buy(me, 'las_light', 'hk416'); __s.buy(me, 'iii'); __s.deploy();`); await sleep(1500);
  let i = 0;
  for (const [x, z, yaw] of spots[map]) {
    await ev(`__s.tp(${x}, ${z}, ${yaw}, -0.02);
      const L = [...__s.G.ents.values()].filter((e) => e.bot); const me = __s.G.me;
      L.forEach((b, k) => { if (!b.alive) __s.spawnEnt(b); b.frozen = true; const d = 6 + k * 3.5, s = (k % 2 ? 1 : -1) * (1 + k * 0.6); b.pos.set(me.pos.x - Math.sin(me.yaw) * d + Math.cos(me.yaw) * s, 0, me.pos.z - Math.cos(me.yaw) * d - Math.sin(me.yaw) * s); b.yaw = me.yaw + Math.PI + (k - 2) * 0.4; b.stance = k === 1 ? 1 : 0; });`);
    await sleep(2500); await shot(`${map}-${i}-fp`);
    if (i === 0) { await ev(`__s.input.rmb = true`); await sleep(1200); await shot(`${map}-${i}-ads`); await ev(`__s.input.rmb = false`); }
    i++;
  }
  // a close third-person look at a soldier, in the open
  const open = map === 'hadra' ? [-25, 4] : [0, 22];
  await ev(`const b = [...__s.G.ents.values()].find((e) => e.bot && e.alive); const me = __s.G.me; me.alive = false; __s.G.deathCam = null; b.pos.set(${open[0]}, 0, ${open[1]}); b.yaw = 2.6; b.stance = 0; window.__tp = b;`);
  await sleep(600);
  await ev(`const b = window.__tp, c = __s.camera; c.position.set(b.pos.x - 1.3, 1.6, b.pos.z - 1.6); c.lookAt(b.pos.x, 1.15, b.pos.z);`);
  await sleep(1500); await shot(`${map}-soldier`);
  await ev(`const c = __s.camera; c.position.set(-32, 9, -26); c.lookAt(-8, 0, 0);`); await sleep(1200); await shot(`${map}-street`);
  await ev(`__s.leaveMatch()`); await sleep(1500);
}
console.log('fps sample', await ev(`let n = 0; const t0 = performance.now(); await new Promise((r) => { const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); return (n / 2).toFixed(1);`));
srv.kill(); await done();

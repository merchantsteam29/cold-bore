// CPU cost of one game step (no rendering) and of each part, with a full match of fighting bots.
import { open, sleep } from './harness.mjs';
import { spawn } from 'child_process';
import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 8700 + Math.floor(Math.random() * 200);
const srv = spawn(process.execPath, ['serve.js'], { cwd: root, env: { ...process.env, PORT: port }, stdio: 'ignore' });
process.env.SH_URL = `http://localhost:${port}/`;
await sleep(600);
const { ev, done } = await open(import.meta.url);
await sleep(6000);
await ev(`document.getElementById('warnOk').click(); __s.hostMatch(__s.newMatchCfg({ mode: 'tdm', map: '${process.env.MAP || 'hadra'}', bots: 12, pub: false }), true)`); await sleep(2500);
await ev(`__s.deploy(); for (const e of __s.G.ents.values()) if (e.bot && !e.alive) __s.spawnEnt(e); for (let k = 0; k < 200; k++) __s.step(0.033, false);`);
console.log(await ev(`
  const N = 300, t0 = performance.now(); let worst = 0, over16 = 0, over33 = 0;
  for (let k = 0; k < N; k++) { const a = performance.now(); __s.step(0.033, false); const d = performance.now() - a; worst = Math.max(worst, d); if (d > 16) over16++; if (d > 33) over33++; }
  const per = (performance.now() - t0) / N;
  // the pieces
  const time = (f, n = 200) => { const a = performance.now(); for (let i = 0; i < n; i++) f(); return ((performance.now() - a) / n).toFixed(3); };
  const L = [...__s.G.ents.values()];
  const poseAll = time(() => { for (const e of L) if (e.body && e.alive) e.body.pose({ pos: e.pos, yaw: e.yaw, pitch: e.pitch, stance: e.stance, lean: 0, speed: e.speed, phase: e.phase, hold: 'gun', vel: e.vel }); });
  const bots = time(() => __s.updateBots(0.033), 100);
  return JSON.stringify({ over16, over33, spikes: window.__spikes, stepMs: per.toFixed(2), worstMs: worst.toFixed(1), poseAllMs: poseAll, botsMs: bots, kills: L.reduce((s, e) => s + e.kills, 0) });`));
srv.kill(); await done();

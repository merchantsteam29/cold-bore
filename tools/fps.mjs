// Frames per second in a match (deployed, 10 players) at a quality level, both maps. Software rendering, so
// the numbers are only good for comparing versions/settings with each other.
import { open, sleep } from './harness.mjs';
import { spawn } from 'child_process';
import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 8700 + Math.floor(Math.random() * 200);
const srv = spawn(process.execPath, ['serve.js'], { cwd: root, env: { ...process.env, PORT: port }, stdio: 'ignore' });
process.env.SH_URL = `http://localhost:${port}/`;
const Q = process.env.Q || 'low';
await sleep(600);
const { ev, done } = await open(import.meta.url);
await sleep(6000);
await ev(`document.getElementById('warnOk').click(); const q = document.getElementById('sQual'); q.value = '${Q}'; q.dispatchEvent(new Event('input'));`);
for (const map of ['hadra', 'kessel']) {
  await ev(`__s.hostMatch(__s.newMatchCfg({ mode: 'tdm', map: '${map}', bots: 10, pub: false }), true)`); await sleep(2500);
  await ev(`__s.deploy(); for (const e of __s.G.ents.values()) if (e.bot && !e.alive) __s.spawnEnt(e); __s.tp(0, ${map === 'hadra' ? -30 : 30}, ${map === 'hadra' ? Math.PI : 0}, 0)`); await sleep(3000);
  console.log(map, Q, await ev(`let n = 0; const t0 = performance.now(); await new Promise((r) => { const f = () => { n++; if (performance.now() - t0 < 4000) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); return (n / 4).toFixed(1) + ' fps';`));
  await ev(`__s.leaveMatch()`); await sleep(1500);
}
srv.kill(); await done();

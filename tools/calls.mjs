// Draw calls and triangles per frame in a full match (10 players) on each map.
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
await ev(`document.getElementById('warnOk').click(); const q = document.getElementById('sQual'); q.value = '${process.env.Q || 'low'}'; q.dispatchEvent(new Event('input'));`); // Q_SET
for (let i = 0; i < 60 && !(await ev(`const M = await import('./js/models.js'); return M.ready.size >= 20;`)); i++) await sleep(500);
for (const map of ['hadra', 'kessel']) {
  await ev(`__s.hostMatch(__s.newMatchCfg({ mode: 'tdm', map: '${map}', bots: 10, pub: false }), true)`); await sleep(2500);
  await ev(`__s.deploy(); for (const e of __s.G.ents.values()) if (e.bot && !e.alive) __s.spawnEnt(e);`); await sleep(2000);
  await ev(`__s.tp(0, ${map === 'hadra' ? -30 : 30}, ${map === 'hadra' ? Math.PI : 0}, 0)`); await sleep(1500);
  console.log(map, await ev(`const r = __s.renderer; r.info.autoReset = false; r.info.reset(); await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))); const i = r.info.render; const out = { calls: i.calls, tris: i.triangles }; r.info.reset(); r.info.autoReset = true; return JSON.stringify(out);`));
  await ev(`__s.leaveMatch()`); await sleep(1500);
}
srv.kill(); await done();

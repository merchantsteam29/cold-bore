// How long building each map takes (first time, textures included)
import { open, sleep } from './harness.mjs';
import { spawn } from 'child_process';
import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 8700 + Math.floor(Math.random() * 200);
const srv = spawn(process.execPath, ['serve.js'], { cwd: root, env: { ...process.env, PORT: port }, stdio: 'ignore' });
process.env.SH_URL = `http://localhost:${port}/`;
await sleep(600);
const { ev, done } = await open(import.meta.url);
await sleep(7000);
console.log('menu map', await ev(`return __s.G.cfg.map`));
for (const map of ['hadra', 'kessel']) {
  const t = await ev(`const t0 = performance.now(); __s.hostMatch(__s.newMatchCfg({ map: '${map}', mode: 'dom', bots: 10, pub: false }), true); await new Promise((r) => setTimeout(r, 50)); return performance.now() - t0;`);
  console.log(map, 'build ms', Math.round(t));
  await sleep(4000);
  const fps = await ev(`let n = 0; const t0 = performance.now(); await new Promise((r) => { const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); return (n / 3).toFixed(1);`);
  console.log(map, 'fps (swiftshader, deploy screen)', fps);
  await ev(`__s.leaveMatch()`); await sleep(1500);
}
srv.kill(); await done();

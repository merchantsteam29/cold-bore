// Bots only (you stay on the deploy screen): over a minute they should find each other and fight.
import { open, sleep } from './harness.mjs';
import { spawn } from 'child_process';
import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 8700 + Math.floor(Math.random() * 200);
const srv = spawn(process.execPath, ['serve.js'], { cwd: root, env: { ...process.env, PORT: port }, stdio: 'ignore' });
process.env.SH_URL = `http://localhost:${port}/`;
await sleep(600);
const { ev, shot, check, done } = await open(import.meta.url);
await sleep(6000);
const map = process.env.MAP || 'hadra', mode = process.env.MODE || 'dom';
await ev(`document.getElementById('warnOk').click(); __s.hostMatch(__s.newMatchCfg({ mode: '${mode}', map: '${map}', bots: 10, pub: false }), true)`); await sleep(2000);
for (let i = 0; i < 8; i++) {
  await ev(`for (let k = 0; k < 160; k++) __s.step(0.05, false);`); // 8 s of game time
  console.log(await ev(`const L = [...__s.G.ents.values()].filter((e) => e.bot); return 't=' + (${(i + 1) * 8}) + ' kills ' + L.reduce((s, e) => s + e.kills, 0) + ' alive ' + L.filter((e) => e.alive).length + ' scores ' + __s.G.scores + ' flags ' + __s.G.flags.map((f) => f.owner).join(',') + ' guns ' + L.map((e) => e.loadout.primary || '-').join(',')`));
}
const k = await ev(`return [...__s.G.ents.values()].reduce((s, e) => s + e.kills, 0)`);
check(k >= 2, 'bots killed each other (' + k + ')');
// watch from above
await ev(`const c = __s.camera; c.position.set(0, 60, 40); c.lookAt(0, 0, 0);`); await shot('overview');
srv.kill(); await done();

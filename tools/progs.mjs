// Which shader programs get compiled during a fight (after the match's warm-up)? They are the stutters.
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
await ev(`document.getElementById('warnOk').click(); __s.hostMatch(__s.newMatchCfg({ mode: 'tdm', map: 'hadra', bots: 10, pub: false }), true)`); await sleep(3000);
await ev(`window.__p0 = new Set(__s.renderer.info.programs.map((p) => p.cacheKey));`);
await ev(`__s.deploy(); for (const e of __s.G.ents.values()) if (e.bot && !e.alive) __s.spawnEnt(e);`);
for (let i = 0; i < 6; i++) { await ev(`for (let k = 0; k < 150; k++) __s.step(0.033, false);`); await sleep(2500); }
console.log(await ev(`const out = []; for (const p of __s.renderer.info.programs) if (!window.__p0.has(p.cacheKey)) out.push(p.name + ' :: ' + p.cacheKey.split(',').filter((s, i) => i < 3 || /true/.test(s)).slice(0, 40).join(',')); return out.length + ' new programs || ' + out.join(' || ');`));
srv.kill(); await done();

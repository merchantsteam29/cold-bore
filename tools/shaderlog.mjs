// When do shader programs get checked/compiled? Counts calls to getProgramInfoLog before and during a fight.
import { open, sleep } from './harness.mjs';
import { spawn } from 'child_process';
import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 8700 + Math.floor(Math.random() * 200);
const srv = spawn(process.execPath, ['serve.js'], { cwd: root, env: { ...process.env, PORT: port }, stdio: 'ignore' });
process.env.SH_URL = `http://localhost:${port}/`;
await sleep(600);
const { ev, done } = await open(import.meta.url);
await sleep(5000);
await ev(`const gl = __s.renderer.getContext(); window.__pl = []; const o = gl.getProgramInfoLog.bind(gl); gl.getProgramInfoLog = (p) => { const t = performance.now(); const r = o(p); const info = __s.renderer.info.programs.find((x) => x.program === p); window.__pl.push([+(t / 1000).toFixed(1), +(performance.now() - t).toFixed(0), window.__phase || 'boot', info ? info.name + ' ' + info.cacheKey.slice(0, 160) : '?']); return r; };`);
await ev(`document.getElementById('warnOk').click(); window.__phase = 'load'; __s.hostMatch(__s.newMatchCfg({ mode: 'tdm', map: 'hadra', bots: 10, pub: false }), true)`); await sleep(4000);
await ev(`window.__phase = 'deploy'; __s.deploy(); for (const e of __s.G.ents.values()) if (e.bot && !e.alive) __s.spawnEnt(e);`); await sleep(3000);
await ev(`window.__phase = 'fight';`);
for (let i = 0; i < 5; i++) { await ev(`for (let k = 0; k < 150; k++) __s.step(0.033, false);`); await sleep(2500); }
console.log(await ev(`const by = {}; for (const [t, ms, ph] of window.__pl) { by[ph] = by[ph] || { n: 0, ms: 0 }; by[ph].n++; by[ph].ms += ms; } return JSON.stringify(by) + ' FIGHT: ' + JSON.stringify(window.__pl.filter((x) => x[2] === 'fight' || x[2] === 'deploy'));`));
srv.kill(); await done();

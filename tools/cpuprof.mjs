// CPU profile of a snippet (CDP Profiler): top functions by self time. CODE env = the JS to profile.
import { open, sleep } from './harness.mjs';
import { spawn } from 'child_process';
import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 8700 + Math.floor(Math.random() * 200);
const srv = spawn(process.execPath, ['serve.js'], { cwd: root, env: { ...process.env, PORT: port }, stdio: 'ignore' });
process.env.SH_URL = `http://localhost:${port}/`;
await sleep(600);
const { ev, send, done } = await open(import.meta.url);
await sleep(6000);
await ev(`document.getElementById('warnOk').click(); __s.hostMatch(__s.newMatchCfg({ mode: 'tdm', map: 'hadra', bots: 6, pub: false }), true)`); await sleep(2500);
await ev(`window.Gn = await import('./js/guns.js'); window.Sd = await import('./js/soldier.js');`);
await send('Profiler.enable'); await send('Profiler.setSamplingInterval', { interval: 200 }); await send('Profiler.start');
await ev(process.env.CODE || `for (let i = 0; i < 10; i++) Gn.makeGun('hk416', { att: ['optic_holo', 'grip_vert'] });`);
const r = await send('Profiler.stop');
const P = r.result.profile, self = new Map(), dt = P.timeDeltas, byId = new Map(P.nodes.map((n) => [n.id, n]));
const counts = new Map(); P.samples.forEach((id, i) => counts.set(id, (counts.get(id) || 0) + (dt[i] || 0)));
for (const [id, us] of counts) { const n = byId.get(id), k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + us); }
console.log([...self].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, us]) => (us / 1000).toFixed(1).padStart(8) + ' ms  ' + k).join('\n'));
// call chains of the hottest function
const parent = new Map(); for (const n of P.nodes) for (const c of n.children || []) parent.set(c, n.id);
const ranked = [...counts].sort((a, b) => b[1] - a[1]); const hot = (process.env.HOT && ranked.find(([id]) => byId.get(id).callFrame.functionName === process.env.HOT)?.[0]) || ranked[0][0]; let chain = [], id = hot; while (id && chain.length < 12) { const n = byId.get(id); chain.push((n.callFrame.functionName || '(anon)') + ' ' + n.callFrame.url.split('/').pop() + ':' + (n.callFrame.lineNumber + 1)); id = parent.get(id); }
console.log('chain:\n  ' + chain.join('\n  '));
srv.kill(); await done();

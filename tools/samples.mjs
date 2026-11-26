// The recorded-sound loader: whatever sounds/sounds.json lists gets decoded, missing keys borrow a neighbour.
import { open, sleep } from './harness.mjs';
import { spawn } from 'child_process';
import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 8700 + Math.floor(Math.random() * 200);
const srv = spawn(process.execPath, ['serve.js'], { cwd: root, env: { ...process.env, PORT: port }, stdio: 'ignore' });
process.env.SH_URL = `http://localhost:${port}/`;
await sleep(600);
const { ev, check, done } = await open(import.meta.url);
await sleep(5000);
const r = await ev(`const A = await import('./js/audio.js'); A.initAudio(); await A.loadSamples(); const out = {}; for (const k of ['rifle', 'battle', 'fifty', 'pistol', 'mag_in', 'shell_load', 'explosion']) out[k] = A.hasSample(k); A.gunshot('7.62x51', null, false, true); A.gunshot('9mm'); A.mech('shell'); A.boom(null); return out;`);
console.log(JSON.stringify(r));
const want = JSON.parse(process.env.WANT || 'null');
if (want) for (const [k, v] of Object.entries(want)) check(r[k] === v, k + ' should be ' + v);
srv.kill(); await done();

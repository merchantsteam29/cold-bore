// Saves a generated texture as a PNG (debugging): node tools/tex-dump.mjs sand
import { open, sleep } from './harness.mjs';
import { spawn } from 'child_process';
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 8700 + Math.floor(Math.random() * 200);
const srv = spawn(process.execPath, ['serve.js'], { cwd: root, env: { ...process.env, PORT: port }, stdio: 'ignore' });
process.env.SH_URL = `http://localhost:${port}/`;
await sleep(600);
const { ev, done, outDir } = await open(import.meta.url);
await sleep(5000);
const name = process.argv[2] || 'sand';
const url = await ev(`const TX = await import('./js/tex.js'); const t = TX.${name}(); return (t.map || t).image.toDataURL();`);
fs.writeFileSync(path.join(outDir, name + '.png'), Buffer.from(url.split(',')[1], 'base64'));
srv.kill(); await done();

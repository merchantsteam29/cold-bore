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
console.log(await ev(`const M = await import('./js/models.js'), Gn = await import('./js/guns.js'), THREE = await import('three');
  await M.loadModels(['bolt_action_rifle_7_62', 'service_pistol']); Gn.resetGunCache();
  const out = {};
  for (const id of ['r700', 'p38']) { const g = Gn.makeGun(id); g.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(g); const i = g.userData.info;
    out[id] = { model: i.model, min: b.min.toArray().map((v) => +v.toFixed(3)), max: b.max.toArray().map((v) => +v.toFixed(3)), muzzle: i.muzzle.toArray().map((v) => +v.toFixed(3)), sightY: +i.sightY.toFixed(3), left: i.left.toArray().map((v) => +v.toFixed(3)), parts: M.parts(${'"bolt_action_rifle_7_62"'}).length }; }
  return JSON.stringify(out);`));
srv.kill(); await done();

// Packs downloaded Poly Haven glTF models (tools/fetch-models.mjs) into assets/models/<id>/: textures re-encoded as
// WebP (resized: 1024 px for guns and melee, 512 for props) and the .gltf rewritten to point at them.
// usage: node tools/pack-models.mjs <download dir>
import { open, sleep } from './harness.mjs';
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2], outRoot = path.join(root, 'assets', 'models');
const SKIP = new Set(['modular_electricity_poles', 'flood_lights', 'namaqualand_boulder_02']); // too heavy for a browser game
const BIG = new Set(['service_pistol', 'bolt_action_rifle_7_62', 'machete', 'hatchet']);       // seen up close
process.env.SH_URL = 'about:blank#';
const { ev, done } = await open(import.meta.url);
await sleep(1500);
let total = 0;
for (const id of fs.readdirSync(src)) {
  if (SKIP.has(id)) continue;
  const dir = path.join(src, id), gltfName = fs.readdirSync(dir).find((f) => f.endsWith('.gltf')); if (!gltfName) continue;
  const gltf = JSON.parse(fs.readFileSync(path.join(dir, gltfName), 'utf8')), out = path.join(outRoot, id);
  fs.mkdirSync(out, { recursive: true });
  const max = BIG.has(id) ? 1024 : 512;
  for (const img of gltf.images || []) {
    const file = path.join(dir, decodeURIComponent(img.uri)), ext = path.extname(file).toLowerCase();
    const isNormal = /nor/i.test(img.uri), q = isNormal ? 0.9 : 0.8;
    const b64 = fs.readFileSync(file).toString('base64'), mime = ext === '.png' ? 'image/png' : 'image/jpeg';
    const url = await ev(`const img = new Image(); img.src = 'data:${mime};base64,${b64}'; await img.decode(); const k = Math.min(1, ${max} / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c.toDataURL('image/webp', ${q});`);
    const name = path.basename(img.uri, path.extname(img.uri)) + '.webp';
    const buf = Buffer.from(url.split(',')[1], 'base64'); fs.writeFileSync(path.join(out, name), buf); total += buf.length;
    img.uri = name; delete img.mimeType;
  }
  for (const b of gltf.buffers || []) { const f = path.join(dir, decodeURIComponent(b.uri)); const name = path.basename(f); fs.copyFileSync(f, path.join(out, name)); b.uri = name; total += fs.statSync(f).size; }
  fs.writeFileSync(path.join(out, id + '.gltf'), JSON.stringify(gltf));
}
console.log('packed', (total / 1048576).toFixed(1), 'MB into assets/models');
await done();

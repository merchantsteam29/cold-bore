// Simplifies the prop models in assets/models to a triangle budget (three.js SimplifyModifier, run in headless
// Chrome), then rewrites each model's .bin and accessors. Materials and textures stay as they are.
// Guns and melee weapons are left at full detail (one in your hands at a time). Run after tools/pack-models.mjs.
import { open, sleep } from './harness.mjs';
import { spawn } from 'child_process';
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 8700 + Math.floor(Math.random() * 200);
const srv = spawn(process.execPath, ['serve.js'], { cwd: root, env: { ...process.env, PORT: port }, stdio: 'ignore' });
process.env.SH_URL = `http://localhost:${port}/`;
const KEEP = new Set(['service_pistol', 'bolt_action_rifle_7_62', 'machete', 'hatchet']);
const BUDGET = { concrete_road_barrier: 2500, covered_car: 4000, metal_trash_can: 3000, portable_generator: 3000, exterior_aircon_unit: 3000, shrub_02: 4000 };
await sleep(600);
const { ev, done } = await open(import.meta.url);
await sleep(5000);
await ev(`window.THREE = await import('three'); const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js'); window.SM = (await import('three/addons/modifiers/SimplifyModifier.js')).SimplifyModifier; window.BU = await import('three/addons/utils/BufferGeometryUtils.js'); window.L = new GLTFLoader();
  window.b64 = (ta) => { const u = new Uint8Array(ta.buffer, ta.byteOffset, ta.byteLength); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };`);
for (const id of fs.readdirSync(path.join(root, 'assets/models'))) {
  if (KEEP.has(id)) continue;
  const budget = BUDGET[id] || 2000;
  const res = await ev(`const g = await L.loadAsync('assets/models/${id}/${id}.gltf'); const list = [];
    let total = 0; g.scene.traverse((o) => { if (o.isMesh) total += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
    const ratio = Math.min(1, ${budget} / total);
    g.scene.traverse((o) => {
      if (!o.isMesh) return; const a = g.parser.associations.get(o); if (!a) return;
      let geo = o.geometry.clone(); for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
      if (ratio < 1) { const merged = BU.mergeVertices(geo), n = merged.attributes.position.count; geo = new SM().modify(geo, Math.floor(n * (1 - ratio))); }
      if (!geo.index) geo = BU.mergeVertices(geo);
      const pos = geo.attributes.position.array, nor = geo.attributes.normal?.array, uv = geo.attributes.uv?.array, idx = Uint32Array.from(geo.index.array);
      list.push({ mesh: a.meshes, prim: a.primitives, pos: b64(new Float32Array(pos)), nor: nor ? b64(new Float32Array(nor)) : null, uv: uv ? b64(new Float32Array(uv)) : null, idx: b64(idx), n: pos.length / 3, tris: idx.length / 3 });
    });
    return JSON.stringify({ total: Math.round(total), list });`);
  const { total, list } = JSON.parse(res);
  const gltfPath = path.join(root, 'assets/models', id, id + '.gltf'), gltf = JSON.parse(fs.readFileSync(gltfPath, 'utf8'));
  // a fresh buffer with just the simplified primitives
  const chunks = []; let off = 0; gltf.bufferViews = []; gltf.accessors = [];
  const view = (buf, target) => { const pad = (4 - (off % 4)) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); off += pad; } chunks.push(buf); gltf.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: buf.length, target }); off += buf.length; return gltf.bufferViews.length - 1; };
  const acc = (o) => { gltf.accessors.push(o); return gltf.accessors.length - 1; };
  let after = 0;
  for (const p of list) {
    const pos = Buffer.from(p.pos, 'base64'), f = new Float32Array(pos.buffer, pos.byteOffset, pos.length / 4);
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < f.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], f[i + k]); max[k] = Math.max(max[k], f[i + k]); }
    const attrs = { POSITION: acc({ bufferView: view(pos, 34962), componentType: 5126, count: p.n, type: 'VEC3', min, max }) };
    if (p.nor) attrs.NORMAL = acc({ bufferView: view(Buffer.from(p.nor, 'base64'), 34962), componentType: 5126, count: p.n, type: 'VEC3' });
    if (p.uv) attrs.TEXCOORD_0 = acc({ bufferView: view(Buffer.from(p.uv, 'base64'), 34962), componentType: 5126, count: p.n, type: 'VEC2' });
    const indices = acc({ bufferView: view(Buffer.from(p.idx, 'base64'), 34963), componentType: 5125, count: p.tris * 3, type: 'SCALAR' });
    const prim = gltf.meshes[p.mesh].primitives[p.prim]; prim.attributes = attrs; prim.indices = indices;
    after += p.tris;
  }
  const binName = id + '.bin'; for (const b of gltf.buffers) { const old = path.join(root, 'assets/models', id, b.uri); if (b.uri !== binName && fs.existsSync(old)) fs.unlinkSync(old); }
  const bin = Buffer.concat(chunks); fs.writeFileSync(path.join(root, 'assets/models', id, binName), bin);
  gltf.buffers = [{ uri: binName, byteLength: bin.length }];
  fs.writeFileSync(gltfPath, JSON.stringify(gltf));
  console.log(id.padEnd(26), String(total).padStart(6), '->', String(after).padStart(5), 'tris', (bin.length / 1024).toFixed(0) + ' KB');
}
srv.kill(); await done();

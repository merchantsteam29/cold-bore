// Packs .glb models (embedded textures) into assets/models/<id>/: <id>.gltf + <id>.bin (geometry only) + textures as
// WebP (max 1024 px), re-encoded in headless Chrome. Used for the CC0 "Guns & Explosives" pack (3dmodelscc0).
// usage: node tools/pack-glb.mjs <file.glb> <id> [<file.glb> <id> ...]
import { open, sleep } from './harness.mjs';
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
process.env.SH_URL = 'about:blank#';
const { ev, done } = await open(import.meta.url);
await sleep(1500);
for (let a = 0; a < args.length; a += 2) {
  const [file, id] = [args[a], args[a + 1]], buf = fs.readFileSync(file);
  // GLB: 12-byte header, then chunks (JSON, BIN)
  let off = 12, json = null, bin = null;
  while (off < buf.length) { const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4), data = buf.subarray(off + 8, off + 8 + len); if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8')); else if (type === 0x004e4942) bin = data; off += 8 + len; }
  const out = path.join(root, 'assets/models', id); fs.mkdirSync(out, { recursive: true });
  const imageViews = new Set();
  let texBytes = 0;
  for (const [i, img] of (json.images || []).entries()) {
    if (img.bufferView === undefined) continue;
    const v = json.bufferViews[img.bufferView]; imageViews.add(img.bufferView);
    const bytes = bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength), mime = img.mimeType || 'image/png';
    const isNormal = /nor/i.test(img.name || '') || (json.materials || []).some((m) => m.normalTexture && json.textures[m.normalTexture.index]?.source === i);
    const url = await ev(`const im = new Image(); im.src = 'data:${mime};base64,${bytes.toString('base64')}'; await im.decode(); const k = Math.min(1, 1024 / Math.max(im.width, im.height)); const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); return c.toDataURL('image/webp', ${isNormal ? 0.9 : 0.82});`);
    const name = `${id}_tex${i}.webp`, w = Buffer.from(url.split(',')[1], 'base64'); fs.writeFileSync(path.join(out, name), w); texBytes += w.length;
    delete img.bufferView; delete img.mimeType; img.uri = name;
  }
  // geometry only in the new .bin (image views shrink to a 4-byte stub; nothing references them any more)
  const parts = []; let pos = 0;
  for (const [i, v] of json.bufferViews.entries()) {
    const src = imageViews.has(i) ? Buffer.alloc(4) : bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
    const pad = (4 - (pos % 4)) % 4; if (pad) { parts.push(Buffer.alloc(pad)); pos += pad; }
    v.byteOffset = pos; v.byteLength = src.length; v.buffer = 0; parts.push(src); pos += src.length;
  }
  const nb = Buffer.concat(parts); fs.writeFileSync(path.join(out, id + '.bin'), nb);
  json.buffers = [{ uri: id + '.bin', byteLength: nb.length }];
  fs.writeFileSync(path.join(out, id + '.gltf'), JSON.stringify(json));
  console.log(id.padEnd(16), (buf.length / 1048576).toFixed(1), 'MB ->', ((nb.length + texBytes) / 1048576).toFixed(2), 'MB');
}
await done();

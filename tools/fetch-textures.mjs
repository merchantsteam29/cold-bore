// Downloads the photo-scanned textures from Poly Haven (CC0) at 1K: colour, normal (OpenGL) and ARM
// (ambient occlusion / roughness / metalness packed in R / G / B). Checks each file's MD5.
// usage: node tools/fetch-textures.mjs <download dir>      then: node tools/pack-textures.mjs <download dir>
import fs from 'fs'; import path from 'path'; import crypto from 'crypto';
export const TEXTURES = {
  sand: 'dense_sand', plaster: 'clay_plaster', plaster2: 'beige_wall_001', concrete: 'concrete_wall_008', block: 'concrete_block_wall',
  asphalt: 'asphalt_02', corr: 'corrugated_iron', corrRust: 'rusty_corrugated_iron', container: 'container_side', planks: 'weathered_planks',
  metal: 'metal_plate', floor: 'concrete_floor_02',
};
const MAPS = { Diffuse: 'diff', nor_gl: 'nor', arm: 'arm' };
const out = process.argv[2]; if (!out) { console.log('usage: node tools/fetch-textures.mjs <dir>'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });
for (const [key, id] of Object.entries(TEXTURES)) {
  const files = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json();
  for (const [ph, short] of Object.entries(MAPS)) {
    const f = files[ph]?.['1k']?.jpg; if (!f) { console.log('missing', id, ph); continue; }
    const dest = path.join(out, `${key}_${short}.jpg`);
    if (fs.existsSync(dest) && crypto.createHash('md5').update(fs.readFileSync(dest)).digest('hex') === f.md5) continue;
    const buf = Buffer.from(await (await fetch(f.url)).arrayBuffer());
    const md5 = crypto.createHash('md5').update(buf).digest('hex');
    if (md5 !== f.md5) { console.log('MD5 MISMATCH', id, ph); continue; }
    fs.writeFileSync(dest, buf); console.log(key.padEnd(10), short.padEnd(5), (buf.length / 1024).toFixed(0) + ' KB', id);
  }
}

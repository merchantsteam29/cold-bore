// Downloads 3D models from Poly Haven (CC0) as glTF at 1K (the .gltf, its .bin and textures), checking MD5s.
// usage: node tools/fetch-models.mjs <download dir> [--sizes]   (--sizes only lists what it would download)
import fs from 'fs'; import path from 'path'; import crypto from 'crypto';
export const MODELS = [
  // guns and melee
  'service_pistol', 'bolt_action_rifle_7_62', 'machete', 'hatchet',
  // props
  'Barrel_01', 'barrel_03', 'old_tyre', 'wooden_crate_01', 'wooden_military_crate', 'old_military_crate', 'metal_jerrycan', 'concrete_road_barrier',
  'exterior_aircon_unit', 'trashbag', 'shrub_02', 'namaqualand_boulder_02', 'cement_bag', 'ammo_box', 'plastic_crate_01', 'utility_box_01', 'propane_tank',
  'cardboard_box_01', 'metal_trash_can', 'covered_car', 'modular_electricity_poles', 'flood_lights', 'portable_generator',
];
const [out, flag] = process.argv.slice(2);
let total = 0;
for (const id of MODELS) {
  const files = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json();
  const g = files.gltf?.['1k']?.gltf; if (!g) { console.log('no gltf', id); continue; }
  const parts = [[path.basename(new URL(g.url).pathname), g], ...Object.entries(g.include || {})];
  const size = parts.reduce((s, [, f]) => s + (f.size || 0), 0); total += size;
  console.log(id.padEnd(28), (size / 1048576).toFixed(2) + ' MB');
  if (flag === '--sizes' || !out) continue;
  const dir = path.join(out, id);
  for (const [rel, f] of parts) {
    const dest = path.join(dir, rel); fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (fs.existsSync(dest) && crypto.createHash('md5').update(fs.readFileSync(dest)).digest('hex') === f.md5) continue;
    const buf = Buffer.from(await (await fetch(f.url)).arrayBuffer());
    if (f.md5 && crypto.createHash('md5').update(buf).digest('hex') !== f.md5) { console.log('  MD5 MISMATCH', rel); continue; }
    fs.writeFileSync(dest, buf);
  }
}
console.log('total', (total / 1048576).toFixed(1), 'MB');

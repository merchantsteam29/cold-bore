// Re-encodes the downloaded textures (tools/fetch-textures.mjs) as WebP into assets/tex/, using headless Chrome's encoder.
// usage: node tools/pack-textures.mjs <download dir>
import { open, sleep } from './harness.mjs';
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2], out = path.join(root, 'assets', 'tex');
fs.mkdirSync(out, { recursive: true });
process.env.SH_URL = 'about:blank#';
const { ev, done } = await open(import.meta.url);
await sleep(1500);
let total = 0;
for (const f of fs.readdirSync(src).filter((f) => f.endsWith('.jpg'))) {
  const q = f.includes('_nor') ? 0.9 : f.includes('_arm') ? 0.8 : 0.82;
  const b64 = fs.readFileSync(path.join(src, f)).toString('base64');
  const url = await ev(`const img = new Image(); img.src = 'data:image/jpeg;base64,${b64}'; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0); return c.toDataURL('image/webp', ${q});`);
  const buf = Buffer.from(url.split(',')[1], 'base64');
  fs.writeFileSync(path.join(out, f.replace('.jpg', '.webp')), buf); total += buf.length;
}
console.log('packed', (total / 1048576).toFixed(1), 'MB into assets/tex');
await done();

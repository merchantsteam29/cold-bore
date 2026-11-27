// Size, parts and orientation of every model in assets/models, plus side and top previews of the guns and melee
// weapons (tools/shots/model-info/). Used to fit the models into the game.
import { open, sleep } from './harness.mjs';
import { spawn } from 'child_process';
import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 8700 + Math.floor(Math.random() * 200);
const srv = spawn(process.execPath, ['serve.js'], { cwd: root, env: { ...process.env, PORT: port }, stdio: 'ignore' });
process.env.SH_URL = `http://localhost:${port}/`;
await sleep(600);
const { ev, shot, done } = await open(import.meta.url, { size: [900, 500] });
await sleep(5000);
const ids = (await import('fs')).readdirSync(path.join(root, 'assets/models'));
await ev(`document.body.innerHTML = ''; window.THREE = await import('three'); const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js'); window.loader = new GLTFLoader();
  const r = new THREE.WebGLRenderer({ antialias: true }); r.setSize(900, 500); document.body.appendChild(r.domElement); r.outputColorSpace = THREE.SRGBColorSpace; window.R = r;
  window.S = new THREE.Scene(); S.background = new THREE.Color(0x888888); S.add(new THREE.HemisphereLight(0xffffff, 0x444444, 3)); const d = new THREE.DirectionalLight(0xffffff, 2); d.position.set(1, 2, 3); S.add(d);`);
for (const id of ids) {
  const info = await ev(`const g = await loader.loadAsync('assets/models/${id}/${id}.gltf'); const o = g.scene; window.cur && S.remove(window.cur); window.cur = o; S.add(o);
    const b = new THREE.Box3().setFromObject(o), s = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
    let meshes = 0, tris = 0; const mats = new Set(); o.traverse((m) => { if (m.isMesh) { meshes++; mats.add(m.material.name); tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; } });
    return '${id}'.padEnd(26) + ' size ' + [s.x, s.y, s.z].map((v) => v.toFixed(3)).join(' x ') + '  center ' + [c.x, c.y, c.z].map((v) => v.toFixed(3)).join(',') + '  meshes ' + meshes + ' mats ' + mats.size + ' tris ' + Math.round(tris);`);
  console.log(info);
  if (process.env.ALL || /pistol|rifle|machete|hatchet/.test(id)) {
    for (const [name, pos] of (process.env.ALL ? [['persp', 'new THREE.Vector3(L * 0.9, L * 0.6, L * 1.1)']] : [['side', 'new THREE.Vector3(L * 1.6, 0, 0)'], ['top', 'new THREE.Vector3(0, L * 1.6, 0.001)'], ['front', 'new THREE.Vector3(0, 0, L * 1.6)']])) {
      await ev(`const b = new THREE.Box3().setFromObject(cur), c = b.getCenter(new THREE.Vector3()), L = b.getSize(new THREE.Vector3()).length(); const cam = new THREE.PerspectiveCamera(40, 900 / 500, 0.001, 100); cam.position.copy(c).add(${pos}); cam.lookAt(c); S.add(new THREE.AxesHelper(L * 0.4)); R.render(S, cam);`);
      await shot(`${id}-${name}`);
    }
  }
}
srv.kill(); await done();

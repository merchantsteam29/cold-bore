// Real 3D models (Poly Haven, CC0; assets/models/<id>/<id>.gltf, packed by tools/pack-models.mjs). Loaded in the
// background; until a model is in, the game draws its own stand-in. `parts(id, pick)` returns the model's meshes
// as plain { geometry, material } pairs with their transforms baked in, ready to clone, instance or merge.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader(), pending = new Map();
export const ready = new Map(); // id -> the loaded scene
export function loadModel(id) {
  if (!pending.has(id)) pending.set(id, loader.loadAsync(`assets/models/${id}/${id}.gltf`).then((g) => { ready.set(id, g.scene); return g.scene; }).catch((e) => { console.warn('model', id, e?.message); return null; }));
  return pending.get(id);
}
export function loadModels(ids) { return Promise.all(ids.map(loadModel)); }

// meshes of a loaded model whose node name passes `pick` (default: all), geometry in the model's own space
export function parts(id, pick = () => true) {
  const scene = ready.get(id); if (!scene) return null;
  scene.updateMatrixWorld(true);
  const out = [];
  scene.traverse((o) => {
    if (!o.isMesh) return;
    // the part's own name decides (the nearest named node: glTF meshes sometimes sit under a named node)
    let n = o; while (n && !n.name) n = n.parent;
    if (!n || !pick(n.name)) return;
    const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'tangent'].includes(k)) g.deleteAttribute(k);
    out.push({ geometry: g, material: o.material });
  });
  return out;
}
export function bounds(list) { const b = new THREE.Box3(); for (const p of list) { p.geometry.computeBoundingBox(); b.union(p.geometry.boundingBox); } return b; }

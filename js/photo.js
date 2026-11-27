// Photo-scanned surfaces (Poly Haven, CC0): colour, normal and ARM maps (ambient occlusion / roughness / metalness in
// R / G / B) at 1K, as WebP in assets/tex/. Loaded in the background at start (not on Low) and applied to the map's
// materials when they're ready (world.js applyPhotos). Credits: sounds/CREDITS.md and assets/CREDITS.md.
import * as THREE from 'three';

export const PHOTO_KEYS = ['sand', 'plaster', 'plaster2', 'concrete', 'block', 'asphalt', 'corr', 'corrRust', 'container', 'planks', 'metal', 'floor'];
let promise = null, loaded = null;
export function loadPhotos(renderer) {
  if (promise) return promise;
  const L = new THREE.TextureLoader(), aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  promise = Promise.all(PHOTO_KEYS.map(async (k) => {
    const [d, n, a] = await Promise.all(['diff', 'nor', 'arm'].map((s) => L.loadAsync(`assets/tex/${k}_${s}.webp`)));
    d.colorSpace = THREE.SRGBColorSpace;
    for (const t of [d, n, a]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; }
    return [k, { d, n, a }];
  })).then((e) => (loaded = Object.fromEntries(e))).catch((err) => { console.warn('photo textures unavailable', err?.message); return null; });
  return promise;
}
export const photos = () => loaded;

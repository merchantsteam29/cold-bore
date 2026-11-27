// The maps. Everything solid is an axis-aligned box: walls, roofs, containers, sandbags, steps. That makes
// collision, bullet ray casts (with penetration) and the bots' navigation grid cheap and exact, and the
// boxes are merged into a handful of meshes per material with real-world-scale UVs (textures tile per metre).
import * as THREE from 'three';
import * as TX from './tex.js';
import { buildProps } from './props.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// what each surface does to a bullet: res = how much penetration a metre of it eats
export const MATS = {
  plaster:  { res: 9, fx: 'stone', snd: 'stone' },
  concrete: { res: 14, fx: 'stone', snd: 'stone' },
  block:    { res: 11, fx: 'stone', snd: 'stone' },
  metal:    { res: 26, fx: 'metal', snd: 'metal' },  // corrugated sheet: thin, so still goes through
  container:{ res: 30, fx: 'metal', snd: 'metal' },
  wood:     { res: 4, fx: 'wood', snd: 'wood' },
  sand:     { res: 40, fx: 'dust', snd: 'dirt' },    // sandbags stop everything short of .50
  steel:    { res: 120, fx: 'metal', snd: 'metal' },
};

export function buildWorld(scene, mapId, quality = 'high') {
  const def = MAP_DEFS[mapId] || MAP_DEFS.hadra;
  const boxes = [];      // { min: Vector3, max: Vector3, mat, look }
  const insts = {};      // prop kind -> [{ x, y, z, rot, sc, color }]
  const decor = new THREE.Group(); scene.add(decor);
  const looks = new Map(); // look key -> { mat: THREE.Material, scale, pos: [], nor: [], uv: [], idx: [] }
  const look = (key, mkMat, scale = 2) => { if (!looks.has(key)) looks.set(key, { mat: mkMat(), scale, pos: [], nor: [], uv: [], idx: [] }); return key; };
  const std = (o, extra = {}) => new THREE.MeshStandardMaterial({ ...o, ...extra });

  const B = {
    houses: [],
    // a solid box (x0..x1, y0..y1, z0..z1); lookKey picks its appearance
    box(x0, y0, z0, x1, y1, z1, mat = 'plaster', lk = 'plaster0', solid = true) {
      const min = new THREE.Vector3(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)), max = new THREE.Vector3(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1));
      if (solid) boxes.push({ min, max, mat });
      addBoxGeo(looks.get(lk) || looks.get('plaster0'), min, max);
      return { min, max };
    },
    // a wall along x (dir 'x') or z ('z') with openings: [{ at (from start), w, y0, y1 }]
    wall(x, z, len, dir, h, th, openings = [], mat = 'plaster', lk = 'plaster0', y = 0) {
      const ops = [...openings].sort((a, b) => a.at - b.at);
      let cur = 0;
      const seg = (a, b, y0, y1) => {
        if (b - a < 0.01 || y1 - y0 < 0.01) return;
        if (dir === 'x') B.box(x + a, y + y0, z - th / 2, x + b, y + y1, z + th / 2, mat, lk);
        else B.box(x - th / 2, y + y0, z + a, x + th / 2, y + y1, z + b, mat, lk);
      };
      for (const o of ops) {
        seg(cur, o.at, 0, h);
        seg(o.at, o.at + o.w, 0, o.y0);           // sill (nothing for a door)
        seg(o.at, o.at + o.w, o.y1, h);            // lintel
        cur = o.at + o.w;
      }
      seg(cur, len, 0, h);
      // frames, sills, shutters and open doors on the small openings of houses
      if ((mat === 'plaster' || mat === 'block') && th <= 0.32) for (const o of ops) {
        if (o.w > 1.4) continue;
        const fb = (a0, a1, y0, y1, c0, c1, k) => { if (dir === 'x') B.box(x + a0, y + y0, z + c0, x + a1, y + y1, z + c1, 'wood', k, false); else B.box(x + c0, y + y0, z + a0, x + c1, y + y1, z + a1, 'wood', k, false); };
        const ft = 0.07, out = th / 2 + 0.03, side = (Math.round((x + z + o.at) * 7) % 2) ? 1 : -1;
        fb(o.at - ft, o.at, o.y0, o.y1 + ft, -out, out, 'trim'); fb(o.at + o.w, o.at + o.w + ft, o.y0, o.y1 + ft, -out, out, 'trim');
        fb(o.at - ft, o.at + o.w + ft, o.y1, o.y1 + ft, -out, out, 'trim');
        if (o.y0 > 0.1) {
          fb(o.at - 0.1, o.at + o.w + 0.1, o.y0 - 0.06, o.y0, -out - 0.05, out + 0.05, 'trim');                       // sill
          const sw = o.w / 2, c = side * (th / 2 + 0.035), c2 = c + side * 0.03;
          fb(o.at - ft - sw, o.at - ft, o.y0 + 0.02, o.y1 - 0.02, Math.min(c, c2), Math.max(c, c2), 'paint');          // shutters, open
          fb(o.at + o.w + ft, o.at + o.w + ft + sw, o.y0 + 0.02, o.y1 - 0.02, Math.min(c, c2), Math.max(c, c2), 'paint');
        } else if (o.at - o.w - ft > 0.05) {
          const c = side * (th / 2 + 0.03), c2 = c + side * 0.05;
          fb(o.at - ft - o.w, o.at - ft, 0.02, o.y1 - 0.03, Math.min(c, c2), Math.max(c, c2), 'paint');                // the door, swung open flat
        }
      }
    },
    // a house: four walls with doors/windows, a roof slab with a parapet, an optional second storey
    // doors: [[side, at]] sides 'n' (z0) 's' (z1) 'w' (x0) 'e' (x1); wins: same, windows at 1.0–2.0 m
    house(x0, z0, w, d, { h = 3.3, floors = 1, doors = [], wins = [], lk = 'plaster0', roofLk = 'concrete0', stairs = null, parapet = 0.9, th = 0.3, hole = null } = {}) {
      const x1 = x0 + w, z1 = z0 + d;
      for (let f = 0; f < floors; f++) {
        const y = f * h, ops = { n: [], s: [], w: [], e: [] };
        if (f === 0) for (const [side, at] of doors) ops[side].push({ at, w: 1.2, y0: 0, y1: 2.25 });
        for (const [side, at, fl = 0] of wins) if (fl === f) ops[side].push({ at, w: 1.1, y0: 1.0, y1: 2.0 });
        B.wall(x0, z0, w, 'x', h, th, ops.n, 'plaster', lk, y);
        B.wall(x0, z1, w, 'x', h, th, ops.s, 'plaster', lk, y);
        B.wall(x0, z0 + th / 2, d - th, 'z', h, th, ops.w, 'plaster', lk, y);
        B.wall(x1, z0 + th / 2, d - th, 'z', h, th, ops.e, 'plaster', lk, y);
        // the floor above (or the roof): a slab, with a hole for the stairs on inner floors
        const top = y + h, sl = 0.25;
        if (hole && f < floors - 1) {
          const [hx0, hz0, hx1, hz1] = hole;
          B.box(x0, top, z0, x1, top + sl, hz0, 'concrete', roofLk); B.box(x0, top, hz1, x1, top + sl, z1, 'concrete', roofLk);
          B.box(x0, top, hz0, hx0, top + sl, hz1, 'concrete', roofLk); B.box(hx1, top, hz0, x1, top + sl, hz1, 'concrete', roofLk);
        } else B.box(x0 - 0.05, top, z0 - 0.05, x1 + 0.05, top + sl, z1 + 0.05, 'concrete', roofLk);
        // the inside floor of each storey
        const fy = y + (f ? 0.25 : 0); B.box(x0 + th / 2, fy, z0 + th / 2, x1 - th / 2, fy + 0.04, z1 - th / 2, 'concrete', 'tile', false);
      }
      const top = floors * h + 0.25;
      if (parapet > 0) {
        // no parapet on the side the roof stairs come up
        const gap = stairs ? (stairs[0] >= x1 - 0.01 ? 'e' : stairs[0] <= x0 - 0.5 ? 'w' : '') : '';
        B.box(x0 - 0.05, top, z0 - 0.05, x1 + 0.05, top + parapet, z0 + 0.2, 'plaster', lk); B.box(x0 - 0.05, top, z1 - 0.2, x1 + 0.05, top + parapet, z1 + 0.05, 'plaster', lk);
        if (gap !== 'w') B.box(x0 - 0.05, top, z0 + 0.2, x0 + 0.2, top + parapet, z1 - 0.2, 'plaster', lk);
        if (gap !== 'e') B.box(x1 - 0.2, top, z0 + 0.2, x1 + 0.05, top + parapet, z1 - 0.2, 'plaster', lk);
      }
      if (stairs) B.stairs(...stairs);
      const info = { x0, z0, x1, z1, top, floors, h }; B.houses.push(info);
      return info;
    },
    // steps from (x, z) going in dir ('+x','-x','+z','-z'), up to height h, width wd
    stairs(x, z, dir, h, wd = 1.1, lk = 'concrete0', y0 = 0) {
      const n = Math.ceil((h - y0) / 0.24), rise = (h - y0) / n, run = 0.3;
      for (let i = 0; i < n; i++) {
        const a = i * run, b = (i + 1) * run, yt = y0 + (i + 1) * rise;
        if (dir === '+x') B.box(x + a, y0, z, x + b, yt, z + wd, 'concrete', lk);
        if (dir === '-x') B.box(x - b, y0, z, x - a, yt, z + wd, 'concrete', lk);
        if (dir === '+z') B.box(x, y0, z + a, x + wd, yt, z + b, 'concrete', lk);
        if (dir === '-z') B.box(x, y0, z - b, x + wd, yt, z - a, 'concrete', lk);
      }
    },
    sandbags(x0, z0, x1, z1, h = 1.05) { B.box(x0, 0, z0, x1, h, z1, 'sand', 'sandbag'); },
    // a shipping container (solid; doors closed), 6.1 or 12.2 m long, 2.44 wide, 2.6 tall
    container(x, z, rotX = true, len = 12.2, y = 0, col = 0) {
      const w = 2.44, h = 2.6, k = 'cont' + col;
      if (rotX) B.box(x - len / 2, y, z - w / 2, x + len / 2, y + h, z + w / 2, 'container', k);
      else B.box(x - w / 2, y, z - len / 2, x + w / 2, y + h, z + len / 2, 'container', k);
    },
    // an open-ended container you can walk through (a corridor)
    tunnel(x, z, rotX = true, len = 12.2, col = 0) {
      const w = 2.44, h = 2.6, t = 0.08, k = 'cont' + col;
      if (rotX) { B.box(x - len / 2, 0, z - w / 2, x + len / 2, h, z - w / 2 + t, 'container', k); B.box(x - len / 2, 0, z + w / 2 - t, x + len / 2, h, z + w / 2, 'container', k); B.box(x - len / 2, h - t, z - w / 2, x + len / 2, h, z + w / 2, 'container', k); }
      else { B.box(x - w / 2, 0, z - len / 2, x - w / 2 + t, h, z + len / 2, 'container', k); B.box(x + w / 2 - t, 0, z - len / 2, x + w / 2, h, z + len / 2, 'container', k); B.box(x - w / 2, h - t, z - len / 2, x + w / 2, h, z + len / 2, 'container', k); }
    },
    car(x, z, rot = 0, col = 0x6b6f72, burnt = false) { // a wrecked car: a solid body + a cabin, decor on top
      const c = Math.abs(Math.cos(rot)) > 0.7, L = 4.4, W = 1.8;
      const hx = c ? L / 2 : W / 2, hz = c ? W / 2 : L / 2;
      boxes.push({ min: new THREE.Vector3(x - hx, 0, z - hz), max: new THREE.Vector3(x + hx, 1.05, z + hz), mat: 'metal' });
      boxes.push({ min: new THREE.Vector3(x - hx * (c ? 0.5 : 0.9), 1.05, z - hz * (c ? 0.9 : 0.5)), max: new THREE.Vector3(x + hx * (c ? 0.35 : 0.9), 1.5, z + hz * (c ? 0.9 : 0.35)), mat: 'metal' });
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = c ? 0 : Math.PI / 2;
      const body = std({ color: burnt ? 0x2a2522 : col, roughness: burnt ? 0.95 : 0.45, metalness: burnt ? 0.2 : 0.6, map: burnt ? TX.metalPlate(0x2b2622, 4).map : null });
      const m = (geo, mat, px, py, pz) => { const o = new THREE.Mesh(geo, mat); o.position.set(px, py, pz); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
      m(new THREE.BoxGeometry(L, 0.62, W), body, 0, 0.62, 0);
      m(new THREE.BoxGeometry(L * 0.5, 0.48, W * 0.92), body, -0.25, 1.17, 0);
      const glass = std({ color: 0x1a2024, roughness: 0.1, metalness: 0.8, transparent: true, opacity: burnt ? 0 : 0.75 });
      m(new THREE.BoxGeometry(L * 0.46, 0.4, W * 0.94), glass, -0.25, 1.18, 0);
      const tyre = std({ color: 0x151515, roughness: 0.9 });
      for (const [px, pz] of [[1.35, 0.8], [-1.35, 0.8], [1.35, -0.8], [-1.35, -0.8]]) { const t = m(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 14), tyre, px, burnt ? 0.2 : 0.33, pz); t.rotation.x = Math.PI / 2; }
      decor.add(g);
    },
    // things that aren't solid (or are covered by a box already)
    decor(obj) { decor.add(obj); return obj; },
    solid(x0, y0, z0, x1, y1, z1, mat = 'metal') { boxes.push({ min: new THREE.Vector3(x0, y0, z0), max: new THREE.Vector3(x1, y1, z1), mat }); },
    // is the ground here clear of anything solid? (for scattering props)
    free(x, z, r = 0.5, y = 0) { for (const b of boxes) if (x + r > b.min.x && x - r < b.max.x && z + r > b.min.z && z - r < b.max.z && b.max.y > y + 0.05 && b.min.y < y + 1.5) return false; return true; },
    // one instance of a prop (see PROPS); solid: an axis-aligned collider of half-size hx/hz, height h
    prop(kind, x, y, z, rot = 0, sc = 1, color = null, solid = null) {
      (insts[kind] || (insts[kind] = [])).push({ x, y, z, rot, sc, color });
      if (solid) B.solid(x - solid[0], y, z - solid[1], x + solid[0], y + solid[2], z + solid[1], solid[3] || 'metal');
    },
  };

  // ---------- looks (materials) ----------
  const plasTints = [0xcdb896, 0xc2a67e, 0xd6c8ad, 0xb39a78, 0xbfae92];
  plasTints.forEach((t, i) => look('plaster' + i, () => std(TX.plaster(t, 7 + i), { roughness: 0.95 }), 2.5));
  look('concrete0', () => std(TX.concrete(8), { roughness: 0.9 }), 3);
  look('block', () => std(TX.blocks(9), { roughness: 0.95 }), 1.6);
  look('trim', () => std(TX.plaster(0xddd3bf, 31), { roughness: 0.9 }), 1.5);
  look('paint', () => std(TX.woodPlanks(0x3d6b78, 17), { roughness: 0.75 }), 1.2);
  look('tile', () => std(TX.concreteFloor(6), { roughness: 0.75 }), 3);
  look('sandbag', () => std(TX.sandbag(13), { roughness: 1 }), 1.2);
  look('wood', () => std(TX.woodPlanks(0x7a5a3a, 12), { roughness: 0.85 }), 2);
  look('metal', () => std(TX.corrugated(0x7c8288, 10), { roughness: 0.6, metalness: 0.55 }), 3);
  look('metalRust', () => std(TX.corrugated(0x7d6a58, 15, 0.9), { roughness: 0.75, metalness: 0.4 }), 3);
  look('steel', () => std(TX.metalPlate(0x4a4d50, 14), { roughness: 0.5, metalness: 0.7 }), 2);
  const contCols = [[0x8c2a1e, 'MAERSK'], [0x1f4f7a, 'TRITON'], [0x2f5d36, 'EVERGRN'], [0xb07b22, 'CAI'], [0x6b6e70, 'TEXTAINER'], [0x5a2f6a, 'SEACO']];
  contCols.forEach(([c, lab], i) => look('cont' + i, () => std(TX.container(c, 11 + i, lab), { roughness: 0.55, metalness: 0.5 }), 2.4));
  look('yellow', () => std({ color: 0xd8a21c, roughness: 0.6, metalness: 0.3 }), 2);

  // ---------- the map ----------
  const meta = def.build(B, { decor, std });
  buildProps(insts, decor, std);
  mergeStatic(decor);

  // ground
  const gs = meta.size;
  const gT = def.ground === 'asphalt' ? TX.asphalt(5) : TX.sand(3);
  for (const t of [gT.map, gT.normalMap]) { t.repeat.set(gs[0] / 6, gs[1] / 6); }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(gs[0] + 200, gs[1] + 200), std({ map: gT.map, normalMap: gT.normalMap, roughness: 0.95, normalScale: new THREE.Vector2(0.8, 0.8) }));
  for (const t of [gT.map, gT.normalMap]) t.repeat.set((gs[0] + 200) / 6, (gs[1] + 200) / 6);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  // the merged meshes
  const meshes = [];
  for (const L of looks.values()) {
    if (!L.idx.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(L.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(L.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(L.uv, 2));
    g.setIndex(L.idx); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, L.mat); m.castShadow = true; m.receiveShadow = true; scene.add(m); meshes.push(m);
  }

  // the edge of the map: invisible walls
  const [hw, hd] = [gs[0] / 2, gs[1] / 2];
  boxes.push({ min: new THREE.Vector3(-hw - 5, -5, -hd - 5), max: new THREE.Vector3(-hw, 60, hd + 5), mat: 'steel', edge: true });
  boxes.push({ min: new THREE.Vector3(hw, -5, -hd - 5), max: new THREE.Vector3(hw + 5, 60, hd + 5), mat: 'steel', edge: true });
  boxes.push({ min: new THREE.Vector3(-hw - 5, -5, -hd - 5), max: new THREE.Vector3(hw + 5, 60, -hd), mat: 'steel', edge: true });
  boxes.push({ min: new THREE.Vector3(-hw - 5, -5, hd), max: new THREE.Vector3(hw + 5, 60, hd + 5), mat: 'steel', edge: true });

  const W = { def, id: mapId, name: def.name, boxes, meshes, decor, ground, size: gs, looks, spawns: meta.spawns, flags: meta.flags, ffa: meta.ffa, sky: def.sky, sun: def.sun, fog: def.fog };
  buildGrid(W); buildNav(W);
  W.dispose = () => { for (const m of meshes) { scene.remove(m); m.geometry.dispose(); } scene.remove(decor); scene.remove(ground); ground.geometry.dispose(); };
  return W;
}

// six faces of a box with UVs in world metres / scale
function addBoxGeo(L, min, max) {
  const s = L.scale, P = L.pos, N = L.nor, U = L.uv, I = L.idx;
  const face = (a, b, c, d, n, uvf) => {
    const i = P.length / 3;
    for (const v of [a, b, c, d]) { P.push(v[0], v[1], v[2]); N.push(n[0], n[1], n[2]); const [u, w] = uvf(v); U.push(u / s, w / s); }
    I.push(i, i + 1, i + 2, i, i + 2, i + 3);
  };
  const [x0, y0, z0] = [min.x, min.y, min.z], [x1, y1, z1] = [max.x, max.y, max.z];
  face([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], (v) => [-v[2], v[1]]);
  face([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], (v) => [v[2], v[1]]);
  face([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], (v) => [v[0], -v[2]]);
  if (y0 > 0.01) face([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], (v) => [v[0], v[2]]);
  face([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], (v) => [v[0], v[1]]);
  face([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], (v) => [-v[0], v[1]]);
}

// ---------- spatial grid for fast queries ----------
const CELL = 4;
function buildGrid(W) {
  const [hw, hd] = [W.size[0] / 2 + 6, W.size[1] / 2 + 6];
  const nx = Math.ceil(hw * 2 / CELL), nz = Math.ceil(hd * 2 / CELL);
  const cells = Array.from({ length: nx * nz }, () => []);
  W.boxes.forEach((b, i) => {
    b.id = i;
    const cx0 = Math.max(0, Math.floor((b.min.x + hw) / CELL)), cx1 = Math.min(nx - 1, Math.floor((b.max.x + hw) / CELL));
    const cz0 = Math.max(0, Math.floor((b.min.z + hd) / CELL)), cz1 = Math.min(nz - 1, Math.floor((b.max.z + hd) / CELL));
    for (let x = cx0; x <= cx1; x++) for (let z = cz0; z <= cz1; z++) cells[z * nx + x].push(b);
  });
  W.grid = { hw, hd, nx, nz, cells };
}
let stamp = 0;
// every box overlapping an xz rectangle
export function boxesNear(W, x0, z0, x1, z1, out = []) {
  const { hw, hd, nx, nz, cells } = W.grid; out.length = 0; stamp++;
  const cx0 = Math.max(0, Math.floor((x0 + hw) / CELL)), cx1 = Math.min(nx - 1, Math.floor((x1 + hw) / CELL));
  const cz0 = Math.max(0, Math.floor((z0 + hd) / CELL)), cz1 = Math.min(nz - 1, Math.floor((z1 + hd) / CELL));
  for (let x = cx0; x <= cx1; x++) for (let z = cz0; z <= cz1; z++) for (const b of cells[z * nx + x]) if (b._s !== stamp) { b._s = stamp; out.push(b); }
  return out;
}

// ray vs one box: [tEnter, tExit, axis of entry] or null
function rayBox(o, d, b, tmax) {
  let t0 = 0, t1 = tmax, ax = -1, sg = 0;
  for (let a = 0; a < 3; a++) {
    const k = a === 0 ? 'x' : a === 1 ? 'y' : 'z', od = d[k], oo = o[k];
    if (Math.abs(od) < 1e-9) { if (oo < b.min[k] || oo > b.max[k]) return null; continue; }
    let ta = (b.min[k] - oo) / od, tb = (b.max[k] - oo) / od, s = -1;
    if (ta > tb) { const q = ta; ta = tb; tb = q; s = 1; }
    if (ta > t0) { t0 = ta; ax = a; sg = s; }
    if (tb < t1) t1 = tb;
    if (t0 > t1) return null;
  }
  return [t0, t1, ax, sg];
}
const _hits = [];
// the nearest solid along a ray (ground included). Returns { t, point, normal, box, mat } or null.
export function raycast(W, o, d, maxDist = 400, skipEdge = true) {
  let best = null;
  // ground plane
  if (d.y < -1e-6) { const t = -o.y / d.y; if (t > 0 && t < maxDist) best = { t, normal: new THREE.Vector3(0, 1, 0), box: null, mat: W.def.ground === 'asphalt' ? 'concrete' : 'sand', ground: true }; }
  // walk the grid cells along the ray (2D DDA)
  const { hw, hd, nx, nz, cells } = W.grid; stamp++;
  let cx = Math.floor((o.x + hw) / CELL), cz = Math.floor((o.z + hd) / CELL);
  const sx = d.x > 0 ? 1 : -1, sz = d.z > 0 ? 1 : -1;
  const tdx = Math.abs(d.x) > 1e-9 ? CELL / Math.abs(d.x) : Infinity, tdz = Math.abs(d.z) > 1e-9 ? CELL / Math.abs(d.z) : Infinity;
  let tx = Math.abs(d.x) > 1e-9 ? (((cx + (sx > 0 ? 1 : 0)) * CELL - hw) - o.x) / d.x : Infinity;
  let tz = Math.abs(d.z) > 1e-9 ? (((cz + (sz > 0 ? 1 : 0)) * CELL - hd) - o.z) / d.z : Infinity;
  let tcur = 0;
  const lim = best ? best.t : maxDist;
  for (let guard = 0; guard < 400; guard++) {
    if (cx >= 0 && cz >= 0 && cx < nx && cz < nz) {
      for (const b of cells[cz * nx + cx]) {
        if (b._s === stamp) continue; b._s = stamp;
        if (skipEdge && b.edge) continue;
        const r = rayBox(o, d, b, best ? best.t : maxDist);
        if (r && r[0] >= 0 && (!best || r[0] < best.t)) {
          const n = new THREE.Vector3(); if (r[2] >= 0) n.setComponent(r[2], r[3]); else n.copy(d).negate();
          best = { t: r[0], tExit: r[1], normal: n, box: b, mat: b.mat };
        }
      }
    }
    if (best && best.t <= tcur) break;
    if (tx < tz) { tcur = tx; tx += tdx; cx += sx; } else { tcur = tz; tz += tdz; cz += sz; }
    if (tcur > (best ? best.t : lim)) break;
    if ((cx < -1 || cz < -1 || cx > nx || cz > nz)) break;
  }
  if (best) best.point = o.clone().addScaledVector(d, best.t);
  void _hits;
  return best;
}
// true when nothing solid is between a and b
export function clearLine(W, a, b) {
  const d = b.clone().sub(a), len = d.length(); if (len < 1e-4) return true;
  d.divideScalar(len);
  const h = raycast(W, a, d, len);
  return !h || h.t >= len - 0.05;
}

// the highest walkable top under (x, z) at or below y + 0.5 (0 = the ground)
const _near = [];
export function groundAt(W, x, z, y = 100, r = 0) {
  let g = 0;
  for (const b of boxesNear(W, x - r, z - r, x + r, z + r, _near)) {
    if (b.edge) continue;
    if (x + r > b.min.x && x - r < b.max.x && z + r > b.min.z && z - r < b.max.z && b.max.y <= y + 0.5 && b.max.y > g) g = b.max.y;
  }
  return g;
}

// moves a standing body (a vertical box of half-width r and height h with its feet at p) by v*dt.
// Climbs steps up to `step`. Returns { onGround, hitCeil }.
export function moveBody(W, p, v, dt, r, h, step = 0.45) {
  const res = { onGround: false, hitCeil: false, hitWall: false };
  const near = boxesNear(W, p.x - r - 2, p.z - r - 2, p.x + r + 2, p.z + r + 2, []);
  const over = (b, x, y, z) => x + r > b.min.x && x - r < b.max.x && z + r > b.min.z && z - r < b.max.z && y + h > b.min.y && y < b.max.y;
  // horizontal, one axis at a time, with step-up
  for (const ax of ['x', 'z']) {
    const dx = v[ax] * dt; if (!dx) continue;
    const nx = ax === 'x' ? p.x + dx : p.x, nz = ax === 'z' ? p.z + dx : p.z;
    let blocked = null, lift = 0;
    for (const b of near) {
      if (!over(b, nx, p.y + 0.001, nz)) continue;
      const up = b.max.y - p.y;
      if (up <= step && up > 0 && !near.some((c) => c !== b && over(c, nx, b.max.y + 0.001, nz))) { lift = Math.max(lift, up); continue; }
      blocked = b; break;
    }
    if (blocked) {
      // slide flush against it
      const b = blocked;
      if (ax === 'x') p.x = dx > 0 ? Math.min(p.x, b.min.x - r - 0.001) : Math.max(p.x, b.max.x + r + 0.001);
      else p.z = dx > 0 ? Math.min(p.z, b.min.z - r - 0.001) : Math.max(p.z, b.max.z + r + 0.001);
      v[ax] = 0; res.hitWall = true;
    } else { p[ax] = ax === 'x' ? nx : nz; if (lift > 0) { p.y += lift; if (v.y < 0) v.y = 0; } }
  }
  // vertical
  const dy = v.y * dt; let ny = p.y + dy;
  if (dy <= 0) {
    let floor = 0;
    for (const b of near) if (p.x + r > b.min.x && p.x - r < b.max.x && p.z + r > b.min.z && p.z - r < b.max.z && b.max.y <= p.y + 0.01 && b.max.y > floor) floor = b.max.y;
    if (ny <= floor) { ny = floor; v.y = 0; res.onGround = true; }
  } else {
    for (const b of near) if (p.x + r > b.min.x && p.x - r < b.max.x && p.z + r > b.min.z && p.z - r < b.max.z && b.min.y >= p.y + h - 0.01 && ny + h > b.min.y) { ny = b.min.y - h; v.y = 0; res.hitCeil = true; }
  }
  p.y = ny;
  // pushed out if something overlaps (e.g. standing up under a low ceiling is refused by the caller)
  return res;
}
export function fits(W, p, r, h) {
  for (const b of boxesNear(W, p.x - r, p.z - r, p.x + r, p.z + r, [])) if (p.x + r > b.min.x && p.x - r < b.max.x && p.z + r > b.min.z && p.z - r < b.max.z && p.y + h > b.min.y + 0.01 && p.y + 0.05 < b.max.y) return false;
  return true;
}

// ---------- bot navigation: a 1 m grid at ground level, A* ----------
const NAV = 1;
function buildNav(W) {
  const [hw, hd] = [W.size[0] / 2, W.size[1] / 2];
  const nx = Math.floor(hw * 2 / NAV), nz = Math.floor(hd * 2 / NAV);
  const block = new Uint8Array(nx * nz), cover = new Uint8Array(nx * nz);
  const m = 0.38;
  for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    const wx = -hw + (x + 0.5) * NAV, wz = -hd + (z + 0.5) * NAV;
    for (const b of boxesNear(W, wx - m, wz - m, wx + m, wz + m, _near)) {
      if (b.edge) continue;
      if (wx + m > b.min.x && wx - m < b.max.x && wz + m > b.min.z && wz - m < b.max.z && b.max.y > 0.3 && b.min.y < 1.9) { block[z * nx + x] = 1; break; }
    }
  }
  // cover: free cells next to something at least waist high
  for (let z = 1; z < nz - 1; z++) for (let x = 1; x < nx - 1; x++) if (!block[z * nx + x] && (block[z * nx + x - 1] || block[z * nx + x + 1] || block[(z - 1) * nx + x] || block[(z + 1) * nx + x])) cover[z * nx + x] = 1;
  W.nav = { hw, hd, nx, nz, block, cover };
}
export function navCell(W, x, z) { const N = W.nav; return [Math.max(0, Math.min(N.nx - 1, Math.floor((x + N.hw) / NAV))), Math.max(0, Math.min(N.nz - 1, Math.floor((z + N.hd) / NAV)))]; }
export const navFree = (W, cx, cz) => cx >= 0 && cz >= 0 && cx < W.nav.nx && cz < W.nav.nz && !W.nav.block[cz * W.nav.nx + cx];
export const navPos = (W, cx, cz) => new THREE.Vector3(-W.nav.hw + (cx + 0.5) * NAV, 0, -W.nav.hd + (cz + 0.5) * NAV);
// nearest free cell to a point
export function navNearest(W, x, z) {
  const [cx, cz] = navCell(W, x, z);
  for (let r = 0; r < 12; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
    if (navFree(W, cx + dx, cz + dz)) return [cx + dx, cz + dz];
  }
  return [cx, cz];
}
// A* from world a to world b; returns a list of world points (simplified by line of sight) or null
export function findPath(W, a, b, maxIter = 9000) {
  const N = W.nav, [sx, sz] = navNearest(W, a.x, a.z), [gx, gz] = navNearest(W, b.x, b.z), nx = N.nx, n = nx * N.nz;
  // typed arrays, allocated once per map; a search number marks which entries belong to this search
  if (!N.g) { N.g = new Float32Array(n); N.came = new Int32Array(n); N.seen = new Uint32Array(n); N.shut = new Uint32Array(n); N.hk = new Float32Array(n * 8); N.hv = new Int32Array(n * 8); N.run = 0; }
  const run = ++N.run, G = N.g, came = N.came, seen = N.seen, shut = N.shut, HK = N.hk, HV = N.hv, block = N.block;
  const start = sz * nx + sx, goal = gz * nx + gx;
  let hn = 0;
  const push = (f, k) => { let i = hn++; HK[i] = f; HV[i] = k; while (i > 0) { const p = (i - 1) >> 1; if (HK[p] <= HK[i]) break; const tf = HK[p], tk = HV[p]; HK[p] = HK[i]; HV[p] = HV[i]; HK[i] = tf; HV[i] = tk; i = p; } };
  const pop = () => { const top = HV[0]; hn--; if (hn > 0) { HK[0] = HK[hn]; HV[0] = HV[hn]; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < hn && HK[l] < HK[m]) m = l; if (r < hn && HK[r] < HK[m]) m = r; if (m === i) break; const tf = HK[m], tk = HV[m]; HK[m] = HK[i]; HV[m] = HV[i]; HK[i] = tf; HV[i] = tk; i = m; } } return top; };
  const free = (x, z) => x >= 0 && z >= 0 && x < nx && z < N.nz && !block[z * nx + x];
  G[start] = 0; seen[start] = run; came[start] = -1; push(0, start);
  let it = 0, found = start === goal;
  while (hn && it++ < maxIter && hn < HK.length - 8) {
    const cur = pop();
    if (cur === goal) { found = true; break; }
    if (shut[cur] === run) continue; shut[cur] = run;
    const cx = cur % nx, cz = (cur / nx) | 0, gc = G[cur];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const x = cx + dx, z = cz + dz; if (!free(x, z)) continue;
      if (dx && dz && (!free(cx + dx, cz) || !free(cx, cz + dz))) continue;
      const k = z * nx + x, ng = gc + (dx && dz ? 1.414 : 1);
      if (seen[k] !== run || ng < G[k]) {
        seen[k] = run; G[k] = ng; came[k] = cur;
        const ddx = Math.abs(x - gx), ddz = Math.abs(z - gz);
        push(ng + Math.max(ddx, ddz) + 0.414 * Math.min(ddx, ddz), k);
      }
    }
  }
  if (!found) return null;
  const cellsPath = []; let k = goal; while (k !== start && k >= 0) { cellsPath.push(k); k = came[k]; } cellsPath.push(start); cellsPath.reverse();
  const pts = cellsPath.map((c) => navPos(W, c % nx, (c / nx) | 0));
  // string-pulling: skip points that can be walked straight past
  const out = [pts[0]]; let i = 0;
  while (i < pts.length - 1) {
    let j = Math.min(pts.length - 1, i + 24);
    while (j > i + 1 && !navLine(W, pts[i], pts[j])) j--;
    out.push(pts[j]); i = j;
  }
  return out;
}
export function navLine(W, a, b) {
  const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.ceil(d / 0.4);
  for (let i = 1; i <= n; i++) { const t = i / n; const [cx, cz] = navCell(W, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t); if (!navFree(W, cx, cz)) return false; }
  return true;
}
export function randomNavPoint(W, rnd = Math.random) {
  for (let i = 0; i < 200; i++) { const x = (rnd() * W.nav.nx) | 0, z = (rnd() * W.nav.nz) | 0; if (navFree(W, x, z)) return navPos(W, x, z); }
  return new THREE.Vector3();
}

// ================= MAP DEFINITIONS =================
const MAP_DEFS = {
  hadra: {
    name: 'Al-Hadra', desc: 'A desert town at mid-afternoon: walled compounds, narrow alleys, flat roofs and a market square.',
    ground: 'sand',
    atmo: { turbidity: 4.5, rayleigh: 1.3, mie: 0.004, g: 0.85, clouds: 0.3, skyGain: 0.32, envInt: 0.5, sunEnv: 5 },
    sky: ['#4f7fb8', '#a9c3d8', '#e4d6bd'], sun: { color: 0xfff0d8, int: 3.2, dir: [-0.45, 0.8, 0.35], hemi: [0xbcd3ea, 0x8a7458, 1.1] }, fog: [0xcfc6b2, 90, 420],
    build(B, { decor, std }) {
      const R = TX.rng(42);
      const lk = () => 'plaster' + ((R() * 5) | 0);
      // --- the market square (B) ---
      B.house(-14, -15, 12, 7, { floors: 2, doors: [['s', 2], ['s', 8]], wins: [['s', 5, 1], ['s', 9.5, 1], ['e', 3, 1], ['w', 3, 1], ['s', 5.5, 0]], lk: 'plaster2', hole: [-13.6, -14.6, -11.6, -9], stairs: [-13.6, -14.4, '+z', 3.3, 1.6] }); // two-storey, stairs inside
      B.house(3, -15, 11, 7, { doors: [['s', 2], ['w', 3]], wins: [['s', 6], ['s', 8.5]], lk: 'plaster1', stairs: [14, -14, '+z', 3.55] });
      B.house(-14, 8, 10, 7, { doors: [['n', 3], ['e', 3]], wins: [['n', 7], ['w', 3]], lk: 'plaster3', stairs: [-15.1, 8, '+z', 3.55] });
      B.house(5, 8, 9, 7, { doors: [['n', 2]], wins: [['n', 5.5], ['e', 3], ['s', 4]], lk: 'plaster4' });
      // stalls with cloth roofs (wooden tables are cover)
      const cloth = [0x9b3b2a, 0x2d5c7a, 0xb3893a, 0x4e6b3a];
      for (const [x, z, c] of [[-6, -4, 0], [-1.5, -4.5, 1], [3.5, -4, 2], [-6, 3.5, 3], [4, 3.5, 0]]) {
        B.box(x - 1.2, 0, z - 0.5, x + 1.2, 0.9, z + 0.5, 'wood', 'wood');
        const roof = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.4), std({ color: cloth[c], roughness: 1, side: THREE.DoubleSide }));
        roof.rotation.x = -Math.PI / 2 + 0.12; roof.position.set(x, 2.3, z); roof.castShadow = true; decor.add(roof);
        for (const [px, pz] of [[-1.5, -1.1], [1.5, -1.1], [-1.5, 1.1], [1.5, 1.1]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.3, 6), std({ color: 0x5a4632 })); p.position.set(x + px, 1.15, z + pz); decor.add(p); }
      }
      B.box(-0.9, 0, -0.9, 0.9, 0.8, 0.9, 'concrete', 'concrete0'); // the old fountain
      B.box(-1.4, 0, -1.4, 1.4, 0.45, 1.4, 'concrete', 'concrete0');
      B.car(-9, 1, 0, 0xc7c1b5); B.car(9.5, -1, Math.PI / 2, 0x7b2c22, true);
      B.sandbags(-2.5, 6.2, 2.5, 7);
      // --- the residential blocks: four quadrants of plots ---
      const plots = [];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const x = sx * (20 + i * 14), z = sz * (19 + j * 14);
        plots.push([x, z, sx, sz, i, j]);
      }
      for (const [x, z, sx, sz, i, j] of plots) {
        const cx = x - 5.5, cz = z - 5.5;
        if (j === 0 && (i === 1)) continue; // keep the cross street wide near A and C
        if (Math.abs(z) > 44 && i === 0) { // near the spawns: low cover only
          B.sandbags(cx + 2, cz + 4, cx + 6, cz + 4.8); B.box(cx + 7, 0, cz + 1, cx + 9, 1.2, cz + 3, 'wood', 'wood'); continue;
        }
        const r = R();
        if (r < 0.32) { // a walled compound: a 2.4 m mud wall around a small house, a gate
          const w = 11, lkW = lk();
          B.wall(cx, cz, w, 'x', 2.4, 0.4, [{ at: 4.5, w: 2.2, y0: 0, y1: 2.4 }], 'plaster', lkW);
          B.wall(cx, cz + w, w, 'x', 2.4, 0.4, [{ at: 2, w: 1.2, y0: 0, y1: 2.2 }], 'plaster', lkW);
          B.wall(cx, cz + 0.2, w - 0.4, 'z', 2.4, 0.4, [], 'plaster', lkW);
          B.wall(cx + w, cz + 0.2, w - 0.4, 'z', 2.4, 0.4, [{ at: 6, w: 1.2, y0: 0, y1: 2.2 }], 'plaster', lkW);
          B.house(cx + 5.5, cz + 5, 5, 5.3, { doors: [['w', 2]], wins: [['n', 2]], lk: lk() });
          B.box(cx + 1, 0, cz + 7.5, cx + 3.4, 1.0, cz + 8.5, 'wood', 'wood');
        } else if (r < 0.82) { // a house, maybe with roof stairs
          const w = 7 + R() * 4, d = 6 + R() * 4, ox = cx + R() * (11 - w), oz = cz + R() * (11 - d), two = R() < 0.22;
          const doors = [[sz < 0 ? 's' : 'n', 1 + R() * (w - 3)], [sx < 0 ? 'e' : 'w', 1 + R() * (d - 3)]];
          const wins = [['n', 1 + R() * (w - 2.5)], ['s', 1 + R() * (w - 2.5)], ['e', 1 + R() * (d - 2.5)], ['w', 1 + R() * (d - 2.5)]];
          if (two) wins.push(['n', 1 + R() * (w - 2.5), 1], ['s', 1 + R() * (w - 2.5), 1], ['e', 1 + R() * (d - 2.5), 1]);
          const st = R() < 0.5 && !two ? [ox + w, oz, '+z', 3.55] : null;
          B.house(ox, oz, w, d, { floors: two ? 2 : 1, doors, wins, lk: lk(), stairs: st, hole: two ? [ox + 0.4, oz + 0.4, ox + 2.2, oz + 4.4] : null });
          if (two) B.stairs(ox + 0.4, oz + 0.5, '+z', 3.3, 1.6);
        } else { // a yard: rubble, a car, a water tank
          if (R() < 0.6) B.car(cx + 5.5, cz + 5.5, R() < 0.5 ? 0 : Math.PI / 2, [0x8e8a80, 0x34495e, 0xd6d2c4, 0x5e3a2a][(R() * 4) | 0], R() < 0.4);
          B.box(cx + 1, 0, cz + 1, cx + 2.6, 0.6, cz + 3.2, 'concrete', 'concrete0');
          B.box(cx + 8, 0, cz + 7, cx + 9.4, 1.6, cz + 8.4, 'metal', 'metalRust');
        }
      }
      // A and C: sandbagged checkpoints on the cross street
      for (const sx of [-1, 1]) {
        const x = sx * 34;
        B.sandbags(x - 3, -2.8, x + 3, -2.1); B.sandbags(x - 3, 2.1, x + 3, 2.8); B.sandbags(x + sx * 3.5, -1, x + sx * 4.2, 1);
        B.box(x - sx * 4 - 0.6, 0, -0.6, x - sx * 4 + 0.6, 1.2, 0.6, 'concrete', 'concrete0');
        // a guard tower
        const tx = x + sx * 6, tz = -6;
        for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.box(tx + px * 1.1 - 0.12, 0, tz + pz * 1.1 - 0.12, tx + px * 1.1 + 0.12, 4.2, tz + pz * 1.1 + 0.12, 'wood', 'wood');
        B.box(tx - 1.4, 4.2, tz - 1.4, tx + 1.4, 4.4, tz + 1.4, 'wood', 'wood');
        B.box(tx - 1.4, 4.4, tz - 1.4, tx + 1.4, 5.4, tz - 1.25, 'wood', 'wood'); B.box(tx - 1.4, 4.4, tz + 1.25, tx + 1.4, 5.4, tz + 1.4, 'wood', 'wood');
        B.box(tx - 1.4, 4.4, tz - 1.25, tx - 1.25, 5.4, tz + 1.25, 'wood', 'wood');
        B.stairs(tx + 1.4, tz - 1.4, '+x', 4.2, 0.9, 'wood');
      }
      // perimeter walls and the town edge
      for (const sz of [-1, 1]) B.wall(-64, sz * 63.5, 128, 'x', 3, 0.6, [{ at: 58, w: 12, y0: 0, y1: 3 }], 'plaster', 'plaster3');
      for (const sx of [-1, 1]) B.wall(sx * 63.5, -63, 126, 'z', 3, 0.6, [], 'plaster', 'plaster3');
      // palm trees, power poles
      // fronds: a rib with leaflets fanning off it (alpha-cut), and a ringed trunk
      const frond = (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 512; const g = c.getContext('2d');
        g.strokeStyle = '#6d6a2c'; g.lineWidth = 5; g.beginPath(); g.moveTo(64, 512); g.quadraticCurveTo(60, 250, 64, 0); g.stroke();
        for (let y = 500; y > 10; y -= 9) { const L = 58 * Math.sin((y / 512) * Math.PI * 0.95 + 0.1); for (const s of [-1, 1]) { g.strokeStyle = ['#4e6b2b', '#5d7a32', '#6b7a36', '#8a8a44'][(y / 9 | 0) % 4]; g.lineWidth = 4; g.beginPath(); g.moveTo(64, y); g.quadraticCurveTo(64 + s * L * 0.5, y - 10, 64 + s * L, y - 24); g.stroke(); } }
        const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
      const bark = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d'); g.fillStyle = '#6b5338'; g.fillRect(0, 0, 64, 256); for (let y = 0; y < 256; y += 10) { g.fillStyle = 'rgba(40,28,18,0.6)'; g.fillRect(0, y, 64, 3); g.fillStyle = 'rgba(160,130,95,0.25)'; g.fillRect(0, y + 3, 64, 2); } const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 6); t.colorSpace = THREE.SRGBColorSpace; return t; })();
      const trunk = std({ map: bark, roughness: 1 }), leaf = std({ map: frond, alphaTest: 0.35, roughness: 0.85, side: THREE.DoubleSide });
      for (let k = 0; k < 14; k++) {
        const x = (R() - 0.5) * 116, z = (R() - 0.5) * 116; if (Math.abs(x) < 5 || Math.abs(z) < 4) continue;
        const g = new THREE.Group(); g.position.set(x, 0, z); const h = 6 + R() * 4;
        const t = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, h, 8), trunk); t.position.y = h / 2; t.rotation.z = (R() - 0.5) * 0.15; t.castShadow = true; g.add(t);
        for (let f = 0; f < 10; f++) { const fr = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 3.6), leaf); fr.position.y = h; fr.rotation.set(-0.9 - R() * 0.6, f / 10 * 6.28 + R() * 0.3, (R() - 0.5) * 0.4, 'YXZ'); fr.translateY(1.5); fr.castShadow = true; g.add(fr); }
        decor.add(g);
      }
      const pole = std({ color: 0x5b4b3a, roughness: 1 }), wireM = new THREE.LineBasicMaterial({ color: 0x111111 });
      const poles = []; for (let z = -56; z <= 56; z += 16) poles.push(new THREE.Vector3(5.6, 0, z));
      for (const p of poles) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 8, 7), pole); m.position.set(p.x, 4, p.z); m.castShadow = true; decor.add(m); const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 0.1), pole); arm.position.set(p.x, 7.6, p.z); decor.add(arm); }
      for (let i = 0; i < poles.length - 1; i++) for (const off of [-0.6, 0.6]) {
        const a = poles[i], b = poles[i + 1], pts = [];
        for (let k = 0; k <= 10; k++) { const t = k / 10; pts.push(new THREE.Vector3(a.x + off, 7.6 - Math.sin(t * Math.PI) * 0.8, a.z + (b.z - a.z) * t)); }
        decor.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireM));
      }
      // ---- lived in: drums, tyres, scrub, rubble, rubbish; tanks, dishes and AC units on the houses ----
      const drumCols = [0x3a5a7a, 0x8a3a2a, 0x4a5a3a, 0x9a8a3a, 0x5a5a5a];
      for (let i = 0; i < 90; i++) {
        const x = (R() - 0.5) * 120, z = (R() - 0.5) * 120;
        const k = R();
        if (k < 0.18) { if (B.free(x, z, 0.4)) B.prop('barrel', x, 0, z, R() * 6, 1, drumCols[(R() * 5) | 0], [0.29, 0.29, 0.88]); if (R() < 0.5 && B.free(x + 0.62, z, 0.35)) B.prop('barrel', x + 0.62, 0, z, R() * 6, 1, drumCols[(R() * 5) | 0], [0.29, 0.29, 0.88]); }
        else if (k < 0.3) { if (B.free(x, z, 0.4)) for (let t = 0; t < 1 + R() * 3; t++) B.prop('tire', x + (R() - 0.5) * 0.2, t * 0.21, z + (R() - 0.5) * 0.2, R() * 6, 1); }
        else if (k < 0.6) { if (B.free(x, z, 0.4)) B.prop('shrub', x, 0, z, R() * 6, 0.7 + R() * 0.8); }
        else if (k < 0.8) { if (B.free(x, z, 0.6)) for (let t = 0; t < 4 + R() * 8; t++) B.prop('rubble', x + (R() - 0.5) * 1.6, 0, z + (R() - 0.5) * 1.6, R() * 6, 0.5 + R() * 1.3); }
        else if (k < 0.9) { if (B.free(x, z, 0.4)) B.prop('rock', x, 0, z, R() * 6, 0.6 + R() * 1.2); }
        else { if (B.free(x, z, 0.5)) for (let t = 0; t < 2 + R() * 3; t++) B.prop('bag', x + (R() - 0.5) * 0.9, 0, z + (R() - 0.5) * 0.9, R() * 6, 0.7 + R() * 0.5); }
      }
      for (const hs of B.houses) {
        const cx = (hs.x0 + hs.x1) / 2, cz = (hs.z0 + hs.z1) / 2;
        if (R() < 0.55) B.prop('tank', hs.x0 + 1 + R() * (hs.x1 - hs.x0 - 2), hs.top, hs.z0 + 1 + R() * (hs.z1 - hs.z0 - 2), R() * 6, 1, null, [0.55, 0.55, 1.35, 'metal']);
        if (R() < 0.4) B.prop('dish', cx + (R() - 0.5) * 2, hs.top, cz + (R() - 0.5) * 2, R() * 6, 1);
        // an AC unit hanging on a wall, under the roof
        if (R() < 0.6) { const side = (R() * 4) | 0, y = hs.top - 1.6 - R() * 0.6, t = 0.2 + R() * 0.6;
          if (side === 0) B.prop('ac', hs.x0 + t * (hs.x1 - hs.x0), y, hs.z0 - 0.15, Math.PI, 1);
          else if (side === 1) B.prop('ac', hs.x0 + t * (hs.x1 - hs.x0), y, hs.z1 + 0.15, 0, 1);
          else if (side === 2) B.prop('ac', hs.x0 - 0.15, y, hs.z0 + t * (hs.z1 - hs.z0), -Math.PI / 2, 1);
          else B.prop('ac', hs.x1 + 0.15, y, hs.z0 + t * (hs.z1 - hs.z0), Math.PI / 2, 1); }
      }
      return {
        size: [128, 128],
        spawns: [
          [[-6, -56], [0, -57], [6, -56], [-14, -54], [14, -54], [-24, -55], [24, -55], [-3, -50], [3, -50]],
          [[-6, 56], [0, 57], [6, 56], [-14, 54], [14, 54], [-24, 55], [24, 55], [-3, 50], [3, 50]],
        ],
        ffa: [[-50, -50], [50, -50], [-50, 50], [50, 50], [0, -56], [0, 56], [-56, 0], [56, 0], [-30, -30], [30, 30], [-30, 30], [30, -30], [-20, 0], [20, 0], [0, 20], [0, -20]],
        flags: [{ name: 'A', x: -34, z: 0, r: 5 }, { name: 'B', x: 0, z: 0, r: 6 }, { name: 'C', x: 34, z: 0, r: 5 }],
      };
    },
  },

  kessel: {
    name: 'Kessel Freight Yard', desc: 'A container port on an overcast evening: stacked boxes, a warehouse, an office block and the cranes.',
    ground: 'asphalt',
    atmo: { turbidity: 12, rayleigh: 2.2, mie: 0.02, g: 0.75, clouds: 0.9, cloudColor: 0x9da2a8, skyGain: 0.22, envInt: 0.55, sunEnv: 2 },
    sky: ['#454c55', '#8c8f92', '#b5aea2'], sun: { color: 0xffe2c0, int: 2.0, dir: [0.6, 0.45, -0.4], hemi: [0x9aa6b4, 0x4a4640, 1.25] }, fog: [0x9a9890, 40, 200],
    build(B, { decor, std }) {
      const R = TX.rng(7);
      // --- the warehouse (A): corrugated shed, 24 × 18, open doors both ends, a mezzanine ---
      const wx0 = -50, wz0 = -9, ww = 22, wd = 18, wh = 8;
      B.wall(wx0, wz0, ww, 'x', wh, 0.25, [{ at: 3, w: 2.2, y0: 0, y1: 2.4 }, { at: 14, w: 4, y0: 0, y1: 4.5 }], 'metal', 'metal');
      B.wall(wx0, wz0 + wd, ww, 'x', wh, 0.25, [{ at: 4, w: 4, y0: 0, y1: 4.5 }, { at: 16, w: 2.2, y0: 0, y1: 2.4 }], 'metal', 'metal');
      B.wall(wx0, wz0, wd, 'z', wh, 0.25, [{ at: 7, w: 4, y0: 0, y1: 4.5 }], 'metal', 'metal');
      B.wall(wx0 + ww, wz0, wd, 'z', wh, 0.25, [{ at: 7, w: 4, y0: 0, y1: 4.5 }], 'metal', 'metal');
      B.box(wx0 - 0.3, wh, wz0 - 0.3, wx0 + ww + 0.3, wh + 0.2, wz0 + wd + 0.3, 'metal', 'metalRust');
      B.box(wx0 + 0.2, 3.6, wz0 + 0.2, wx0 + 6, 3.8, wz0 + wd - 0.2, 'steel', 'steel'); // mezzanine
      B.box(wx0 + 5.9, 3.8, wz0 + 0.2, wx0 + 6, 4.85, wz0 + wd - 0.2, 'steel', 'steel');
      B.stairs(wx0 + 6, wz0 + 1.2, '+x', 3.6, 1.2, 'steel');
      for (let i = 0; i < 4; i++) B.box(wx0 + 9 + (i % 2) * 5, 0, wz0 + 3 + ((i / 2) | 0) * 9, wx0 + 11.2 + (i % 2) * 5, 1.4 + R() * 1.2, wz0 + 5.2 + ((i / 2) | 0) * 9, 'wood', 'wood'); // pallets
      // --- the office (C): two storeys of block with stairs inside ---
      B.house(34, -8, 14, 12, { floors: 2, h: 3.4, doors: [['w', 5], ['n', 3], ['s', 9]], wins: [['n', 7], ['n', 10.5], ['s', 3], ['e', 4], ['e', 8], ['n', 3, 1], ['n', 7, 1], ['n', 10.5, 1], ['s', 3, 1], ['s', 9, 1], ['w', 3, 1], ['w', 8, 1], ['e', 6, 1]], lk: 'block', roofLk: 'concrete0', hole: [44.2, -7.6, 47.6, -3.4], stairs: [46, -7.6, '+z', 3.4, 1.5, 'concrete0'] });
      B.wall(39, -3.4, 5, 'x', 3.4, 0.15, [{ at: 1.5, w: 1.0, y0: 0, y1: 2.2 }], 'block', 'block'); // an inside room
      B.box(36, 0, -6, 38.4, 0.8, -5, 'wood', 'wood'); B.box(36, 3.65, 0, 38.4, 4.45, 1, 'wood', 'wood'); // desks
      // --- the container yard (B) ---
      const rows = [[-26, 0], [-16, 0], [-6, 0], [6, 0], [16, 0], [26, 0]];
      for (const [x] of rows) {
        for (let k = 0; k < 4; k++) {
          const z = -34 + k * 20 + (R() - 0.5) * 4;
          if (Math.abs(x) < 8 && Math.abs(z) < 10) continue; // the middle stays open (B)
          const col = (R() * 6) | 0;
          if (R() < 0.18) B.tunnel(x, z, false, 12.2, col); else B.container(x, z, false, 12.2, 0, col);
          if (R() < 0.55) B.container(x + (R() - 0.5) * 0.3, z + (R() - 0.5) * 2, false, R() < 0.5 ? 12.2 : 6.1, 2.6, (R() * 6) | 0);
          if (R() < 0.2) B.container(x, z, false, 6.1, 5.2, (R() * 6) | 0);
        }
      }
      // B: a ring of single containers and crates around the middle
      B.container(0, -7, true, 6.1, 0, 3); B.container(0, 7, true, 6.1, 0, 1); B.container(-1.5, -7, true, 6.1, 2.6, 4);
      B.box(-2, 0, -1, -0.6, 1.3, 1, 'wood', 'wood'); B.box(1.5, 0, -2, 2.8, 1.1, -0.4, 'wood', 'wood');
      B.stairs(3.2, -8.22, '+x', 2.6, 1.0, 'steel');
      // reach stacker, forklifts (as solid machines)
      B.box(-11, 0, 18, -8.5, 2.6, 22.5, 'steel', 'yellow'); B.box(-10.5, 2.6, 18.5, -9, 3.4, 20, 'steel', 'yellow');
      B.box(11, 0, -22, 12.4, 2.1, -19.6, 'steel', 'yellow');
      // spawns: a gatehouse north, a quay south with bollards
      B.house(-34, -47, 6, 4, { doors: [['s', 2.4]], wins: [['n', 2], ['e', 1.5], ['w', 1.5]], lk: 'block', h: 2.9, parapet: 0 });
      for (let x = -40; x <= 40; x += 8) B.box(x - 0.3, 0, 46.2, x + 0.3, 0.7, 46.8, 'steel', 'steel');
      B.box(-60, 0, 48.5, 60, 0.5, 50, 'concrete', 'concrete0'); // the quay edge
      // the cranes (decor; legs are solid)
      const yellowM = std({ color: 0xd8a21c, roughness: 0.6, metalness: 0.4 });
      for (const cx of [-30, 8]) {
        for (const [lx, lz] of [[-5, 41], [5, 41], [-5, 49], [5, 49]]) B.box(cx + lx - 0.4, 0, lz - 0.4, cx + lx + 0.4, 24, lz + 0.4, 'steel', 'yellow');
        const top = new THREE.Mesh(new THREE.BoxGeometry(12, 2.4, 10), yellowM); top.position.set(cx, 25.2, 45); top.castShadow = true; decor.add(top);
        const boom = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 60), yellowM); boom.position.set(cx, 26.8, 40); boom.castShadow = true; decor.add(boom);
        const cab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2, 2.4), std({ color: 0x334, roughness: 0.4 })); cab.position.set(cx, 23.5, 30); decor.add(cab);
      }
      // light masts
      const lampM = std({ color: 0x555a5e, metalness: 0.6, roughness: 0.5 });
      for (const [x, z] of [[-40, -30], [40, -30], [-40, 30], [40, 30], [0, -30], [0, 30]]) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 20, 8), lampM); m.position.set(x, 10, z); m.castShadow = true; decor.add(m); const h = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 0.6), std({ color: 0xfff6d8, emissive: 0xfff2c8, emissiveIntensity: 1.2 })); h.position.set(x, 20, z); decor.add(h); }
      // perimeter fence
      for (const sx of [-1, 1]) B.wall(sx * 59.6, -49, 98, 'z', 3, 0.3, [], 'block', 'block');
      B.wall(-60, -49.6, 120, 'x', 3, 0.3, [{ at: 52, w: 8, y0: 0, y1: 3 }], 'block', 'block');
      // ---- the yard: barriers, pallets, drums, reels, puddles, lane markings ----
      for (const [x, z, r] of [[-20, -38, 0], [-17.9, -38, 0], [20, -38, 0], [22.1, -38, 0], [-30, 8, 1], [30, -6, 1], [-12, 30, 0], [12, 32, 0], [36, 18, 1], [-44, -20, 1]]) {
        if (!B.free(x, z, 1.1)) continue;
        B.prop('barrier', x, 0, z, r ? Math.PI / 2 : 0, 1, null, r ? [1.0, 0.3, 0.81, 'concrete'] : [0.3, 1.0, 0.81, 'concrete']);
      }
      for (let i = 0; i < 70; i++) {
        const x = (R() - 0.5) * 112, z = (R() - 0.5) * 92, k = R();
        if (k < 0.25) { if (B.free(x, z, 0.8)) { const n = 1 + ((R() * 6) | 0); for (let t = 0; t < n; t++) B.prop('pallet', x, t * 0.145, z, (R() < 0.5 ? 0 : Math.PI / 2) + (R() - 0.5) * 0.1, 1); B.solid(x - 0.6, 0, z - 0.6, x + 0.6, n * 0.145, z + 0.6, 'wood'); } }
        else if (k < 0.45) { if (B.free(x, z, 0.4)) B.prop('barrel', x, 0, z, R() * 6, 1, [0x2e4e7a, 0x7a2e24, 0x2e5a34, 0xb08a24][(R() * 4) | 0], [0.29, 0.29, 0.88]); }
        else if (k < 0.55) { if (B.free(x, z, 0.8)) B.prop('reel', x, 0, z, R() * 6, 0.8 + R() * 0.4, null, [0.6, 0.6, 1.4, 'wood']); }
        else if (k < 0.75) { if (B.free(x, z, 1.5)) B.prop('puddle', x, 0, z, R() * 6, [1 + R() * 2.5, 1, 0.6 + R() * 1.5]); }
        else if (k < 0.85) { if (B.free(x, z, 0.6)) B.prop('crate', x, 0, z, R() * 0.4, 0.7 + R() * 0.5, null, [0.4, 0.4, 0.8, 'wood']); }
        else { if (B.free(x, z, 0.4)) for (let t = 0; t < 1 + R() * 4; t++) B.prop('tire', x, t * 0.21, z, R() * 6, 1); }
      }
      // painted lane lines down the aisles
      for (const x of [-11, 0, 11, 21]) for (let z = -40; z < 44; z += 5) if (B.free(x, z, 0.1)) B.prop('line', x, 0, z, 0, 1);
      return {
        size: [120, 100],
        spawns: [
          [[-3, -44], [3, -44], [-10, -44], [10, -44], [-18, -43], [18, -43], [0, -40], [-25, -44], [25, -44]],
          [[-3, 44], [3, 44], [-12, 43], [12, 43], [-20, 44], [20, 44], [0, 40], [-36, 43], [36, 43]],
        ],
        ffa: [[-50, -40], [50, -40], [-50, 40], [50, 40], [0, -42], [0, 42], [-38, 0], [40, 10], [-20, -20], [20, 20], [-20, 20], [20, -20], [-10, 0], [12, 0], [0, 15]],
        flags: [{ name: 'A', x: -39, z: 0, r: 6 }, { name: 'B', x: 0, z: 0, r: 5.5 }, { name: 'C', x: 41, z: -2, r: 6 }],
      };
    },
  },
};
export const MAP_LIST = Object.entries(MAP_DEFS).map(([id, d]) => ({ id, name: d.name, desc: d.desc }));

// static decor (palms, poles, stalls, cars, cranes) merged into one mesh per material: hundreds of draw calls become a few
function mergeStatic(group) {
  group.updateMatrixWorld(true);
  const by = new Map(), drop = [];
  group.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.material.transparent && !o.material.alphaTest) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv || !g.attributes.normal) return;
    const key = o.material; if (!by.has(key)) by.set(key, { list: [], shadow: o.castShadow });
    by.get(key).list.push(g); drop.push(o);
  });
  for (const o of drop) o.removeFromParent();
  for (const [m, { list, shadow }] of by) { const merged = mergeGeometries(list); if (!merged) continue; const mesh = new THREE.Mesh(merged, m); mesh.castShadow = shadow; mesh.receiveShadow = true; group.add(mesh); for (const g of list) g.dispose(); }
  // empty groups left behind
  const empties = []; group.traverse((o) => { if (o !== group && !o.isMesh && !o.isLine && !o.isSprite && !o.isInstancedMesh && !o.children.length) empties.push(o); }); for (const o of empties) o.removeFromParent();
}

// ---------- photo-scanned surfaces (js/photo.js) ----------
// which photo set each look uses; 'relief' = keep the painted colour map, take only the surface (containers)
const PHOTO_OF = { plaster0: 'plaster2', plaster1: 'plaster', plaster2: 'plaster2', plaster3: 'plaster2', plaster4: 'plaster2', concrete0: 'concrete', block: 'block', tile: 'floor', wood: 'planks', metal: 'corr', metalRust: 'corrRust', steel: 'metal' };
for (let i = 0; i < 6; i++) PHOTO_OF['cont' + i] = 'container:relief';
const PLASTER_TINT = [0xcdb896, 0xc2a67e, 0xd6c8ad, 0xb39a78, 0xbfae92];
export function applyPhotos(W, P) {
  if (!W || !P || W.photos) return false;
  W.photos = true;
  const white = new THREE.Color(0xffffff);
  for (const [key, L] of W.looks) {
    const spec = PHOTO_OF[key]; if (!spec) continue;
    const [pk, mode] = spec.split(':'), T = P[pk], m = L.mat; if (!T || !m) continue;
    if (mode !== 'relief') { m.map = T.d; const tint = key.startsWith('plaster') ? PLASTER_TINT[+key.slice(7)] : null; m.color.copy(white); if (tint) { const c = new THREE.Color(tint); c.multiplyScalar(1 / Math.max(c.r, c.g, c.b)); m.color.lerp(c, 0.3); } if (pk === 'plaster') m.color.multiplyScalar(1.55); /* the clay scan is dark: lift it to sun-bleached */ }
    m.normalMap = T.n; m.normalScale = new THREE.Vector2(1, 1);
    m.roughnessMap = T.a; m.roughness = 1; m.aoMap = T.a; m.aoMapIntensity = 0.8;
    if (pk === 'metal' || pk === 'corr' || pk === 'corrRust' || pk === 'container') { m.metalnessMap = T.a; m.metalness = pk === 'container' ? 0.5 : 1; }
    m.needsUpdate = true;
  }
  // the ground: sand or asphalt, a tile every 3 m
  const g = W.ground, gk = W.def.ground === 'asphalt' ? 'asphalt' : 'sand', T = P[gk];
  if (g && T) {
    const n = (W.size[0] + 200) / 3, rep = (t) => { const c = t.clone(); c.repeat.set(n, n); c.needsUpdate = true; return c; };
    g.material.map = rep(T.d); g.material.normalMap = rep(T.n); g.material.roughnessMap = rep(T.a); g.material.aoMap = g.material.roughnessMap; g.material.roughness = 1; g.material.color.setHex(0xffffff); g.material.needsUpdate = true;
  }
  return true;
}

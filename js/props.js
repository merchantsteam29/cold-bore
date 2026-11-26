// Small things that make a place look lived in: drums, tyres, rocks, scrub, water tanks, dishes, AC units,
// rubbish, pallets, jersey barriers, cable reels, puddles, road lines. Each kind is one InstancedMesh, so a
// hundred drums cost one draw call. The map code places them with B.prop() (world.js).
import * as THREE from 'three';
import * as TX from './tex.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const cache = new Map();
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
function merge(parts) {
  return mergeGeometries(parts.map(([g, m]) => { const n = g.index ? g.toNonIndexed() : g; n.applyMatrix4(m); for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k); return n; }));
}
const geo = (g, f) => { f(g); return g; };

function def(kind, std) {
  if (cache.has(kind)) return cache.get(kind);
  let d = null;
  switch (kind) {
    case 'barrel': { // a 55-gallon drum with its rolling hoops
      const g = merge([[new THREE.CylinderGeometry(0.29, 0.29, 0.88, 20), M(0, 0.44)], [new THREE.TorusGeometry(0.292, 0.012, 5, 20), M(0, 0.3, 0, Math.PI / 2)], [new THREE.TorusGeometry(0.292, 0.012, 5, 20), M(0, 0.6, 0, Math.PI / 2)]]);
      const map = canvasTex(128, 128, (c, w, h) => { c.fillStyle = '#ddd'; c.fillRect(0, 0, w, h); for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(110,55,20,${0.1 + Math.random() * 0.3})`; c.beginPath(); c.arc(Math.random() * w, Math.random() * h, 2 + Math.random() * 10, 0, 7); c.fill(); } c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, 0, w, 6); });
      d = { geo: g, mat: std({ map, roughness: 0.6, metalness: 0.5 }) }; break;
    }
    case 'tire': d = { geo: geo(new THREE.TorusGeometry(0.3, 0.11, 8, 18), (g) => { g.rotateX(Math.PI / 2); g.translate(0, 0.11, 0); }), mat: std({ color: 0x161616, roughness: 0.95 }) }; break;
    case 'rock': d = { geo: geo(new THREE.DodecahedronGeometry(0.3, 0), (g) => { g.scale(1, 0.6, 0.9); g.translate(0, 0.08, 0); }), mat: std({ color: 0x9a8a72, roughness: 1, flatShading: true }) }; break;
    case 'rubble': d = { geo: geo(new THREE.DodecahedronGeometry(0.16, 0), (g) => g.translate(0, 0.06, 0)), mat: std({ color: 0xb3a387, roughness: 1, flatShading: true }) }; break;
    case 'shrub': { // dry desert scrub: three crossed cards
      const map = canvasTex(128, 128, (c, w, h) => {
        c.strokeStyle = '#6b5a3a'; c.lineCap = 'round';
        for (let i = 0; i < 40; i++) {
          const x = w / 2 + (Math.random() - 0.5) * 20; c.lineWidth = 1 + Math.random() * 2; c.beginPath(); c.moveTo(x, h);
          let px = x, py = h; for (let k = 0; k < 5; k++) { px += (Math.random() - 0.5) * 30; py -= 12 + Math.random() * 14; c.lineTo(px, py); }
          c.stroke(); c.fillStyle = Math.random() < 0.5 ? '#7d7a45' : '#8c7a4c';
          for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(px + (Math.random() - 0.5) * 12, py + (Math.random() - 0.5) * 12, 3, 0, 7); c.fill(); }
        }
      });
      d = { geo: merge([0, 1, 2].map((i) => [new THREE.PlaneGeometry(1, 0.8), M(0, 0.4, 0, 0, i * Math.PI / 3)])), mat: std({ map, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 }) }; break;
    }
    case 'tank': d = { geo: merge([[new THREE.CylinderGeometry(0.55, 0.55, 1.1, 18), M(0, 0.75)], [new THREE.CylinderGeometry(0.12, 0.12, 0.08, 10), M(0, 1.34)], [new THREE.BoxGeometry(1.1, 0.2, 1.1), M(0, 0.1)]]), mat: std({ color: 0x232527, roughness: 0.5 }) }; break;
    case 'dish': d = { geo: merge([[new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6), M(0, 0.3)], [new THREE.SphereGeometry(0.35, 14, 6, 0, Math.PI * 2, 0, 0.5), M(0, 0.7, 0, -1.1)], [new THREE.CylinderGeometry(0.01, 0.01, 0.4, 4), M(0, 0.7, -0.2, -0.4)]]), mat: std({ color: 0xd8d8d2, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide }) }; break;
    case 'ac': { // an air conditioner on a wall: back against the wall at local +Z
      const map = canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#c9c6bc'; c.fillRect(0, 0, w, h); c.fillStyle = '#6f6c66'; for (let y = 8; y < h - 6; y += 5) c.fillRect(6, y, w - 12, 2); c.fillStyle = 'rgba(90,60,30,0.3)'; c.fillRect(0, h - 10, w, 10); });
      d = { geo: geo(new THREE.BoxGeometry(0.75, 0.5, 0.45), (g) => g.translate(0, 0.25, -0.225)), mat: std({ map, roughness: 0.7, metalness: 0.3 }) }; break;
    }
    case 'bag': d = { geo: geo(new THREE.SphereGeometry(0.28, 10, 8), (g) => { g.scale(1, 0.75, 0.9); g.translate(0, 0.18, 0); }), mat: std({ color: 0x141414, roughness: 0.35 }) }; break;
    case 'pallet': d = { geo: merge([...[0, 1, 2, 3, 4].map((i) => [new THREE.BoxGeometry(1.2, 0.025, 0.14), M(0, 0.13, -0.42 + i * 0.21)]), ...[-1, 0, 1].map((i) => [new THREE.BoxGeometry(0.1, 0.12, 1.0), M(i * 0.55, 0.06)])]), mat: std({ map: TX.woodPlanks(0x9a7a50, 21).map, roughness: 0.9 }) }; break;
    case 'barrier': { // a jersey barrier: wide foot, sloped sides, 2 m long along local Z
      const sh = new THREE.Shape(); sh.moveTo(-0.3, 0); sh.lineTo(0.3, 0); sh.lineTo(0.3, 0.08); sh.lineTo(0.12, 0.3); sh.lineTo(0.1, 0.81); sh.lineTo(-0.1, 0.81); sh.lineTo(-0.12, 0.3); sh.lineTo(-0.3, 0.08); sh.closePath();
      d = { geo: geo(new THREE.ExtrudeGeometry(sh, { depth: 2.0, bevelEnabled: false }), (g) => g.translate(0, 0, -1.0)), mat: std({ map: TX.concrete(33).map, roughness: 0.9 }) }; break;
    }
    case 'reel': d = { geo: merge([[new THREE.CylinderGeometry(0.7, 0.7, 0.06, 20), M(0, 0.7, -0.4, Math.PI / 2)], [new THREE.CylinderGeometry(0.7, 0.7, 0.06, 20), M(0, 0.7, 0.4, Math.PI / 2)], [new THREE.CylinderGeometry(0.45, 0.45, 0.76, 16), M(0, 0.7, 0, Math.PI / 2)]]), mat: std({ map: TX.woodPlanks(0x8a6a44, 23).map, roughness: 0.85 }) }; break;
    case 'puddle': d = { geo: geo(new THREE.CircleGeometry(1, 20), (g) => { g.rotateX(-Math.PI / 2); g.translate(0, 0.012, 0); }), mat: std({ color: 0x1b1d1f, roughness: 0.04, metalness: 0.6, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -1 }), noShadow: true }; break;
    case 'line': d = { geo: geo(new THREE.PlaneGeometry(0.15, 3), (g) => { g.rotateX(-Math.PI / 2); g.translate(0, 0.011, 0); }), mat: std({ color: 0xd8b632, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -1 }), noShadow: true }; break;
    case 'crate': d = { geo: geo(new THREE.BoxGeometry(1, 1, 1), (g) => g.translate(0, 0.5, 0)), mat: std({ map: TX.woodPlanks(0x7a5a3a, 12).map, roughness: 0.85 }) }; break;
  }
  cache.set(kind, d); return d;
}

export function buildProps(insts, parent, std) {
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color(), Y = new THREE.Vector3(0, 1, 0);
  for (const [kind, list] of Object.entries(insts)) {
    const d = def(kind, std); if (!d || !list.length) continue;
    const im = new THREE.InstancedMesh(d.geo, d.mat, list.length);
    list.forEach((p, i) => {
      q.setFromAxisAngle(Y, p.rot); const s = typeof p.sc === 'number' ? sc.setScalar(p.sc) : sc.set(...p.sc);
      m.compose(v.set(p.x, p.y, p.z), q, s); im.setMatrixAt(i, m);
      im.setColorAt(i, col.setHex(p.color ?? 0xffffff));
    });
    im.castShadow = !d.noShadow; im.receiveShadow = true; im.computeBoundingSphere();
    parent.add(im);
  }
}

// Blood. One instanced mesh holds every flying drop, one every splat on floors and walls (one draw call each),
// sprites make the pink mist a hit throws out, pools spread slowly under the dead, and loose pieces
// (gibs, a helmet knocked off) get simple physics. `level` is the gore setting, 0..1: 0 is no blood at all.
import * as THREE from 'three';
import * as TX from './tex.js';

const MAX_DROPS = 900, MAX_SPLATS = 160, MAX_MIST = 60;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

export function createGore(scene, groundY) {
  const G = { level: 0.8 };
  const dropMat = new THREE.MeshStandardMaterial({ color: 0x4e0202, roughness: 0.2, metalness: 0.1 });
  const drops = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.012, 0), dropMat, MAX_DROPS);
  drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage); drops.count = 0; drops.frustumCulled = false; scene.add(drops);
  const D = Array.from({ length: MAX_DROPS }, () => ({ on: false, p: new THREE.Vector3(), v: new THREE.Vector3(), s: 1, t: 0 }));
  const mkSplat = (wall) => { const m = new THREE.MeshStandardMaterial({ map: TX.splat(wall ? 5 : 3, wall), transparent: true, depthWrite: false, roughness: 0.25, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: -2 }); const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), m, MAX_SPLATS); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.count = 0; im.frustumCulled = false; im.renderOrder = 1; scene.add(im); return im; };
  const floorS = mkSplat(false), wallS = mkSplat(true);
  const poolM = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ map: TX.poolTex(), transparent: true, depthWrite: false, roughness: 0.08, metalness: 0.2, polygonOffset: true, polygonOffsetFactor: -3 }), 40);
  poolM.instanceMatrix.setUsage(THREE.DynamicDrawUsage); poolM.count = 0; poolM.frustumCulled = false; poolM.renderOrder = 1; scene.add(poolM);
  const SF = [], SW = [], PO = []; let dirty = true, dropHead = 0, live = 0;
  // mist: a short-lived red cloud
  const mistTex = TX.puff('120,8,8');
  const mist = Array.from({ length: MAX_MIST }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, transparent: true, depthWrite: false, opacity: 0 })); s.visible = false; scene.add(s); return { s, t: 9, life: 1, v: new THREE.Vector3(), size: 1 }; });
  let mistHead = 0;
  const parts = [];

  function spray(at, dir, n = 30, speed = 4, spread = 0.6) {
    n = Math.round(n * G.level); if (!n) return;
    for (let i = 0; i < n; i++) {
      const d = D[dropHead]; dropHead = (dropHead + 1) % MAX_DROPS;
      if (!d.on) live++;
      d.on = true; d.t = 0; d.s = 0.5 + Math.random() * 1.8;
      d.p.copy(at);
      d.v.copy(dir).normalize().multiplyScalar(speed * (0.3 + Math.random() * 0.9));
      d.v.x += (Math.random() - 0.5) * speed * spread; d.v.y += (Math.random() - 0.35) * speed * spread; d.v.z += (Math.random() - 0.5) * speed * spread;
    }
  }
  function puff(at, dir, size = 0.5, life = 0.5) {
    if (G.level <= 0.05) return;
    const m = mist[mistHead]; mistHead = (mistHead + 1) % MAX_MIST;
    m.s.position.copy(at); m.v.copy(dir).multiplyScalar(1.2 + Math.random()); m.t = 0; m.life = life * (0.7 + Math.random() * 0.6); m.size = size * (0.7 + Math.random() * 0.5) * (0.5 + G.level * 0.5);
    m.s.visible = true; m.s.material.rotation = Math.random() * 6;
  }
  // a stain: n = the surface normal (UP for floors)
  function splat(at, size = 0.4, n = UP) {
    if (G.level <= 0.05) return;
    const wall = Math.abs(n.y) < 0.5, L = wall ? SW : SF;
    const s = L.length < MAX_SPLATS ? {} : L.shift();
    Object.assign(s, { p: at.clone().addScaledVector(n, 0.006), n: n.clone(), size: size * (0.6 + G.level * 0.4), rot: wall ? (Math.random() - 0.5) * 0.4 : Math.random() * 6.28 });
    L.push(s); dirty = true;
  }
  function pool(at, max = 1.3, rate = 0.12) {
    if (G.level <= 0.2) return null;
    const s = PO.length < 40 ? {} : PO.shift();
    Object.assign(s, { p: at.clone(), size: 0.05, max: max * (0.6 + G.level * 0.4), rate, rot: Math.random() * 6.28 });
    s.p.y += 0.005 + PO.length * 0.0004; PO.push(s); dirty = true; return s;
  }
  // an object (a gib, a helmet, a hand) flying loose
  function loose(obj, vel, spin = 6, bleed = true) {
    obj.updateMatrixWorld(true);
    scene.attach(obj);
    parts.push({ o: obj, v: vel.clone(), w: new THREE.Vector3((Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin), rest: false, bleed: bleed && G.level > 0.3, bt: 0 });
    while (parts.length > 60) { const pt = parts.shift(); pt.o.removeFromParent(); }
  }
  const gibGeo = new THREE.IcosahedronGeometry(0.035, 0), gibMat = new THREE.MeshStandardMaterial({ map: TX.meat(), roughness: 0.4 }), boneMat = new THREE.MeshStandardMaterial({ color: 0xd8ccb0, roughness: 0.6 });
  function gib(at, dir, n = 10, speed = 3) {
    n = Math.round(n * G.level); if (!n) return;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(gibGeo, i % 4 === 0 ? boneMat : gibMat); m.scale.set(0.5 + Math.random(), 0.4 + Math.random() * 0.8, 0.5 + Math.random()); m.position.copy(at); m.castShadow = true; scene.add(m);
      loose(m, _p.set(dir.x * speed + (Math.random() - 0.5) * 3, 1 + Math.random() * 3, dir.z * speed + (Math.random() - 0.5) * 3), 14, i % 3 === 0);
    }
  }
  // a hit on someone: the round goes in, maybe out the other side, and blood goes where it would
  // cal.mist = how violent (from the calibre), through = the bullet came out the back
  function hit(at, dir, mistAmt = 1, through = false, W = null, rayWall = null) {
    if (G.level <= 0) return;
    const k = mistAmt;
    puff(at.clone().addScaledVector(dir, -0.05), dir.clone().multiplyScalar(-0.4), 0.25 + 0.15 * k, 0.35);
    spray(at, dir.clone().multiplyScalar(-0.6).add(UP.clone().multiplyScalar(0.3)), 4 + 4 * k, 1.5, 0.8);
    if (through) {
      puff(at.clone().addScaledVector(dir, 0.25), dir, 0.4 + 0.3 * k, 0.5 + 0.2 * k);
      spray(at.clone().addScaledVector(dir, 0.2), dir, 10 + 14 * k, 3 + k * 2, 0.35);
      // the wall behind gets painted
      if (rayWall) { const h = rayWall(at.clone().addScaledVector(dir, 0.3), dir, 3.5); if (h) splat(h.point, 0.35 + 0.25 * k * (1 - h.t / 4), h.normal); }
    }
    void W;
  }

  function update(dt, camPos) {
    if (live > 0) {
      let k = 0;
      for (const d of D) {
        if (!d.on) continue;
        d.t += dt; d.v.y -= 9.8 * dt; d.p.addScaledVector(d.v, dt);
        const gy = groundY(d.p.x, d.p.z, d.p.y + 0.3);
        if (d.p.y <= gy || d.t > 2.5) {
          d.on = false; live--;
          if (d.p.y <= gy && Math.random() < 0.22) splat(_p.set(d.p.x, gy, d.p.z), 0.05 + Math.random() * 0.14);
          continue;
        }
        _s.set(d.s, d.s * (1 + Math.min(2.5, d.v.length() * 0.35)), d.s);
        _q.setFromUnitVectors(UP, _p.copy(d.v).normalize());
        _m.compose(d.p, _q, _s); drops.setMatrixAt(k++, _m);
      }
      drops.count = k; drops.instanceMatrix.needsUpdate = true;
    } else drops.count = 0;
    drops.visible = drops.count > 0;
    for (const m of mist) {
      if (!m.s.visible) continue;
      m.t += dt; const f = m.t / m.life;
      if (f >= 1) { m.s.visible = false; continue; }
      m.s.position.addScaledVector(m.v, dt); m.v.multiplyScalar(1 - dt * 3); m.v.y -= dt * 0.3;
      m.s.scale.setScalar(m.size * (0.5 + f * 1.4)); m.s.material.opacity = (1 - f) * 0.85;
    }
    for (const s of PO) if (s.size < s.max) { s.size = Math.min(s.max, s.size + s.rate * dt * (1.2 - s.size / s.max)); dirty = true; }
    if (dirty) {
      dirty = false;
      const put = (im, L, flat) => {
        L.forEach((s, i) => {
          if (flat) _q.setFromUnitVectors(Z, UP); else _q.setFromUnitVectors(Z, s.n);
          _q.multiply(new THREE.Quaternion().setFromAxisAngle(Z, s.rot));
          _m.compose(s.p, _q, _s.set(s.size, s.size, 1)); im.setMatrixAt(i, _m);
        });
        im.count = L.length; im.instanceMatrix.needsUpdate = true; im.visible = L.length > 0;
      };
      put(floorS, SF, false); put(wallS, SW, false); put(poolM, PO, true);
    }
    for (const pt of parts) {
      if (pt.rest) continue;
      pt.v.y -= 9.8 * dt; pt.o.position.addScaledVector(pt.v, dt);
      pt.o.rotation.x += pt.w.x * dt; pt.o.rotation.y += pt.w.y * dt; pt.o.rotation.z += pt.w.z * dt;
      const gy = groundY(pt.o.position.x, pt.o.position.z, pt.o.position.y + 0.3) + 0.03;
      if (pt.o.position.y < gy) {
        pt.o.position.y = gy;
        if (Math.abs(pt.v.y) > 1.5) { pt.v.y *= -0.25; if (pt.bleed) splat(_p.set(pt.o.position.x, gy - 0.03, pt.o.position.z), 0.15 + Math.random() * 0.2); }
        else pt.v.y = 0;
        pt.v.x *= 0.55; pt.v.z *= 0.55; pt.w.multiplyScalar(0.5);
        if (pt.v.lengthSq() < 0.04) pt.rest = true;
      }
      if (pt.bleed && (pt.bt -= dt) < 0) { pt.bt = 0.06; spray(pt.o.position, pt.v.clone().multiplyScalar(-0.1).add(UP), 1, 0.6, 1); }
    }
    void camPos;
  }
  function clear() {
    for (const d of D) d.on = false; live = 0; drops.count = 0;
    SF.length = SW.length = PO.length = 0; dirty = true;
    for (const m of mist) m.s.visible = false;
    for (const pt of parts) pt.o.removeFromParent(); parts.length = 0;
  }
  return Object.assign(G, { spray, puff, splat, pool, loose, gib, hit, update, clear });
}

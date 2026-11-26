// Effects: tracers, muzzle flashes, dust and sparks where rounds hit, bullet holes, brass, grenade smoke,
// explosions. Pools of objects allocated once; instanced meshes for anything there can be many of.
import * as THREE from 'three';
import * as TX from './tex.js';
import { caseGeo, caseMat } from './guns.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const Z = new THREE.Vector3(0, 0, 1), UP = new THREE.Vector3(0, 1, 0);
const DUST = { stone: '190,180,160', dust: '170,140,100', dirt: '150,120,85', wood: '140,100,60', metal: '200,200,200', sand: '185,160,120', concrete: '170,168,160' };

export function createFX(scene, groundY) {
  // ---- tracers: thin glowing streaks ----
  const trGeo = new THREE.BoxGeometry(0.012, 0.012, 1); trGeo.translate(0, 0, -0.5);
  const trMat = new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const tracers = Array.from({ length: 40 }, () => { const m = new THREE.Mesh(trGeo, trMat); m.visible = false; m.frustumCulled = false; scene.add(m); return { m, path: null, t: 0, speed: 0, len: 0, total: 0, seg: 0 }; });
  let trHead = 0;
  // ---- muzzle flashes: a sprite + one shared light ----
  const flashMat = new THREE.SpriteMaterial({ map: TX.flashTex(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false });
  const flashes = Array.from({ length: 16 }, () => { const s = new THREE.Sprite(flashMat.clone()); s.visible = false; scene.add(s); return { s, t: 0 }; });
  let flHead = 0;
  const flashLight = new THREE.PointLight(0xffb060, 0, 9, 2); scene.add(flashLight); let flashT = 0;
  // ---- puffs (dust, smoke) ----
  const puffs = Array.from({ length: 140 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.puff(), transparent: true, depthWrite: false, opacity: 0 })); s.visible = false; scene.add(s); return { s, t: 0, life: 1, v: new THREE.Vector3(), size: 1, grow: 1, op: 0.6 }; });
  let pfHead = 0;
  const puffTexes = {}; const ptex = (c) => puffTexes[c] || (puffTexes[c] = TX.puff(c));
  // ---- sparks ----
  const spGeo = new THREE.BufferGeometry(), SPN = 300, spPos = new Float32Array(SPN * 3);
  spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
  const sparks = new THREE.Points(spGeo, new THREE.PointsMaterial({ color: 0xffd090, size: 0.04, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }));
  sparks.frustumCulled = false; scene.add(sparks);
  const SP = Array.from({ length: SPN }, () => ({ on: false, p: new THREE.Vector3(), v: new THREE.Vector3(), t: 0 })); let spHead = 0;
  // ---- bullet holes ----
  const holeMats = { stone: TX.bulletHole('stone'), metal: TX.bulletHole('metal') };
  const holes = {};
  for (const k of ['stone', 'metal']) { const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ map: holeMats[k], transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 1 }), 220); im.count = 0; im.frustumCulled = false; im.renderOrder = 1; scene.add(im); holes[k] = { im, list: [] }; }
  // ---- brass ----
  const brass = new THREE.InstancedMesh(caseGeo, caseMat(), 120); brass.instanceMatrix.setUsage(THREE.DynamicDrawUsage); brass.count = 0; brass.frustumCulled = false; scene.add(brass);
  const BR = []; // { p, v, r, w, rest, t }
  // ---- smoke clouds (smoke grenades) ----
  const clouds = []; // { p, r, t, life, sprites: [] }
  const smokeTex = TX.puff('205,205,200');

  function tracer(path, speed = 900, color = 0xffc070) {
    const T = tracers[trHead]; trHead = (trHead + 1) % tracers.length;
    T.path = path; T.t = 0; T.speed = Math.min(speed, 700); T.len = speed > 600 ? 4 : 2; T.seg = 0;
    T.total = path.reduce((s, [a, b]) => s + a.distanceTo(b), 0); T.m.visible = true; T.m.material = trMat; void color;
  }
  function muzzle(pos, dir, big = 1, suppressed = false) {
    if (suppressed) { puff(pos, dir.clone().multiplyScalar(0.5), '200,200,200', 0.12, 0.4, 0.2); return; }
    const F = flashes[flHead]; flHead = (flHead + 1) % flashes.length;
    F.s.position.copy(pos).addScaledVector(dir, 0.04 * big); F.s.scale.setScalar(0.22 * big * (0.8 + Math.random() * 0.4)); F.s.material.rotation = Math.random() * 6; F.s.visible = true; F.t = 0.045;
    flashLight.position.copy(pos); flashLight.intensity = 6 * big; flashT = 0.05;
    puff(pos, dir.clone().multiplyScalar(0.8), '210,205,195', 0.15 * big, 0.6, 0.18);
  }
  function puff(at, vel, col = '190,180,160', size = 0.3, life = 1, op = 0.55, grow = 1.6) {
    const P = puffs[pfHead]; pfHead = (pfHead + 1) % puffs.length;
    P.s.material.map = ptex(col); P.s.position.copy(at); P.v.copy(vel); P.t = 0; P.life = life * (0.8 + Math.random() * 0.4); P.size = size; P.grow = grow; P.op = op; P.s.visible = true; P.s.material.rotation = Math.random() * 6;
  }
  function spark(at, n = 8, dir = UP, sp = 4) {
    for (let i = 0; i < n; i++) { const S = SP[spHead]; spHead = (spHead + 1) % SPN; S.on = true; S.t = 0.3 + Math.random() * 0.3; S.p.copy(at); S.v.copy(dir).multiplyScalar(sp * Math.random()).add(_p.set((Math.random() - 0.5) * sp, Math.random() * sp * 0.6, (Math.random() - 0.5) * sp)); }
  }
  // where a round hits something solid
  function impact(point, normal, mat, exit = false) {
    const fx = { plaster: 'stone', concrete: 'concrete', block: 'stone', metal: 'metal', container: 'metal', wood: 'wood', sand: 'sand', steel: 'metal' }[mat] || 'stone';
    const col = DUST[fx] || DUST.stone;
    puff(point.clone().addScaledVector(normal, 0.05), normal.clone().multiplyScalar(exit ? 1.5 : 0.8).add(_p.set(0, 0.3, 0)), col, exit ? 0.2 : 0.14, 0.9, 0.7, 2.2);
    if (fx !== 'metal') for (let i = 0; i < 2; i++) puff(point.clone().addScaledVector(normal, 0.05), normal.clone().multiplyScalar(2 + Math.random() * 2).add(_p.set((Math.random() - 0.5), Math.random(), (Math.random() - 0.5))), col, 0.05, 0.5, 0.9, 1.2);
    if (fx === 'metal') spark(point, 10, normal, 4);
    if (mat !== 'sand' && normal) hole(point, normal, fx === 'metal' ? 'metal' : 'stone', exit ? 0.14 : 0.08);
  }
  function hole(point, normal, kind, size) {
    const H = holes[kind]; const s = H.list.length < 220 ? {} : H.list.shift();
    Object.assign(s, { p: point.clone().addScaledVector(normal, 0.004), n: normal.clone(), size: size * (0.8 + Math.random() * 0.5), rot: Math.random() * 6 });
    H.list.push(s); H.dirty = true;
  }
  function eject(pos, dir, right, shotgun = false) {
    const s = BR.length < 120 ? {} : BR.shift();
    Object.assign(s, { p: pos.clone(), v: right.clone().multiplyScalar(1.6 + Math.random()).add(_p.set(0, 1.2 + Math.random(), 0)).addScaledVector(dir, -0.3), r: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0), w: new THREE.Vector3(Math.random() * 20, Math.random() * 20, 0), rest: false, t: 0, sc: shotgun ? 2.6 : 1 });
    BR.push(s);
  }
  function smoke(at, life = 45) {
    const c = { p: at.clone(), r: 0.5, max: 6, t: 0, life, sprites: [] };
    for (let i = 0; i < 26; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0 })); s.userData.off = new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 0.7, (Math.random() - 0.5) * 2).normalize().multiplyScalar(Math.random()); s.userData.rot = (Math.random() - 0.5) * 0.3; scene.add(s); c.sprites.push(s); }
    clouds.push(c);
  }
  // is the line a→b inside smoke? (bots can't see through it)
  function smoky(a, b) {
    for (const c of clouds) {
      if (c.t > c.life) continue;
      const ab = _p.copy(b).sub(a), l = ab.length(); ab.divideScalar(l);
      const t = Math.max(0, Math.min(l, _s.copy(c.p).sub(a).dot(ab)));
      const cp = _s.copy(a).addScaledVector(ab, t);
      if (cp.distanceTo(c.p) < c.r * 0.85) return true;
    }
    return false;
  }
  function explosion(at, big = 1) {
    flashLight.position.copy(at).add(_p.set(0, 0.5, 0)); flashLight.intensity = 60 * big; flashLight.distance = 30; flashT = 0.12;
    const F = flashes[flHead]; flHead = (flHead + 1) % flashes.length; F.s.position.copy(at).add(_p.set(0, 0.5, 0)); F.s.scale.setScalar(4 * big); F.s.visible = true; F.t = 0.12;
    for (let i = 0; i < 18; i++) puff(at.clone().add(_p.set((Math.random() - 0.5) * 1.2, Math.random() * 0.8, (Math.random() - 0.5) * 1.2)), _p.set((Math.random() - 0.5) * 6, 1 + Math.random() * 4, (Math.random() - 0.5) * 6).clone(), i % 3 ? '90,85,80' : '170,150,120', 0.9 + Math.random(), 2.5 + Math.random() * 2, 0.75, 3);
    spark(at.clone().add(_p.set(0, 0.2, 0)), 60, UP, 12);
    hole(at.clone().setY(groundY(at.x, at.z, at.y + 0.5)), UP, 'stone', 2.6);
  }
  function update(dt, cam) {
    for (const T of tracers) {
      if (!T.m.visible) continue;
      T.t += dt; const head = T.t * T.speed;
      if (head - T.len > T.total) { T.m.visible = false; continue; }
      // position along the path
      let d = Math.min(head, T.total), acc = 0;
      for (const [a, b] of T.path) { const l = a.distanceTo(b); if (acc + l >= d) { const f = (d - acc) / l; T.m.position.lerpVectors(a, b, f); T.m.lookAt(b); break; } acc += l; }
      T.m.scale.set(1, 1, Math.min(T.len, head));
    }
    for (const F of flashes) if (F.s.visible && (F.t -= dt) <= 0) F.s.visible = false;
    if (flashT > 0) { flashT -= dt; if (flashT <= 0) { flashLight.intensity = 0; flashLight.distance = 9; } }
    for (const P of puffs) {
      if (!P.s.visible) continue;
      P.t += dt; const f = P.t / P.life; if (f >= 1) { P.s.visible = false; continue; }
      P.s.position.addScaledVector(P.v, dt); P.v.multiplyScalar(1 - dt * 2.5); P.v.y += dt * 0.15;
      P.s.scale.setScalar(P.size * (1 + f * P.grow)); P.s.material.opacity = P.op * (1 - f) * Math.min(1, P.t * 20);
    }
    let k = 0;
    for (const S of SP) { if (!S.on) continue; S.t -= dt; if (S.t <= 0) { S.on = false; continue; } S.v.y -= 9.8 * dt; S.p.addScaledVector(S.v, dt); spPos[k * 3] = S.p.x; spPos[k * 3 + 1] = S.p.y; spPos[k * 3 + 2] = S.p.z; k++; }
    spGeo.setDrawRange(0, k); spGeo.attributes.position.needsUpdate = true; sparks.visible = k > 0;
    for (const kind in holes) {
      const H = holes[kind]; if (!H.dirty) continue; H.dirty = false;
      H.list.forEach((s, i) => { _q.setFromUnitVectors(Z, s.n).multiply(new THREE.Quaternion().setFromAxisAngle(Z, s.rot)); _m.compose(s.p, _q, _s.set(s.size, s.size, 1)); H.im.setMatrixAt(i, _m); });
      H.im.count = H.list.length; H.im.instanceMatrix.needsUpdate = true;
    }
    let n = 0;
    for (const b of BR) {
      if (!b.rest) {
        b.t += dt; b.v.y -= 9.8 * dt; b.p.addScaledVector(b.v, dt); b.r.x += b.w.x * dt; b.r.y += b.w.y * dt;
        const g = groundY(b.p.x, b.p.z, b.p.y + 0.2) + 0.005;
        if (b.p.y < g) { b.p.y = g; b.v.y *= -0.3; b.v.x *= 0.5; b.v.z *= 0.5; b.w.multiplyScalar(0.5); if (Math.abs(b.v.y) < 0.4) { b.rest = true; b.r.x = Math.PI / 2; } }
      }
      _m.compose(b.p, _q.setFromEuler(b.r), _s.set(b.sc, b.sc, b.sc)); brass.setMatrixAt(n++, _m);
    }
    brass.count = n; brass.instanceMatrix.needsUpdate = true;
    for (let i = clouds.length - 1; i >= 0; i--) {
      const c = clouds[i]; c.t += dt; c.r = Math.min(c.max, 0.5 + c.t * 1.6);
      const fade = c.t < c.life - 6 ? 1 : Math.max(0, (c.life - c.t) / 6);
      c.sprites.forEach((s) => { s.position.copy(c.p).addScaledVector(s.userData.off, c.r).add(_p.set(0, c.r * 0.3, 0)); s.scale.setScalar(c.r * 1.3); s.material.opacity = 0.85 * fade * Math.min(1, c.t); s.material.rotation += s.userData.rot * dt; });
      if (c.t > c.life) { for (const s of c.sprites) { s.removeFromParent(); s.material.dispose(); } clouds.splice(i, 1); }
    }
    void cam;
  }
  function clear() {
    for (const T of tracers) T.m.visible = false;
    for (const P of puffs) P.s.visible = false;
    for (const k in holes) { holes[k].list.length = 0; holes[k].dirty = true; }
    BR.length = 0;
    for (const c of clouds) for (const s of c.sprites) s.removeFromParent(); clouds.length = 0;
  }
  return { tracer, muzzle, puff, spark, impact, eject, smoke, smoky, explosion, update, clear, clouds };
}

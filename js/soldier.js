// A soldier. The body is 17 joints; every frame they are placed by procedural animation (walk cycle, crouch,
// prone, aiming, leaning, two-bone IK for the arms and legs) and the meshes hang between them. On death the
// same joints become a verlet ragdoll that falls, slumps and slides against the map. Hitboxes are capsules
// on the same joints, so what you see is what you hit. Wounds stay on the body where the rounds went in.
import * as THREE from 'three';
import * as TX from './tex.js';
import { UNIFORM, TEAM } from './data.js';
import { makeGun, makeMelee } from './guns.js';
import { boxesNear } from './world.js';

const J = ['pelvis', 'spine', 'neck', 'head', 'shL', 'elL', 'haL', 'shR', 'elR', 'haR', 'hipL', 'knL', 'ftL', 'hipR', 'knR', 'ftR', 'chest'];
const I = Object.fromEntries(J.map((n, i) => [n, i]));
// bone lengths (m) for a 1.80 m soldier
const LEN = { upperArm: 0.3, foreArm: 0.27, thigh: 0.44, shin: 0.44, spine: 0.24, chest: 0.26, neck: 0.12 };
// segments: [name, from, to, radius (hitbox), part]
const SEGS = [
  ['belly', 'pelvis', 'spine', 0.155, 'belly'], ['chest', 'spine', 'neck', 0.17, 'chest'], ['neck', 'neck', 'head', 0.06, 'neck'],
  ['uaL', 'shL', 'elL', 0.058, 'armL'], ['faL', 'elL', 'haL', 0.05, 'armL'], ['uaR', 'shR', 'elR', 0.058, 'armR'], ['faR', 'elR', 'haR', 0.05, 'armR'],
  ['thL', 'hipL', 'knL', 0.085, 'legL'], ['shinL', 'knL', 'ftL', 0.065, 'legL'], ['thR', 'hipR', 'knR', 0.085, 'legR'], ['shinR', 'knR', 'ftR', 0.065, 'legR'],
];
const v3 = () => new THREE.Vector3();
const _a = v3(), _b = v3(), _c = v3(), _d = v3(), _e = v3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const STEP = 1 / 120; // the ragdoll's verlet step: velocities are stored as movement per step

function lam(c, extra = {}) { return new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, ...extra }); }
const shared = new Map();
const sm = (k, f) => { if (!shared.has(k)) shared.set(k, f()); return shared.get(k); };

// two-bone IK: from root a to target t with bone lengths l1, l2; pole = direction the middle joint bends toward
function ik(a, t, l1, l2, pole, outMid, outEnd) {
  const d = _a.copy(t).sub(a); let dist = d.length();
  const maxR = l1 + l2 - 0.001; if (dist > maxR) { d.multiplyScalar(maxR / dist); dist = maxR; }
  if (dist < 0.01) { d.set(0, -0.01, 0); dist = 0.01; }
  outEnd.copy(a).add(d);
  const cos = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), ang = Math.acos(Math.max(-1, Math.min(1, cos)));
  const dn = _b.copy(d).divideScalar(dist);
  const side = _c.copy(pole).addScaledVector(dn, -pole.dot(dn)); if (side.lengthSq() < 1e-6) side.set(0, 0, -1); side.normalize();
  outMid.copy(a).addScaledVector(dn, Math.cos(ang) * l1).addScaledVector(side, Math.sin(ang) * l1);
}

export class Soldier {
  constructor(o = {}) {
    this.o = { uniform: 'multicam', team: -1, armor: 'none', helmet: 'none', name: '', ...o };
    this.group = new THREE.Group(); this.group.name = 'soldier';
    this.root = new THREE.Group(); this.group.add(this.root); // the meshes, in world space once posed
    this.jp = J.map(() => v3());   // joint positions, world space
    this.segMesh = {};
    this.dead = false; this.rag = null; this.wounds = 0; this.lost = new Set();
    this.fwd = new THREE.Vector3(0, 0, -1);
    this.build();
    this.gun = null; this.melee = null;
  }

  build() {
    const U = UNIFORM[this.o.uniform] || UNIFORM.multicam, C = TX.camo(U);
    const uni = sm('uni' + this.o.uniform, () => new THREE.MeshStandardMaterial({ map: C.map, normalMap: C.normalMap, roughness: 0.95 }));
    const gear = sm('gear', () => { const t = TX.cordura(0x6e624a); return new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughness: 0.95 }); });
    const gearBlk = sm('gearB', () => { const t = TX.cordura(0x2b2b2a); return new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughness: 0.95 }); });
    const skinM = sm('skin', () => new THREE.MeshStandardMaterial({ map: TX.skin(0xb98564).map, roughness: 0.7 }));
    const boot = sm('boot', () => lam(0x3b2e22));
    const glove = sm('glove', () => lam(0x2a2925));
    const team = this.o.team >= 0 ? sm('band' + this.o.team, () => lam(TEAM[this.o.team].hex, { emissive: TEAM[this.o.team].hex, emissiveIntensity: 0.25 })) : null;
    const add = (seg, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; this.seg(seg).add(m); return m; };
    // belly / hips
    add('belly', new THREE.BoxGeometry(0.33, 0.26, 0.2), uni, 0, 0.11, 0);
    add('belly', new THREE.BoxGeometry(0.35, 0.06, 0.22), gear, 0, 0.02, 0);                       // belt
    // chest, with whatever armour is worn
    add('chest', new THREE.BoxGeometry(0.38, 0.28, 0.21), uni, 0, 0.13, 0);
    if (this.o.armor !== 'none') {
      const g = this.o.armor === 'iiia' ? gearBlk : gear, th = this.o.armor === 'iiia' ? 0.045 : 0.07;
      add('chest', new THREE.BoxGeometry(0.34, 0.3, th), g, 0, 0.12, -0.105 - th / 2 + 0.02);        // front plate
      add('chest', new THREE.BoxGeometry(0.34, 0.3, th), g, 0, 0.12, 0.105 + th / 2 - 0.02);         // back plate
      if (this.o.armor !== 'iiia') for (let i = 0; i < 3; i++) add('chest', new THREE.BoxGeometry(0.08, 0.12, 0.05), g, -0.11 + i * 0.11, 0.02, -0.16); // mag pouches
    }
    // neck and head
    add('neck', new THREE.CylinderGeometry(0.05, 0.055, 0.12, 8), skinM, 0, 0.06, 0);
    const head = new THREE.Group(); this.seg('head').add(head); this.headG = head;
    const hm = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 12), skinM); hm.scale.set(0.95, 1.12, 1.05); hm.position.y = 0.1; hm.castShadow = true; head.add(hm);
    const eyeM = sm('eye', () => lam(0x1a1410));
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 5), eyeM); e.position.set(s * 0.035, 0.12, -0.092); head.add(e); }
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.04, 0.03), skinM); nose.position.set(0, 0.095, -0.1); head.add(nose);
    if (this.o.helmet !== 'none') {
      const hel = new THREE.Mesh(new THREE.SphereGeometry(0.125, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), sm('helm' + this.o.helmet, () => lam(this.o.helmet === 'fast' ? 0x6f6448 : 0x5c5e45, { roughness: 0.85 })));
      hel.position.y = 0.12; hel.castShadow = true; head.add(hel); this.helmetM = hel;
      const nvg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.03), gearBlk); nvg.position.set(0, 0.2, -0.115); head.add(nvg);
    } else {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.106, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), uni); cap.position.y = 0.115; head.add(cap);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.01, 0.08), uni); brim.position.set(0, 0.15, -0.1); head.add(brim);
    }
    const glasses = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.03, 0.02), sm('specs', () => new THREE.MeshStandardMaterial({ color: 0x111, roughness: 0.1, metalness: 0.9 }))); glasses.position.set(0, 0.125, -0.098); head.add(glasses);
    // arms
    for (const s of ['L', 'R']) {
      add('ua' + s, new THREE.CylinderGeometry(0.058, 0.05, LEN.upperArm, 8), uni, 0, LEN.upperArm / 2, 0);
      if (team) add('ua' + s, new THREE.CylinderGeometry(0.061, 0.061, 0.04, 8), team, 0, 0.08, 0);
      add('fa' + s, new THREE.CylinderGeometry(0.05, 0.042, LEN.foreArm, 8), uni, 0, LEN.foreArm / 2, 0);
      add('fa' + s, new THREE.BoxGeometry(0.07, 0.1, 0.04), glove, 0, LEN.foreArm + 0.04, 0);
      add('th' + s, new THREE.CylinderGeometry(0.085, 0.068, LEN.thigh, 8), uni, 0, LEN.thigh / 2, 0);
      add('shin' + s, new THREE.CylinderGeometry(0.065, 0.05, LEN.shin, 8), uni, 0, LEN.shin / 2, 0);
      add('shin' + s, new THREE.BoxGeometry(0.1, 0.12, 0.26), boot, 0, LEN.shin, -0.05);
      add('shin' + s, new THREE.BoxGeometry(0.09, 0.1, 0.06), gearBlk, 0, 0.02, -0.04); // knee pad
    }
  }
  seg(name) {
    if (!this.segMesh[name]) { const g = new THREE.Group(); g.name = name; this.root.add(g); this.segMesh[name] = g; }
    return this.segMesh[name];
  }
  setGun(id, att = [], finish = 'black') {
    const key = id + att.join() + finish; if (this.gunKey === key) return; this.gunKey = key;
    if (this.gun) this.gun.removeFromParent();
    if (this.melee) { this.melee.removeFromParent(); this.melee = null; }
    this.gun = id ? makeGun(id, { att, finish }) : null; if (this.gun) this.root.add(this.gun);
  }
  setMelee(id) { if (this.gun) { this.gun.removeFromParent(); this.gun = null; this.gunKey = ''; } if (this.melee?.userData.id !== id) { this.melee?.removeFromParent(); this.melee = makeMelee(id); this.melee.userData.id = id; this.root.add(this.melee); } }
  setTag(text, color) {
    if (this.tag) { this.tag.material.map.dispose(); this.tag.material.dispose(); this.tag.removeFromParent(); this.tag = null; }
    if (!text) return;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.nameTag(text, color), depthTest: false, transparent: true }));
    s.scale.set(1.2, 0.22, 1); s.renderOrder = 10; this.group.add(s); this.tag = s;
  }

  // ---------- the living pose ----------
  // st: { pos, yaw, pitch, stance 0..2, lean -1..1, speed, phase, hold ('gun'|'melee'|'nade'|'none'), reload 0..1, kick, swing 0..1, heal }
  pose(st) {
    if (this.dead) return;
    const P = this.jp, yaw = st.yaw, pitch = st.pitch, crouch = Math.min(1, st.stance), prone = Math.max(0, st.stance - 1);
    const fwd = this.fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw)), right = _d.set(Math.cos(yaw), 0, -Math.sin(yaw)).clone();
    const at = (x, y, z, out) => out.copy(st.pos).addScaledVector(right, x).addScaledVector(UP, y).addScaledVector(fwd, -z); // z: + backwards
    const ph = st.phase, sp = Math.min(1, st.speed / 4.5), stride = 0.32 * sp * (1 - crouch * 0.3), bob = Math.abs(Math.sin(ph)) * 0.035 * sp;
    if (prone > 0.5) return this.poseProne(st, fwd, right);
    const pelY = 0.98 - crouch * 0.4 - bob;
    at(0, pelY, 0, P[I.pelvis]);
    // the upper body leans forward when crouched, rolls with lean
    const lean = st.lean * 0.3, tilt = 0.1 + crouch * 0.25;
    const upv = _e.copy(UP).applyAxisAngle(right, -tilt).applyAxisAngle(fwd, -lean).normalize();
    const sideV = right.clone().applyAxisAngle(fwd, -lean);
    P[I.spine].copy(P[I.pelvis]).addScaledVector(upv, LEN.spine);
    P[I.neck].copy(P[I.spine]).addScaledVector(upv, LEN.chest);
    P[I.chest].copy(P[I.spine]).addScaledVector(upv, LEN.chest * 0.65);
    // head looks along the aim
    const look = new THREE.Vector3(0, Math.sin(pitch), 0).addScaledVector(fwd, Math.cos(pitch));
    P[I.head].copy(P[I.neck]).addScaledVector(upv, LEN.neck).addScaledVector(look, 0.02);
    P[I.shL].copy(P[I.neck]).addScaledVector(upv, -0.05).addScaledVector(sideV, -0.2);
    P[I.shR].copy(P[I.neck]).addScaledVector(upv, -0.05).addScaledVector(sideV, 0.2);
    P[I.hipL].copy(P[I.pelvis]).addScaledVector(right, -0.1); P[I.hipR].copy(P[I.pelvis]).addScaledVector(right, 0.1);
    // legs: feet on a walk cycle, knees forward
    const kneePole = fwd.clone().add(_a.set(0, 0.2, 0));
    for (const [s, off] of [['L', 0], ['R', Math.PI]]) {
      const hip = P[I['hip' + s]], c = Math.sin(ph + off), lift = Math.max(0, Math.cos(ph + off)) * 0.12 * sp;
      const foot = _b.copy(st.pos).addScaledVector(right, s === 'L' ? -0.12 : 0.12).addScaledVector(fwd, c * stride + crouch * 0.1 * (s === 'L' ? 1.2 : -0.6));
      foot.y = st.pos.y + 0.06 + lift;
      if (st.moveDir) foot.addScaledVector(st.moveDir, 0); // (placeholder for strafing)
      ik(hip, foot.clone(), LEN.thigh, LEN.shin, kneePole, P[I['kn' + s]], P[I['ft' + s]]);
    }
    this.armsAndGun(st, fwd, right, look, upv);
    this.apply(st);
  }
  poseProne(st, fwd, right) {
    const P = this.jp, base = st.pos, ph = st.phase, sp = Math.min(1, st.speed / 1.2);
    const y = base.y + 0.16;
    P[I.pelvis].copy(base).setY(y).addScaledVector(fwd, -0.3);
    P[I.spine].copy(P[I.pelvis]).addScaledVector(fwd, LEN.spine).setY(y + 0.03);
    P[I.neck].copy(P[I.spine]).addScaledVector(fwd, LEN.chest).setY(y + 0.12);
    P[I.chest].copy(P[I.spine]).addScaledVector(fwd, LEN.chest * 0.65).setY(y + 0.08);
    const look = new THREE.Vector3(0, Math.sin(st.pitch), 0).addScaledVector(fwd, Math.cos(st.pitch));
    P[I.head].copy(P[I.neck]).addScaledVector(fwd, LEN.neck * 0.7).add(_a.set(0, 0.08, 0));
    P[I.shL].copy(P[I.neck]).addScaledVector(right, -0.2).setY(y + 0.08); P[I.shR].copy(P[I.neck]).addScaledVector(right, 0.2).setY(y + 0.08);
    P[I.hipL].copy(P[I.pelvis]).addScaledVector(right, -0.1); P[I.hipR].copy(P[I.pelvis]).addScaledVector(right, 0.1);
    for (const [s, k] of [['L', -1], ['R', 1]]) {
      const hip = P[I['hip' + s]], wig = Math.sin(ph + (k > 0 ? Math.PI : 0)) * 0.1 * sp;
      const foot = _b.copy(hip).addScaledVector(fwd, -0.86 + wig).addScaledVector(right, k * 0.18); foot.y = base.y + 0.08;
      ik(hip, foot.clone(), LEN.thigh, LEN.shin, _c.set(0, -1, 0), P[I['kn' + s]], P[I['ft' + s]]);
    }
    this.armsAndGun(st, fwd, right, look, fwd, true);
    this.apply(st);
  }
  armsAndGun(st, fwd, right, look, upv, prone = false) {
    const P = this.jp;
    const elbowPoleR = _e.copy(right).multiplyScalar(0.6).add(_a.set(0, -1, 0)).normalize().clone();
    const elbowPoleL = right.clone().multiplyScalar(-0.6).add(_a.set(0, -1, 0)).normalize();
    // where the gun sits: stock in the right shoulder, sights in front of the right eye
    const eye = _a.copy(P[I.head]).add(_b.set(0, prone ? 0.0 : 0.08, 0)).addScaledVector(right, 0.035);
    const gun = this.gun || this.melee;
    if (st.hold === 'gun' && this.gun) {
      const info = this.gun.userData.info, isP = info.pistol;
      const q = _q.setFromEuler(new THREE.Euler(st.pitch, st.yaw, 0, 'YXZ'));
      this.gun.quaternion.copy(q);
      // hold point: grip below and in front of the eye; pistols at arm's length
      const back = isP ? -0.42 : -(info.sightZ + 0.08), down = info.sightY + (st.ads ? 0 : 0.05);
      const pos = eye.clone().addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(q), -back).addScaledVector(new THREE.Vector3(0, 1, 0).applyQuaternion(q), -down);
      if (!st.ads && !isP) pos.addScaledVector(right, 0.03);
      if (st.sprint && !prone) { pos.addScaledVector(UP, -0.12).addScaledVector(fwd, -0.08); this.gun.rotateX(-0.6); this.gun.rotateY(0.5); }
      // recoil + reload tilt
      pos.addScaledVector(new THREE.Vector3(0, 0, 1).applyQuaternion(q), (st.kick || 0) * 0.05);
      if (st.reload > 0) { const r = Math.sin(st.reload * Math.PI); this.gun.rotateZ(-r * 0.6); this.gun.rotateX(-r * 0.25); pos.addScaledVector(UP, -r * 0.08); }
      this.gun.position.copy(pos); this.gun.updateMatrixWorld(true);
      const hR = this.gun.localToWorld(new THREE.Vector3(0, -0.01, 0.01));
      let hL = this.gun.localToWorld(info.left.clone());
      if (st.reload > 0 && info.mag) { const r = Math.sin(st.reload * Math.PI); hL = hL.lerp(this.gun.localToWorld(info.magHome.clone().add(_b.set(0, -0.12 * r, 0))), Math.min(1, r * 2)); }
      ik(P[I.shR], hR, LEN.upperArm, LEN.foreArm + 0.05, elbowPoleR, P[I.elR], P[I.haR]);
      ik(P[I.shL], hL, LEN.upperArm, LEN.foreArm + 0.05, elbowPoleL, P[I.elL], P[I.haL]);
    } else if (st.hold === 'melee' && this.melee) {
      const sw = st.swing || 0, q = _q.setFromEuler(new THREE.Euler(st.pitch * 0.5 - 0.3 + Math.sin(sw * Math.PI) * 1.6, st.yaw - Math.sin(sw * Math.PI) * 0.8, 0, 'YXZ'));
      const hR = P[I.shR].clone().addScaledVector(fwd, 0.28 + Math.sin(sw * Math.PI) * 0.2).add(_b.set(0, -0.12 + Math.sin(sw * Math.PI) * 0.15, 0));
      ik(P[I.shR], hR, LEN.upperArm, LEN.foreArm + 0.05, elbowPoleR, P[I.elR], P[I.haR]);
      ik(P[I.shL], P[I.shL].clone().addScaledVector(fwd, 0.3).add(_b.set(0.05, -0.15, 0)), LEN.upperArm, LEN.foreArm + 0.05, elbowPoleL, P[I.elL], P[I.haL]);
      this.melee.position.copy(P[I.haR]); this.melee.quaternion.copy(q); this.melee.rotateX(-Math.PI / 2 + 0.4);
    } else {
      // empty-handed / throwing / bandaging: arms forward and low
      const t = st.throwT || 0;
      const hR = P[I.shR].clone().addScaledVector(fwd, 0.25 - t * 0.4).add(_b.set(0, -0.3 + t * 0.55, 0));
      ik(P[I.shR], hR, LEN.upperArm, LEN.foreArm + 0.05, elbowPoleR, P[I.elR], P[I.haR]);
      ik(P[I.shL], P[I.shL].clone().addScaledVector(fwd, 0.25).add(_b.set(0, -0.3, 0)).addScaledVector(right, 0.15), LEN.upperArm, LEN.foreArm + 0.05, elbowPoleL, P[I.elL], P[I.haL]);
    }
    void gun; void look; void upv;
  }
  // puts every segment between its joints
  apply(st) {
    const P = this.jp;
    const side = _c.copy(P[I.shR]).sub(P[I.shL]).normalize();
    const torsoFwd = _d.copy(P[I.neck]).sub(P[I.pelvis]).cross(side).normalize().negate(); // forward, away from the back
    if (!isFinite(torsoFwd.x)) torsoFwd.copy(this.fwd);
    for (const [name, a, b] of SEGS) this.place(this.segMesh[name], P[I[a]], P[I[b]], torsoFwd);
    // head: from neck along up, facing the look direction
    const hd = this.segMesh.head;
    if (hd) {
      const up = _a.copy(P[I.head]).sub(P[I.neck]).normalize();
      let f = st && !this.dead ? new THREE.Vector3(-Math.sin(st.yaw), 0, -Math.cos(st.yaw)).applyAxisAngle(side, st.pitch * 0.6) : torsoFwd.clone();
      this.basis(hd, P[I.neck], up, f);
      hd.position.addScaledVector(up, 0.02);
    }
    if (this.tag) this.tag.position.copy(P[I.head]).add(_a.set(0, 0.42, 0));
  }
  basis(obj, pos, up, f) {
    const z = _e.copy(f).negate().addScaledVector(up, f.dot(up)); // local +Z = backwards
    if (z.lengthSq() < 1e-6) z.set(0, 0, 1); z.normalize();
    const x = _b.copy(up).cross(z).normalize();
    _m.makeBasis(x, up, z); obj.quaternion.setFromRotationMatrix(_m); obj.position.copy(pos);
  }
  place(obj, a, b, ref) { if (!obj) return; const up = _a.copy(b).sub(a); if (up.lengthSq() < 1e-8) return; up.normalize(); this.basis(obj, a, up.clone(), ref); }

  // ---------- hits ----------
  // nearest body part along a ray: { t, part, point } or null
  raycast(o, d, maxT = 1000) {
    const P = this.jp; let best = null;
    // quick reject: a sphere around the body
    const c = _a.copy(P[I.spine]); const oc = _b.copy(c).sub(o), tc = oc.dot(d); if (tc < -2) return null;
    const dist2 = oc.lengthSq() - tc * tc; if (dist2 > 1.6 * 1.6) return null;
    const test = (A, B, r, part) => {
      const t = rayCapsule(o, d, A, B, r); if (t !== null && t >= 0 && t < maxT && (!best || t < best.t)) best = { t, part };
    };
    // head: a sphere slightly forward of the head joint
    const hc = P[I.head].clone().add(new THREE.Vector3(0, 0.1, 0)); test(hc, hc, 0.115, 'head');
    for (const [name, a, b, r, part] of SEGS) { if (this.lost.has(name)) continue; test(P[I[a]], P[I[b]], r, part); }
    if (best) best.point = o.clone().addScaledVector(d, best.t);
    return best;
  }
  get center() { return this.jp[I.spine]; }
  get headPos() { return this.jp[I.head]; }

  // a wound decal where the round went in (and a bigger one where it came out)
  wound(point, dir, part, size = 0.06, exit = false) {
    if (this.wounds > 40) return;
    const seg = part === 'head' ? 'head' : part === 'neck' ? 'neck' : part === 'chest' ? 'chest' : part === 'belly' ? 'belly' : part === 'armL' ? nearer(this, point, 'uaL', 'faL') : part === 'armR' ? nearer(this, point, 'uaR', 'faR') : part === 'legL' ? nearer(this, point, 'thL', 'shinL') : nearer(this, point, 'thR', 'shinR');
    const g = this.segMesh[seg]; if (!g) return;
    g.updateMatrixWorld(true);
    const local = g.worldToLocal(point.clone()), n = g.worldToLocal(point.clone().addScaledVector(dir, exit ? 1 : -1)).sub(local).normalize();
    const m = new THREE.Mesh(sm('woundGeo', () => new THREE.PlaneGeometry(1, 1)), sm('woundM' + (this.wounds % 3), () => new THREE.MeshStandardMaterial({ map: TX.wound(this.wounds % 3 + 1), transparent: true, depthWrite: false, roughness: 0.3, polygonOffset: true, polygonOffsetFactor: -4 })));
    m.position.copy(local).addScaledVector(n, 0.004); m.lookAt(local.clone().add(n)); m.scale.setScalar(size * (exit ? 2.2 : 1)); m.rotateZ(Math.random() * 6);
    g.add(m); this.wounds++;
  }

  // ---------- death and the ragdoll ----------
  // imp: world impulse (m/s) at the hit joint; part: which part was hit
  die(imp, part, vel) {
    if (this.dead) return; this.dead = true;
    const P = this.jp, n = J.length;
    const p = P.map((x) => x.clone()), v0 = (vel || new THREE.Vector3()).clone().multiplyScalar(STEP), prev = P.map((x) => x.clone().sub(v0));
    const C = [];
    const link = (a, b, stiff = 1) => C.push([I[a], I[b], p[I[a]].distanceTo(p[I[b]]), stiff]);
    for (const [, a, b] of SEGS) link(a, b);
    link('neck', 'head'); link('shL', 'shR'); link('hipL', 'hipR'); link('shL', 'neck'); link('shR', 'neck'); link('hipL', 'pelvis'); link('hipR', 'pelvis');
    link('shL', 'spine', 0.8); link('shR', 'spine', 0.8); link('hipL', 'spine', 0.8); link('hipR', 'spine', 0.8); link('neck', 'pelvis', 0.6); link('head', 'spine', 0.4); link('chest', 'spine'); link('chest', 'neck');
    link('shL', 'pelvis', 0.5); link('shR', 'pelvis', 0.5); link('shL', 'hipR', 0.3); link('shR', 'hipL', 0.3);
    // a hit throws the joints near it
    const hitJ = { head: ['head', 'neck'], neck: ['neck', 'head'], chest: ['neck', 'spine', 'shL', 'shR'], belly: ['spine', 'pelvis'], armL: ['elL', 'haL'], armR: ['elR', 'haR'], legL: ['knL', 'ftL'], legR: ['knR', 'ftR'] }[part] || ['spine'];
    if (imp) for (const j of hitJ) prev[I[j]].addScaledVector(imp, -STEP);
    // everything else gets a little of it, and the legs buckle
    if (imp) for (let i = 0; i < n; i++) prev[i].addScaledVector(imp, -0.25 * STEP);
    for (const j of ['knL', 'knR']) prev[I[j]].addScaledVector(this.fwd, -0.4 * STEP);
    this.rag = { p, prev, C, t: 0, rest: 0, extra: [] };
    if (this.tag) this.tag.visible = false;
    if (this.gun) { this.dropProp(this.gun); this.gun = null; }
    if (this.melee) { this.dropProp(this.melee); this.melee = null; }
  }
  dropProp(obj) { // the gun falls out of their hands
    obj.updateMatrixWorld(true);
    const s = { o: obj, v: new THREE.Vector3((Math.random() - 0.5) * 1.5, 1, (Math.random() - 0.5) * 1.5), w: new THREE.Vector3(Math.random() * 4, Math.random() * 4, Math.random() * 4), rest: false };
    this.props = this.props || []; this.props.push(s);
  }
  // cuts a joint free (gore): the limb flies as its own chain
  detach(which, imp) {
    if (!this.rag || this.lost.has(which)) return null;
    const R = this.rag;
    const spec = { head: { root: 'head', cut: [['neck', 'head'], ['head', 'spine']], segs: ['head'] },
      armL: { root: 'shL', cut: [['shL', 'elL']], segs: ['uaL', 'faL'], copy: 'shL' }, armR: { root: 'shR', cut: [['shR', 'elR']], segs: ['uaR', 'faR'], copy: 'shR' },
      legL: { root: 'hipL', cut: [['hipL', 'knL']], segs: ['thL', 'shinL'], copy: 'hipL' }, legR: { root: 'hipR', cut: [['hipR', 'knR']], segs: ['thR', 'shinR'], copy: 'hipR' } }[which];
    if (!spec) return null;
    R.C = R.C.filter(([a, b]) => !spec.cut.some(([x, y]) => (a === I[x] && b === I[y]) || (a === I[y] && b === I[x])));
    this.lost.add(which);
    if (spec.copy) {
      // a second copy of the shoulder/hip joint goes with the limb
      const k = R.p.length; R.p.push(R.p[I[spec.copy]].clone()); R.prev.push(R.prev[I[spec.copy]].clone().addScaledVector(imp, -STEP));
      const first = which.startsWith('arm') ? 'el' + which.slice(-1) : 'kn' + which.slice(-1);
      R.C.push([k, I[first], R.p[k].distanceTo(R.p[I[first]]), 1]);
      R.extra.push({ seg: spec.segs[0], a: k, b: I[first] });
      R.prev[I[first]].addScaledVector(imp, -STEP);
    } else R.prev[I.head].addScaledVector(imp, -STEP);
    return spec;
  }
  updateRagdoll(dt, W) {
    const R = this.rag; if (!R) return;
    R.t += dt;
    if (R.rest > 1.5 && !(this.props || []).some((s) => !s.rest)) return;
    R.acc = Math.min((R.acc || 0) + dt, 8 * STEP);
    const h = STEP;
    while (R.acc >= STEP) {
      R.acc -= STEP;
      let moving = 0;
      for (let i = 0; i < R.p.length; i++) {
        const p = R.p[i], q = R.prev[i];
        const vx = (p.x - q.x) * 0.99, vy = (p.y - q.y) * 0.99, vz = (p.z - q.z) * 0.99;
        q.copy(p); p.x += vx; p.y += vy - 9.8 * h * h; p.z += vz;
        moving += vx * vx + vy * vy + vz * vz;
      }
      for (let it = 0; it < 6; it++) {
        for (const [a, b, len, k] of R.C) {
          const pa = R.p[a], pb = R.p[b], d = _a.copy(pb).sub(pa), l = d.length() || 1e-6, diff = (l - len) / l * 0.5 * k;
          pa.addScaledVector(d, diff); pb.addScaledVector(d, -diff);
        }
        for (let i = 0; i < R.p.length; i++) collidePoint(W, R.p[i], R.prev[i], i === I.head ? 0.11 : 0.07);
      }
      R.rest = moving < 1e-7 * R.p.length ? R.rest + h : 0;
    }
    // the meshes follow
    const P = this.jp; for (let i = 0; i < J.length; i++) P[i].copy(R.p[i]);
    this.apply(null);
    for (const e of R.extra) this.place(this.segMesh[e.seg], R.p[e.a], R.p[e.b], this.fwd);
    for (const s of this.props || []) {
      if (s.rest) continue;
      s.v.y -= 9.8 * dt; s.o.position.addScaledVector(s.v, dt); s.o.rotation.x += s.w.x * dt; s.o.rotation.z += s.w.z * dt;
      const g = groundUnder(W, s.o.position) + 0.03;
      if (s.o.position.y < g) { s.o.position.y = g; s.v.multiplyScalar(0.3); s.v.y = Math.abs(s.v.y) * 0.2; s.w.multiplyScalar(0.4); if (s.v.lengthSq() < 0.02) { s.rest = true; s.o.rotation.x = Math.PI / 2 * Math.sign(s.o.rotation.x || 1); s.o.rotation.z = 0; } }
    }
  }
  get resting() { return this.rag && this.rag.rest > 1.5; }
  joint(n) { return this.jp[I[n]]; }
  dispose() {
    this.group.removeFromParent();
    for (const s of this.props || []) s.o.removeFromParent();
    this.group.traverse((o) => { if (o.isSprite) { o.material.map?.dispose(); o.material.dispose(); } });
  }
}
function nearer(S, p, a, b) { const A = S.segMesh[a], B = S.segMesh[b]; return A && B && A.position.distanceToSquared(p) < B.position.distanceToSquared(p) ? a : b; }

// ray vs capsule (segment A-B, radius r): the entry distance or null
const _r1 = v3(), _r2 = v3(), _r3 = v3();
function rayCapsule(o, d, A, B, r) {
  const ba = _r1.copy(B).sub(A), oa = _r2.copy(o).sub(A);
  const baba = ba.dot(ba), bard = ba.dot(d), baoa = ba.dot(oa), rdoa = d.dot(oa), oaoa = oa.dot(oa);
  let a = baba - bard * bard, b = baba * rdoa - baoa * bard, c = baba * oaoa - baoa * baoa - r * r * baba;
  let h = b * b - a * c;
  if (baba > 1e-8 && h >= 0 && a > 1e-8) {
    const t = (-b - Math.sqrt(h)) / a, y = baoa + t * bard;
    if (y > 0 && y < baba) return t;
  }
  // the caps (spheres)
  let best = null;
  for (const P of [A, B]) {
    const oc = _r3.copy(o).sub(P), bb = oc.dot(d), cc = oc.dot(oc) - r * r, hh = bb * bb - cc;
    if (hh >= 0) { const t = -bb - Math.sqrt(hh); if (t >= 0 && (best === null || t < best)) best = t; }
  }
  return best;
}
const _near = [];
function groundUnder(W, p) { let g = 0; for (const b of boxesNear(W, p.x, p.z, p.x, p.z, _near)) if (!b.edge && p.x > b.min.x && p.x < b.max.x && p.z > b.min.z && p.z < b.max.z && b.max.y <= p.y + 0.3 && b.max.y > g) g = b.max.y; return g; }
// keeps a ragdoll point out of the floor and walls; friction on the ground
function collidePoint(W, p, prev, r) {
  if (p.y < r) { p.y = r; prev.x = p.x - (p.x - prev.x) * 0.6; prev.z = p.z - (p.z - prev.z) * 0.6; }
  for (const b of boxesNear(W, p.x - r, p.z - r, p.x + r, p.z + r, _near)) {
    if (p.x + r < b.min.x || p.x - r > b.max.x || p.y + r < b.min.y || p.y - r > b.max.y || p.z + r < b.min.z || p.z - r > b.max.z) continue;
    // push out along the shallowest axis
    const dx0 = p.x + r - b.min.x, dx1 = b.max.x - (p.x - r), dy0 = p.y + r - b.min.y, dy1 = b.max.y - (p.y - r), dz0 = p.z + r - b.min.z, dz1 = b.max.z - (p.z - r);
    const m = Math.min(dx0, dx1, dy0, dy1, dz0, dz1);
    if (m === dy1) { p.y += dy1; prev.x = p.x - (p.x - prev.x) * 0.6; prev.z = p.z - (p.z - prev.z) * 0.6; }
    else if (m === dy0) p.y -= dy0; else if (m === dx0) p.x -= dx0; else if (m === dx1) p.x += dx1; else if (m === dz0) p.z -= dz0; else p.z += dz1;
  }
}
export const JOINTS = J;

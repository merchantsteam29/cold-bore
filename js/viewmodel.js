// First person: your gun and arms, drawn in their own little scene after the world (so the barrel never
// pokes through a wall). Positions here are in camera space: the camera sits at the origin looking down -Z.
// Aiming lines the sight up with the middle of the screen; recoil, sway, bob, reloads, bolt and pump
// actions, melee swings and throws are all procedural.
import * as THREE from 'three';
import * as TX from './tex.js';
import { UNIFORM } from './data.js';
import { makeGun, makeMelee, makeGrenade } from './guns.js';

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
export function createViewmodel(aspect = 16 / 9) {
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(58, aspect, 0.01, 10);
  const hemi = new THREE.HemisphereLight(0xc8d6e6, 0x6a5a48, 1.2); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.2); sun.position.set(-0.5, 1, 0.3); scene.add(sun);
  const fill = new THREE.PointLight(0xffb060, 0, 2); fill.position.set(0, 0, -0.6); scene.add(fill); // muzzle flash on the gun
  const holder = new THREE.Group(); scene.add(holder);
  let item = null, info = null, kind = 'none', uni = 'multicam';
  // arms: sleeves and gloves
  const arms = new THREE.Group(); scene.add(arms);
  const mkArm = () => { const g = new THREE.Group(); const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.052, 0.4, 10), new THREE.MeshStandardMaterial({ roughness: 0.95 })); sleeve.position.y = -0.2; sleeve.name = 'sleeve'; g.add(sleeve); const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.047, 0.04, 10), new THREE.MeshStandardMaterial({ color: 0x2c2c28, roughness: 0.9 })); cuff.position.y = -0.04; g.add(cuff); const glove = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.1, 0.045), new THREE.MeshStandardMaterial({ color: 0x2a2925, roughness: 0.85 })); glove.position.y = 0.03; g.add(glove); const fing = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.05), glove.material); fing.position.set(0, 0.08, -0.02); fing.rotation.x = 0.6; g.add(fing); arms.add(g); return g; };
  const armR = mkArm(), armL = mkArm();
  const setUniform = (u) => { uni = u; const C = TX.camo(UNIFORM[u] || UNIFORM.multicam); for (const a of [armR, armL]) { const s = a.getObjectByName('sleeve'); s.material.map = C.map; s.material.normalMap = C.normalMap; s.material.needsUpdate = true; } };
  setUniform(uni);

  const S = { ads: 0, kick: 0, kickR: 0, swayX: 0, swayY: 0, bob: 0, lower: 0, roll: 0, jump: 0 };
  function clear() { if (item) item.removeFromParent(); item = null; info = null; }
  function setGun(id, att, finish) { clear(); item = makeGun(id, { att, finish }); item.traverse((o) => { if (o.isMesh) o.castShadow = false; }); info = item.userData.info; holder.add(item); kind = 'gun'; }
  function setMelee(id) { clear(); item = makeMelee(id); holder.add(item); kind = id === 'fists' ? 'fists' : 'melee'; info = null; }
  function setNade(k) { clear(); item = makeGrenade(k); holder.add(item); kind = 'nade'; info = null; }
  function setEmpty() { clear(); kind = 'none'; }

  // st: { ads 0..1 target, dx, dy (mouse this frame), speed, phase, kick (impulse added this frame), reload (0..1 or -1),
  //       reloadKind, cycle (bolt/pump 0..1 or -1), sprint, swing (0..1 or -1), throwT, heal (0..1 or -1), switching (0..1), lean, crouch, shake }
  function update(dt, st) {
    const k = Math.min(1, dt * 12);
    S.ads += (st.ads - S.ads) * Math.min(1, dt / Math.max(0.05, st.adsTime || 0.25) * 3);
    S.swayX += (-(st.dx || 0) * 0.00018 - S.swayX) * Math.min(1, dt * 8); S.swayY += ((st.dy || 0) * 0.00018 - S.swayY) * Math.min(1, dt * 8);
    S.swayX = Math.max(-0.05, Math.min(0.05, S.swayX)); S.swayY = Math.max(-0.05, Math.min(0.05, S.swayY));
    S.kick += (st.kick || 0); S.kick *= Math.exp(-dt * 14); S.kickR = (st.kick ? (Math.random() - 0.5) : S.kickR * Math.exp(-dt * 10));
    S.lower += ((st.sprint ? 1 : 0) - S.lower) * k;
    const sw = st.switching || 0;
    const a = S.ads, isP = info?.pistol, bobAmt = (1 - a * 0.85) * Math.min(1, st.speed / 5);
    const bx = Math.sin(st.phase) * 0.012 * bobAmt, by = -Math.abs(Math.cos(st.phase)) * 0.012 * bobAmt;
    // hip and aim positions of the grip, in camera space
    let hip, adsP;
    if (kind === 'gun' && info) {
      hip = isP ? new THREE.Vector3(0.15, -0.15, -0.4) : new THREE.Vector3(0.15, -0.165, -0.3);
      const relief = info.scope ? 0.07 : isP ? 0.32 : 0.12;
      adsP = new THREE.Vector3(0, -info.sightY, -(relief + info.sightZ));
    } else if (kind === 'melee' || kind === 'fists') { hip = new THREE.Vector3(0.16, -0.2, -0.32); adsP = hip; }
    else { hip = new THREE.Vector3(0.14, -0.2, -0.3); adsP = hip; }
    const pos = hip.clone().lerp(adsP, a);
    pos.x += bx + S.swayX * (1 - a * 0.7); pos.y += by + S.swayY * (1 - a * 0.7);
    pos.z += S.kick * 0.06; pos.y -= sw * 0.35 + S.lower * 0.08; pos.x += S.lower * 0.04;
    let rx = S.kick * 0.18 * (1 - a * 0.4) - S.lower * 0.55 - sw * 0.8, ry = S.kickR * S.kick * 0.04 + S.lower * 0.6 + S.swayX * 2, rz = -(st.lean || 0) * 0.15 + S.kickR * S.kick * 0.03 - S.lower * 0.2;
    // the reload: tilt the gun, mag out, mag in, charge it
    let magOff = 0, leftT = null;
    if (st.reload >= 0 && kind === 'gun') {
      const r = st.reload, tilt = Math.sin(Math.min(1, r * 1.3) * Math.PI);
      rz += tilt * (isP ? 0.3 : 0.55); rx += tilt * 0.2; pos.y -= tilt * 0.04; pos.x -= tilt * 0.03;
      if (info.mag && st.reloadKind !== 'shell') {
        magOff = r < 0.35 ? r / 0.35 : r < 0.55 ? 1 : r < 0.75 ? 1 - (r - 0.55) / 0.2 : 0;
        leftT = info.magHome.clone().add(_v.set(0, -0.08 - magOff * 0.25, 0));
      } else if (st.reloadKind === 'shell') { rz += 0.2; leftT = new THREE.Vector3(0, -0.02, -0.12 - Math.sin(r * Math.PI * 2) * 0.05); }
    }
    if (st.cycle >= 0 && kind === 'gun') { const c = Math.sin(st.cycle * Math.PI); if (info.pump) info.pump.position.z = -0.3 + c * 0.08; rx += c * 0.06; if (st.cycleKind === 'bolt') { rz += c * 0.25; pos.y -= c * 0.02; } }
    if (info && info.mag) { info.mag.position.copy(info.magHome).add(_v.set(0, -magOff * 0.3, 0)); info.mag.visible = magOff < 0.98; }
    if ((kind === 'melee' || kind === 'fists') && st.swing >= 0) { const s = Math.sin(st.swing * Math.PI); pos.x -= s * 0.22; pos.z -= s * 0.2; pos.y += s * 0.05; ry -= s * 1.1; rx -= s * 0.4; }
    if (kind === 'nade') { const t = st.throwT || 0; pos.y += t * 0.2 - (t > 0.6 ? (t - 0.6) * 0.8 : 0); pos.z += t * 0.12 - (t > 0.6 ? (t - 0.6) * 1.2 : 0); rx -= t * 0.6; }
    if (st.heal >= 0) { pos.y -= 0.25; rx -= 0.6; }
    holder.position.copy(pos); holder.rotation.set(rx, ry, rz, 'YXZ');
    if (kind === 'melee') { item.rotation.set(-1.2, 0.1, 0.3); item.position.set(0, 0.02, 0); }
    if (kind === 'fists') item.visible = false;
    holder.updateMatrixWorld(true);
    // the arms reach the gun
    const hR = kind === 'gun' ? holder.localToWorld(new THREE.Vector3(0, -0.015, 0.012)) : holder.localToWorld(new THREE.Vector3(0, 0, 0));
    let hL;
    if (kind === 'gun') hL = holder.localToWorld((leftT || info.left).clone());
    else if (kind === 'fists') hL = holder.localToWorld(new THREE.Vector3(-0.3, 0.02, 0.05 + (st.swing >= 0 ? -Math.sin(st.swing * Math.PI) * 0.1 : 0)));
    else hL = new THREE.Vector3(-0.2, -0.32, -0.3);
    if (st.heal >= 0) { hL = new THREE.Vector3(-0.08, -0.2 + Math.sin(st.heal * 20) * 0.02, -0.32); }
    placeArm(armR, hR, new THREE.Vector3(0.22, -0.45, 0.15));
    placeArm(armL, hL, new THREE.Vector3(-0.24, -0.45, 0.12));
    armL.visible = kind !== 'nade' || true; armR.visible = true;
    fill.intensity *= Math.exp(-dt * 40);
    cam.updateMatrixWorld();
  }
  function placeArm(arm, hand, elbow) {
    arm.position.copy(hand);
    const dir = _v.copy(hand).sub(elbow).normalize();
    _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); arm.quaternion.copy(_q);
  }
  // where the muzzle / ejection port / sight are, in camera space (the game turns these into world space)
  function muzzlePos() { return info ? holder.localToWorld(info.muzzle.clone()) : holder.localToWorld(new THREE.Vector3(0, 0, -0.5)); }
  function ejectPos() { return info ? holder.localToWorld(info.eject.clone()) : null; }
  function lightPos() { return info?.lightAt ? holder.localToWorld(info.lightAt.clone()) : null; }
  function laserPos() { return info?.laserAt ? holder.localToWorld(info.laserAt.clone()) : null; }
  function flash() { fill.intensity = 3; fill.position.copy(muzzlePos()); }
  return { scene, cam, update, setGun, setMelee, setNade, setEmpty, setUniform, muzzlePos, ejectPos, lightPos, laserPos, flash, get info() { return info; }, get kind() { return kind; }, get ads() { return S.ads; }, sun, hemi, holder, arms };
}
void _e;

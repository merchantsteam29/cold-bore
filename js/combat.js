// Ballistics and wounds. A shot is traced through the map and the soldiers in steps (so it drops with
// distance and arrives late at long range), it can punch through thin walls and people, and what it does
// to whoever it hits depends on the calibre, the range, the body part and the armour they wear.
import * as THREE from 'three';
import { CAL, GUNS, ARMOR, HELMET, PARTS, MELEE, ATTACH } from './data.js';
import { raycast, MATS } from './world.js';

const G = 9.81;
// traces one round. bodies: [{ ent, body }] to test (the shooter is skipped).
// Returns { segs: [[a, b]...], hits: [{ ent, part, point, dir, dist, pen, mul }], walls: [{ point, normal, mat, exit }] }
export function traceShot(W, origin, dir, cal, bodies, shooterId, maxDist = 800) {
  const C = CAL[cal] || CAL['5.56'];
  const out = { segs: [], hits: [], walls: [] };
  const p = origin.clone(), v = dir.clone().normalize().multiplyScalar(C.vel);
  let pen = C.pen, mul = 1, travelled = 0, hitIds = new Set();
  const stepT = 0.05; // s per step: up to 47 m at 940 m/s, the drop is applied between steps
  for (let i = 0; i < 40 && travelled < maxDist && mul > 0.08; i++) {
    const segLen = v.length() * stepT, d = v.clone().normalize();
    const a = p.clone();
    let remaining = segLen, cur = p.clone();
    // inside one step: walls and bodies, nearest first, possibly several (penetration)
    for (let k = 0; k < 6 && remaining > 0.001; k++) {
      const wh = raycast(W, cur, d, remaining);
      let bh = null;
      for (const { ent, body } of bodies) {
        if (ent.id === shooterId || hitIds.has(ent.id) || !body || body.dead) continue;
        const h = body.raycast(cur, d, wh ? wh.t : remaining);
        if (h && (!bh || h.t < bh.t)) bh = { ...h, ent, body };
      }
      if (bh) {
        hitIds.add(bh.ent.id);
        out.hits.push({ ent: bh.ent, part: bh.part, point: bh.point, dir: d.clone(), dist: travelled + bh.t, pen, mul });
        // a body costs the round a lot: a pistol round stays in, a rifle round usually goes through
        const cost = bh.part === 'head' ? 2.2 : bh.part.startsWith('arm') || bh.part.startsWith('leg') ? 1.6 : 3;
        pen -= cost; mul *= 0.55;
        out.hits[out.hits.length - 1].through = pen > 0;
        if (pen <= 0) { out.segs.push([a, bh.point.clone()]); return out; }
        cur.copy(bh.point).addScaledVector(d, 0.02); remaining -= bh.t + 0.02; continue;
      }
      if (wh) {
        const M = MATS[wh.mat] || MATS.concrete;
        out.walls.push({ point: wh.point, normal: wh.normal, mat: wh.mat });
        if (wh.ground || wh.box?.edge) { out.segs.push([a, wh.point.clone()]); return out; }
        const th = Math.max(0.02, (wh.tExit ?? wh.t) - wh.t), cost = th * M.res;
        if (cost >= pen) { out.segs.push([a, wh.point.clone()]); return out; }
        pen -= cost; mul *= Math.max(0.2, 1 - cost / (C.pen + 1)) * 0.85;
        const exitP = cur.clone().addScaledVector(d, wh.tExit + 0.005);
        out.walls.push({ point: exitP.clone(), normal: d.clone(), mat: wh.mat, exit: true });
        cur.copy(exitP); remaining -= wh.tExit + 0.005; continue;
      }
      break;
    }
    p.copy(a).addScaledVector(d, segLen); travelled += segLen;
    out.segs.push([a, p.clone()]);
    v.y -= G * stepT * C.drop; v.multiplyScalar(0.985); // gravity and drag
  }
  return out;
}

// what a hit does, on the victim's side. ent: { hp, armor, helmet, bleed, wounds }.
// Returns { dmg, stopped ('plate'|'helmet'|null), part, bleed }
export function woundFrom(ent, hit) {
  const C = CAL[hit.cal], part = hit.part;
  let dmg, pen = hit.pen ?? (C ? C.pen : 1);
  if (hit.melee) dmg = (MELEE[hit.melee]?.dmg || 20) * (hit.back ? 2.2 : 1) * (part === 'head' ? 1.6 : 1);
  else if (hit.frag) dmg = hit.dmg;
  else {
    const fall = C.vel < 500 ? 140 : C.vel < 800 ? 400 : 900; // range where it's lost a good part of its energy
    dmg = C.dmg * (hit.mul ?? 1) * Math.max(0.45, 1 - (hit.dist || 0) / fall * 0.55);
  }
  let stopped = null;
  // armour: plates cover the thorax, a soft vest the thorax and stomach
  const A = ARMOR[ent.armor?.type || 'none'];
  if (!hit.melee && A && A.lvl > 0 && ent.armor.dur > 0 && (part === 'chest' || (part === 'belly' && ent.armor.type === 'iiia') || (part === 'belly' && Math.random() < 0.4))) {
    if (pen <= A.lvl) { stopped = 'plate'; dmg *= hit.frag ? 0.2 : 0.12; ent.armor.dur -= pen > A.lvl - 1.2 ? 1 : 0.5; }
    else { dmg *= 0.85; ent.armor.dur -= 1; }
  }
  const H = HELMET[ent.helmet?.type || 'none'];
  if (part === 'head' && !hit.melee && H && H.lvl > 0 && ent.helmet.dur > 0 && Math.random() < (ent.helmet.type === 'fast' ? 0.72 : 0.62)) {
    if (pen <= H.lvl) { stopped = 'helmet'; dmg = Math.min(dmg * 0.18, 22); ent.helmet.dur -= 1; }
    else ent.helmet.dur -= 1;
  }
  if (!stopped) dmg *= PARTS[part]?.mul ?? 1;
  // bleeding: proportional to the wound
  let bleed = 0;
  if (!stopped && part !== 'head') bleed = Math.min(4, dmg * (hit.frag ? 0.05 : 0.035));
  return { dmg, stopped, part, bleed, limb: !!PARTS[part]?.limb };
}

// a gun's handling numbers with its attachments
export function gunStats(id, att = []) {
  const G0 = GUNS[id]; if (!G0) return null;
  const s = { ...G0, mag: G0.mag, recoilMul: 1, ads: 1, hip: 1, reloadMul: 1, suppressed: false, bipod: false, zoom: 1, light: false };
  for (const a of att) {
    const A = ATTACH[a]; if (!A) continue;
    if (A.mag) s.mag = A.mag; if (A.recoil) s.recoilMul *= A.recoil; if (A.ads) s.ads *= A.ads; if (A.hip) s.hip *= A.hip; if (A.reloadMul) s.reloadMul *= A.reloadMul;
    if (A.suppress) s.suppressed = true; if (A.bipod) s.bipod = true; if (A.zoom) s.zoom = A.zoom; if (A.light) s.light = true;
  }
  // heavier guns are slower to bring up; snipers and LMGs are clumsy from the hip
  s.adsTime = Math.min(0.75, 0.14 + s.kg * 0.045) * s.ads;
  s.hipSpread = (G0.slot === 'sidearm' ? 0.025 : 0.035 + s.kg * 0.006) * s.hip;
  s.spare = G0.slot === 'sidearm' ? 3 : G0.cls === 'LMG' ? 1 : G0.shell ? Math.ceil(24 / G0.mag) : G0.mag <= 10 ? 4 : 3;
  return s;
}
export const ROUND_COST = { '9mm': 0.32, '9x18': 0.4, '.45': 0.5, '5.7': 0.65, '.50AE': 2.6, '.500': 3.2, '5.56': 0.48, '5.45': 0.45, '7.62x39': 0.42, '7.62x51': 1.15, '7.62x54R': 0.6, '6.8x51': 2.8, '.338': 5.2, '.50BMG': 4.6, '12ga': 0.95 };
export function ammoPrice(id) { const g = GUNS[id]; return g ? Math.ceil(g.mag * (g.shell ? 4 : 2) * (ROUND_COST[g.cal] || 0.5)) : 0; }

// frag grenade: lethal inside ~5 m, wounding to 15, blocked by walls
export function fragDamage(dist, covered) { if (covered || dist > 15) return 0; return dist < 2 ? 220 : dist < 5 ? 160 - (dist - 2) * 25 : Math.max(0, 85 - (dist - 5) * 8); }
export const _v = new THREE.Vector3();

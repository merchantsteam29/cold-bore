// Gun models, built from parts at real size (metres). The same model is used in first person and in other
// soldiers' hands. Local frame: the shooting hand's grip is the origin, the barrel points down -Z, +Y is up.
// Each model reports where its muzzle, sights, support hand, magazine and ejection port are.
import * as THREE from 'three';
import * as TX from './tex.js';
import { GUNS, ATTACH, MELEE, FINISH } from './data.js';

const matCache = new Map();
function mat(key, make) { if (!matCache.has(key)) matCache.set(key, make()); return matCache.get(key); }
const steel = () => mat('steel', () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.38, metalness: 0.75, map: TX.polymer(0x3a3d40) }));
const black = () => mat('black', () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0.25, map: TX.polymer(0x2a2b2d) }));
const K2 = () => mat('blackDS', () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0.25, map: TX.polymer(0x2a2b2d), side: THREE.DoubleSide }));
const rubber = () => mat('rubber', () => new THREE.MeshStandardMaterial({ color: 0x111112, roughness: 0.95 }));
const glass = () => mat('glass', () => new THREE.MeshStandardMaterial({ color: 0x1a3040, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.35 }));
const brass = () => mat('brass', () => new THREE.MeshStandardMaterial({ color: 0xb08a3a, roughness: 0.3, metalness: 0.95 }));
const wood = (c = 0x6a4024) => mat('wood' + c, () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, map: TX.woodPlanks(c, 40).map }));
function finishMat(fid, tint) {
  const f = FINISH[fid] || FINISH.black, col = fid === 'black' && tint ? tint : f.color;
  return mat('fin' + fid + ':' + col, () => new THREE.MeshStandardMaterial({ color: 0xffffff, map: f.pattern ? TX.finishTex(f) : TX.polymer(col === 0x1c1d1f ? 0x2a2b2d : col), roughness: 0.55, metalness: 0.3 }));
}

export function makeGun(id, { finish = 'black', att = [] } = {}) {
  const G = GUNS[id]; if (!G) return makeGun('glock17');
  const root = new THREE.Group(); root.name = 'gun:' + id;
  const F = finishMat(finish, G.tint), S = steel(), K = black();
  const box = (w, h, d, x, y, z, m = F, rx = 0, parent = root) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.x = rx; o.castShadow = true; parent.add(o); return o; };
  const cyl = (r, len, x, y, z, m = S, r2 = r, seg = 12, parent = root) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r2, len, seg), m); o.rotation.x = Math.PI / 2; o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  const info = { muzzle: new THREE.Vector3(), rail: null, sightY: 0.1, sightZ: 0, left: new THREE.Vector3(0, 0.03, -0.25), eject: new THREE.Vector3(0.03, 0.07, -0.05), mag: null, magHome: new THREE.Vector3(), under: null, side: null, pistol: G.slot === 'sidearm', len: 0.8 };
  const atts = att.map((a) => ATTACH[a] ? a : null).filter(Boolean);
  const has = (slot) => atts.find((a) => ATTACH[a].slot === slot);
  const magAtt = has('mag');
  const mag = (obj) => { info.mag = obj; info.magHome.copy(obj.position); return obj; };

  switch (G.model) {
    case 'pistol': case 'deagle': {
      const L = (G.long || 1) * (G.model === 'deagle' ? 1.35 : 1), slideH = G.model === 'deagle' ? 0.045 : 0.034;
      box(0.03, slideH, 0.19 * L, 0, 0.05, -0.06 * L, G.model === 'deagle' ? S : F);           // slide
      box(0.028, 0.022, 0.15 * L, 0, 0.026, -0.05 * L, K);                                      // frame
      const grip = box(0.028, 0.11, 0.05, 0, -0.03, 0.01, K, -0.25);                            // grip
      void grip;
      box(0.026, 0.012, 0.035, 0, 0.005, -0.045, K);                                            // trigger guard
      mag(box(0.022, 0.03, 0.04, 0, -0.09 - (magAtt ? 0.05 : 0), 0.025, S, -0.25)).scale.y = magAtt ? 4 : 1;
      box(0.006, 0.008, 0.006, 0, 0.05 + slideH / 2 + 0.004, -0.15 * L, K); box(0.02, 0.008, 0.006, 0, 0.05 + slideH / 2 + 0.004, 0.025, K); // sights
      info.muzzle.set(0, 0.05, -0.155 * L - 0.01); info.sightY = 0.05 + slideH / 2 + 0.008; info.sightZ = 0.03; info.rail = new THREE.Vector3(0, 0.05 + slideH / 2, -0.03);
      info.left.set(-0.012, -0.02, 0.0); info.eject.set(0.02, 0.06, -0.04); info.under = new THREE.Vector3(0, 0.012, -0.1 * L); info.side = info.under; info.len = 0.2 * L;
      break;
    }
    case 'revolver': {
      box(0.032, 0.04, 0.1, 0, 0.045, -0.02, F);                                                 // frame
      cyl(0.024, 0.055, 0, 0.045, -0.04, F, 0.024, 6);                                           // cylinder
      cyl(0.012, 0.21, 0, 0.055, -0.17, F); box(0.016, 0.02, 0.21, 0, 0.07, -0.17, F);           // barrel + rib
      box(0.03, 0.11, 0.045, 0, -0.025, 0.02, rubber(), -0.3);
      box(0.026, 0.012, 0.03, 0, 0.012, -0.03, F);
      mag(cyl(0.023, 0.05, 0, 0.045, -0.04, brass(), 0.023, 6)).visible = false;
      info.muzzle.set(0, 0.055, -0.285); info.sightY = 0.085; info.sightZ = 0.02; info.rail = null; info.left.set(-0.012, -0.02, 0); info.len = 0.3;
      break;
    }
    case 'ar': case 'scar': case 'mcx': {
      const is416 = G.variant === '416', scar = G.model === 'scar', mcx = G.model === 'mcx';
      const hgL = scar ? 0.3 : is416 ? 0.33 : mcx ? 0.34 : 0.3, barrelL = scar ? 0.13 : mcx ? 0.1 : is416 ? 0.07 : 0.12;
      box(0.058, 0.07, 0.2, 0, 0.065, -0.02, F);                                                // upper receiver
      box(0.052, 0.045, 0.16, 0, 0.022, 0.0, F);                                                // lower
      box(0.05, 0.02, 0.22, 0, 0.108, -0.06, K);                                                // top rail
      box(0.064, 0.064, hgL, 0, 0.068, -0.12 - hgL / 2, scar || mcx ? F : K);                   // handguard
      box(0.02, 0.012, hgL - 0.04, 0, 0.106, -0.12 - hgL / 2, K);
      cyl(0.0095, barrelL + 0.04, 0, 0.068, -0.12 - hgL - barrelL / 2 + 0.02, S);               // barrel
      const muzZ = -0.12 - hgL - barrelL;
      box(0.032, 0.1, 0.045, 0, -0.035, 0.035, K, -0.35);                                       // grip
      box(0.03, 0.012, 0.06, 0, -0.005, -0.03, K);                                               // trigger guard
      // magazine: slight curve (PMAG), or a drum
      if (magAtt === 'mag_d60') mag(cyl(0.07, 0.08, 0, -0.06, -0.075, K, 0.07, 18)).rotation.set(0, 0, Math.PI / 2);
      else { const m = box(0.026, magAtt === 'mag_pmag40' ? 0.2 : 0.15, 0.065, 0, magAtt === 'mag_pmag40' ? -0.06 : -0.035, -0.07, scar ? F : K, 0.14); mag(m); }
      // stock
      cyl(0.016, 0.16, 0, 0.06, 0.15, K);
      box(0.045, scar || mcx ? 0.075 : 0.11, 0.1, 0, scar || mcx ? 0.06 : 0.045, 0.24, scar || mcx ? F : K);
      box(0.045, 0.11, 0.015, 0, 0.045, 0.295, rubber());
      if (scar) box(0.05, 0.03, 0.2, 0, 0.12, -0.1, F);                                          // SCAR's tall upper
      // iron sights (if no optic)
      if (!has('optic')) { box(0.012, 0.03, 0.01, 0, 0.13, -0.11 - hgL, K); box(0.03, 0.025, 0.02, 0, 0.128, 0.05, K); }
      info.muzzle.set(0, 0.068, muzZ); info.rail = new THREE.Vector3(0, scar ? 0.135 : 0.118, -0.04); info.sightY = scar ? 0.155 : 0.142; info.sightZ = 0.06;
      info.left.set(-0.01, 0.03, -0.18 - hgL * 0.35); info.under = new THREE.Vector3(0, 0.034, -0.12 - hgL * 0.55); info.side = new THREE.Vector3(0.035, 0.068, -0.12 - hgL * 0.75);
      info.len = 0.9;
      break;
    }
    case 'ak': {
      const W = G.tint === 0x6a4024 ? wood(0x6a4024) : K;
      box(0.05, 0.065, 0.24, 0, 0.055, -0.02, S);                                               // receiver
      box(0.046, 0.02, 0.22, 0, 0.095, -0.01, S);                                               // dust cover
      box(0.058, 0.055, 0.2, 0, 0.055, -0.24, W);                                               // lower handguard
      box(0.04, 0.03, 0.17, 0, 0.098, -0.23, W);                                                // gas tube cover
      cyl(0.009, 0.2, 0, 0.06, -0.42, S); cyl(0.012, 0.08, 0, 0.06, -0.54, S);                 // barrel + brake
      box(0.012, 0.04, 0.02, 0, 0.09, -0.48, S);                                                 // front sight block
      box(0.03, 0.095, 0.045, 0, -0.03, 0.045, W, -0.3);                                         // grip
      box(0.028, 0.012, 0.07, 0, -0.005, -0.03, S);
      const m = box(0.028, 0.17, 0.06, 0, -0.06, -0.09, G.tint === 0x6a4024 ? mat('akmag', () => new THREE.MeshStandardMaterial({ color: 0x8a4a22, roughness: 0.55, metalness: 0.2 })) : K, 0.32); mag(m);
      box(0.04, 0.08, 0.26, 0, 0.035, 0.2, W, -0.12);                                            // stock
      box(0.042, 0.11, 0.02, 0, 0.02, 0.33, rubber());
      box(0.018, 0.014, 0.05, 0, 0.11, -0.13, S);                                                // rear sight
      info.muzzle.set(0, 0.06, -0.585); info.rail = new THREE.Vector3(0, 0.132, -0.06); info.sightY = has('optic') ? 0.152 : 0.118; info.sightZ = 0.05;
      info.left.set(-0.012, 0.03, -0.25); info.under = new THREE.Vector3(0, 0.025, -0.27); info.side = new THREE.Vector3(0.032, 0.06, -0.3); info.len = 0.88;
      break;
    }
    case 'm14': case 'bolt': case 'barrett': {
      const big = G.model === 'barrett', ax = G.variant === 'ax', bolt = G.model === 'bolt';
      const bL = big ? 0.74 : ax ? 0.62 : 0.56;
      box(0.06, 0.07, 0.28, 0, 0.055, -0.02, big ? F : S);                                     // receiver
      box(0.066, 0.066, big ? 0.42 : 0.35, 0, 0.05, -0.32, F);                                 // fore-end / handguard
      cyl(big ? 0.014 : 0.011, bL, 0, 0.065, -0.16 - bL / 2 - 0.12, S, big ? 0.014 : 0.01);    // barrel
      if (big) { box(0.1, 0.05, 0.1, 0, 0.065, -0.16 - bL - 0.14, S); }                          // the .50's huge brake
      box(0.034, 0.1, 0.045, 0, -0.035, 0.05, K, -0.25);
      box(0.03, 0.012, 0.06, 0, -0.005, -0.02, K);
      if (bolt) { cyl(0.008, 0.06, 0.04, 0.07, 0.02, S).rotation.set(0, 0, Math.PI / 2); box(0.016, 0.016, 0.016, 0.075, 0.07, 0.02, S); } // bolt handle
      const m = box(big ? 0.04 : 0.032, big ? 0.07 : bolt ? 0.04 : 0.1, big ? 0.13 : 0.08, 0, big ? -0.01 : bolt ? 0.01 : -0.02, -0.08, K); mag(m);
      // a precision stock with a cheek riser
      box(0.045, 0.1, 0.3, 0, 0.04, 0.22, F); box(0.04, 0.03, 0.16, 0, 0.1, 0.2, F); box(0.047, 0.12, 0.02, 0, 0.035, 0.37, rubber());
      box(0.05, 0.02, 0.3, 0, 0.1, -0.08, K);                                                    // rail
      info.muzzle.set(0, 0.065, -0.16 - bL - 0.12 - (big ? 0.06 : 0)); info.rail = new THREE.Vector3(0, 0.112, -0.06); info.sightY = 0.155; info.sightZ = 0.09;
      info.left.set(-0.012, 0.025, -0.32); info.under = new THREE.Vector3(0, 0.016, -0.42); info.side = new THREE.Vector3(0.036, 0.05, -0.4); info.len = big ? 1.45 : 1.15;
      break;
    }
    case 'mp5': case 'apc': case 'uzi': case 'vector': case 'p90': {
      const t = G.model;
      if (t === 'p90') {
        box(0.06, 0.1, 0.5, 0, 0.03, -0.08, F); box(0.034, 0.03, 0.3, 0, 0.1, -0.12, F); box(0.04, 0.024, 0.2, 0, 0.098, -0.1, K);
        mag(box(0.05, 0.025, 0.3, 0, 0.095, -0.12, glass()));
        info.muzzle.set(0, 0.04, -0.36); info.rail = new THREE.Vector3(0, 0.115, -0.1); info.sightY = 0.135; info.sightZ = 0.05; info.left.set(-0.015, 0.0, -0.2); info.len = 0.5;
      } else if (t === 'vector') {
        box(0.05, 0.11, 0.26, 0, 0.03, -0.08, F); box(0.044, 0.04, 0.14, 0, 0.07, -0.27, F); cyl(0.01, 0.12, 0, 0.07, -0.38, S);
        box(0.03, 0.09, 0.045, 0, -0.04, 0.04, K, -0.2);
        mag(box(0.026, 0.12 * (magAtt ? 1.25 : 1), 0.035, 0, -0.07, -0.1, K));
        cyl(0.014, 0.18, 0, 0.055, 0.15, K); box(0.04, 0.08, 0.08, 0, 0.05, 0.23, K);
        box(0.04, 0.016, 0.28, 0, 0.095, -0.12, K);
        info.muzzle.set(0, 0.07, -0.44); info.rail = new THREE.Vector3(0, 0.103, -0.08); info.sightY = 0.125; info.sightZ = 0.05; info.left.set(-0.012, 0.0, -0.22); info.under = new THREE.Vector3(0, -0.02, -0.26); info.side = new THREE.Vector3(0.03, 0.06, -0.28); info.len = 0.62;
      } else {
        const uzi = t === 'uzi', apc = t === 'apc';
        box(0.052, 0.07, uzi ? 0.22 : 0.26, 0, 0.06, -0.05, uzi ? K : apc ? K : F);
        box(0.056, 0.055, uzi ? 0.08 : 0.16, 0, 0.055, uzi ? -0.2 : -0.24, apc ? K : F);
        cyl(0.009, uzi ? 0.06 : 0.1, 0, 0.065, uzi ? -0.27 : -0.36, S);
        const gz = uzi ? -0.03 : 0.04;
        box(0.032, 0.1, 0.045, 0, -0.03, gz, K, uzi ? -0.05 : -0.25);
        if (uzi) mag(box(0.022, 0.14, 0.03, 0, -0.09, gz + 0.005, S));
        else mag(box(0.024, 0.14, 0.045, 0, -0.05, -0.11, S, t === 'mp5' ? 0.35 : 0.1));
        cyl(0.012, 0.15, 0, 0.06, 0.14, K); box(0.04, 0.08, 0.06, 0, 0.05, 0.22, K);
        box(0.04, 0.016, 0.22, 0, 0.1, -0.06, K);
        if (!has('optic')) { box(0.02, 0.03, 0.02, 0, 0.12, -0.3, K); box(0.024, 0.03, 0.02, 0, 0.115, 0.04, K); }
        info.muzzle.set(0, 0.065, uzi ? -0.3 : -0.41); info.rail = new THREE.Vector3(0, 0.108, -0.06); info.sightY = 0.13; info.sightZ = 0.05;
        info.left.set(-0.012, 0.025, uzi ? -0.2 : -0.24); info.under = new THREE.Vector3(0, 0.026, -0.25); info.side = new THREE.Vector3(0.03, 0.055, -0.26); info.len = 0.65;
      }
      break;
    }
    case 'pump': case 'benelli': case 'ks12': {
      const ks = G.model === 'ks12';
      box(0.052, 0.07, 0.24, 0, 0.055, -0.03, ks ? S : K);
      cyl(0.012, 0.5, 0, 0.075, -0.4, S);                                                        // barrel
      if (!ks) cyl(0.012, 0.42, 0, 0.042, -0.36, S);                                             // magazine tube
      const fore = box(0.05, 0.05, 0.2, 0, 0.045, -0.3, ks ? K : rubber()); info.pump = fore;
      box(0.032, 0.1, 0.045, 0, -0.035, 0.05, K, -0.3); box(0.03, 0.012, 0.06, 0, -0.005, -0.03, K);
      box(0.045, 0.1, 0.27, 0, 0.045, 0.22, K); box(0.046, 0.11, 0.02, 0, 0.04, 0.35, rubber());
      if (ks) mag(box(0.032, 0.14 * (magAtt ? 1.3 : 1), 0.09, 0, -0.05, -0.09, K, 0.2));
      else mag(box(0.01, 0.01, 0.01, 0, 0.042, -0.15, brass()));
      box(0.008, 0.012, 0.008, 0, 0.09, -0.64, brass());                                         // bead
      info.muzzle.set(0, 0.075, -0.65); info.rail = new THREE.Vector3(0, 0.095, -0.04); info.sightY = has('optic') ? 0.12 : 0.098; info.sightZ = 0.06;
      info.left.set(-0.012, 0.03, -0.3); info.side = new THREE.Vector3(0.03, 0.06, -0.45); info.len = 0.95;
      break;
    }
    case 'm249': {
      box(0.075, 0.09, 0.32, 0, 0.06, -0.02, F); box(0.07, 0.03, 0.2, 0, 0.12, -0.02, F);        // receiver + feed cover
      box(0.06, 0.06, 0.18, 0, 0.055, -0.27, K);
      cyl(0.012, 0.42, 0, 0.065, -0.5, S); box(0.03, 0.03, 0.03, 0, 0.065, -0.4, S);             // barrel + gas block
      box(0.034, 0.1, 0.045, 0, -0.035, 0.07, K, -0.25);
      mag(box(0.09, 0.12, 0.12, -0.06, -0.01, -0.04, mat('pouch', () => new THREE.MeshStandardMaterial({ color: 0x5b5a46, roughness: 1 }))));
      box(0.05, 0.1, 0.28, 0, 0.04, 0.24, K); box(0.05, 0.11, 0.02, 0, 0.04, 0.38, rubber());
      box(0.05, 0.016, 0.2, 0, 0.142, -0.02, K);
      cyl(0.01, 0.2, 0.06, -0.005, -0.33, K).rotation.set(0, 0, Math.PI / 2); // carry handle-ish
      info.muzzle.set(0, 0.065, -0.72); info.rail = new THREE.Vector3(0, 0.15, -0.02); info.sightY = has('optic') ? 0.18 : 0.165; info.sightZ = 0.06;
      info.left.set(-0.015, 0.02, -0.28); info.under = new THREE.Vector3(0, 0.02, -0.34); info.side = new THREE.Vector3(0.04, 0.06, -0.3); info.len = 1.0;
      break;
    }
  }

  // ---------- attachments ----------
  const opt = has('optic');
  if (opt && info.rail) {
    const A = ATTACH[opt], r = info.rail, g = new THREE.Group(); g.position.copy(r); root.add(g);
    let lensY = 0.03, lensZ = -0.02, lensR = 0.012, len = 0.06;
    // open housings: you look through a window, not into a box
    const tube = (r, L, y, z) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 18, 1, true), K2()); o.rotation.x = Math.PI / 2; o.position.set(0, y, z); g.add(o); const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.0025, 6, 18), K); rim.position.set(0, y, z - L / 2); g.add(rim); const rim2 = rim.clone(); rim2.position.z = z + L / 2; g.add(rim2); };
    if (opt === 'optic_rmr') { box(0.026, 0.006, 0.036, 0, 0.003, 0, K, 0, g); box(0.004, 0.02, 0.012, -0.011, 0.014, -0.012, K, 0, g); box(0.004, 0.02, 0.012, 0.011, 0.014, -0.012, K, 0, g); box(0.026, 0.004, 0.012, 0, 0.026, -0.012, K, 0, g); lensY = 0.015; lensZ = -0.014; lensR = 0.009; len = 0.012; }
    else if (opt === 'optic_dot') { tube(0.017, 0.07, 0.035, -0.02); box(0.02, 0.018, 0.03, 0, 0.009, -0.02, K, 0, g); lensY = 0.035; lensR = 0.013; len = 0.07; }
    else if (opt === 'optic_holo') { box(0.042, 0.012, 0.085, 0, 0.006, -0.02, K, 0, g); box(0.005, 0.042, 0.05, -0.0185, 0.033, -0.035, K, 0, g); box(0.005, 0.042, 0.05, 0.0185, 0.033, -0.035, K, 0, g); box(0.042, 0.006, 0.05, 0, 0.054, -0.035, K, 0, g); box(0.03, 0.012, 0.03, 0, 0.018, 0.012, K, 0, g); lensY = 0.032; lensZ = -0.03; lensR = 0.014; len = 0.06; }
    else if (opt === 'optic_acog') { cyl(0.018, 0.13, 0, 0.034, -0.03, K, 0.02, 16, g); box(0.02, 0.01, 0.02, 0, 0.056, -0.06, glass(), 0, g); lensY = 0.034; len = 0.13; }
    else { const L2 = opt === 'optic_sniper' ? 0.34 : 0.26, R2 = opt === 'optic_sniper' ? 0.028 : 0.02; cyl(0.016, L2, 0, 0.042, -0.04, K, 0.016, 16, g); cyl(R2, 0.07, 0, 0.042, -0.04 - L2 / 2 + 0.03, K, R2, 16, g); cyl(0.02, 0.06, 0, 0.042, -0.04 + L2 / 2 - 0.03, K, 0.02, 16, g); box(0.02, 0.02, 0.02, 0, 0.06, -0.04, K, 0, g); lensY = 0.042; len = L2; }
    // the lens with its reticle (only visible from behind, in first person)
    const ret = new THREE.Mesh(new THREE.CircleGeometry(lensR, 20), new THREE.MeshBasicMaterial({ map: TX.reticle(A.reticle), transparent: true, depthWrite: false, toneMapped: false }));
    ret.position.set(0, lensY, lensZ + len / 2 - 0.005); g.add(ret); info.reticle = ret;
    info.sightY = r.y + lensY; info.sightZ = r.z + len / 2 + 0.05; info.zoom = A.zoom; info.optic = opt;
    info.scope = A.zoom >= 4;
  }
  const muz = has('muzzle');
  if (muz) {
    const A = ATTACH[muz];
    if (A.suppress) { const L2 = info.pistol ? 0.15 : 0.18; cyl(info.pistol ? 0.016 : 0.02, L2, 0, info.muzzle.y, info.muzzle.z - L2 / 2, K); info.muzzle.z -= L2; }
    else { cyl(0.013, 0.05, 0, info.muzzle.y, info.muzzle.z - 0.025, S, 0.013, 6); info.muzzle.z -= 0.05; }
  }
  const und = has('under');
  if (und && info.under) {
    const u = info.under;
    if (und === 'grip_vert') box(0.03, 0.08, 0.03, 0, u.y - 0.04, u.z, K);
    else if (und === 'grip_afg') box(0.026, 0.03, 0.08, 0, u.y - 0.015, u.z, K, 0.3);
    else { box(0.02, 0.03, 0.04, 0, u.y - 0.015, u.z - 0.05, K); const l1 = box(0.012, 0.2, 0.012, -0.03, u.y - 0.1, u.z - 0.12, S, 0.5); const l2 = box(0.012, 0.2, 0.012, 0.03, u.y - 0.1, u.z - 0.12, S, 0.5); l1.rotation.z = 0.2; l2.rotation.z = -0.2; }
    if (und === 'grip_vert') info.left.set(0, u.y - 0.05, u.z);
  }
  const las = has('laser');
  if (las && info.side) {
    const s = info.side;
    if (ATTACH[las].light) { cyl(0.011, 0.11, s.x, s.y, s.z, K); info.lightAt = new THREE.Vector3(s.x, s.y, s.z - 0.06); }
    else { box(0.03, 0.03, 0.09, s.x, s.y, s.z, K); info.laserAt = new THREE.Vector3(s.x, s.y + 0.006, s.z - 0.046); }
  }
  root.userData.info = info;
  return root;
}

export function makeMelee(id) {
  const M = MELEE[id] || MELEE.fists, g = new THREE.Group(), K = black(), S = steel();
  const box = (w, h, d, x, y, z, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  if (M.model === 'knife') { box(0.025, 0.11, 0.03, 0, 0, 0, K); box(0.06, 0.012, 0.03, 0, 0.06, 0, S); box(0.004, M.len, 0.03, 0, 0.065 + M.len / 2, 0, mat('blade', () => new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.95, roughness: 0.25 }))); }
  else if (M.model === 'shovel') { box(0.025, 0.45, 0.025, 0, 0.18, 0, mat('od', () => new THREE.MeshStandardMaterial({ color: 0x3e4430, roughness: 0.8 }))); box(0.16, 0.2, 0.01, 0, 0.5, 0, S); }
  else if (M.model === 'hawk') { box(0.03, 0.36, 0.03, 0, 0.12, 0, K); box(0.012, 0.07, 0.13, 0, 0.28, -0.05, S); }
  else if (M.model === 'machete') { box(0.025, 0.13, 0.03, 0, 0, 0, K); box(0.004, 0.46, 0.045, 0, 0.3, 0, S); }
  g.userData.melee = M;
  return g;
}
export function makeGrenade(kind) {
  const g = new THREE.Group();
  const col = kind === 'frag' ? 0x3d4a2f : kind === 'smoke' ? 0x50584a : 0x4b4f52;
  const body = new THREE.Mesh(kind === 'frag' ? new THREE.SphereGeometry(0.032, 12, 10) : new THREE.CylinderGeometry(0.03, 0.03, 0.11, 12), new THREE.MeshStandardMaterial({ color: col, roughness: 0.7, metalness: 0.3 }));
  body.castShadow = true; g.add(body);
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.03, 0.05), steel()); top.position.set(0, kind === 'frag' ? 0.035 : 0.065, 0.008); g.add(top);
  return g;
}
// a spent case (instanced by the effects)
export const caseGeo = new THREE.CylinderGeometry(0.0045, 0.0045, 0.045, 6);
export const caseMat = () => brass();

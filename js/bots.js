// Bots: fake players that fill a match when there aren't enough people. They run on the host only and play
// by the same rules: they see with real lines of sight (not through walls or smoke), react after a delay,
// aim with an error that tightens the longer they track you, use cover, reload, bandage, throw grenades,
// and buy their guns and armour with money they earn from kills.
import * as THREE from 'three';
import { GUNS } from './data.js';
import { findPath, clearLine, randomNavPoint, navNearest, navPos, moveBody } from './world.js';
import { gunStats } from './combat.js';

export const BOT_NAMES = ['Kowalski', 'Reaper_6', 'xDriftz', 'Hollow', 'Sgt.Mendez', 'Nomad', 'vortexx', 'Jonesy', 'K-9', 'Pvt_Parts', 'GhostRecon', 'Sasquatch', 'Ironclad', 'Dusty', 'tactical_tom', 'Viper', 'Bravo2', 'Wolfgang', 'Ricochet', 'Moose', 'slingshot', 'Tex', 'Havoc', 'Brick', 'Odin', 'Pilot', 'MadDog', 'Juno', 'Zulu', 'Cobra'];
const DIFF = {
  easy:   { react: [0.7, 1.1], err: 0.06, head: 0.08, track: 1.2, fov: 0.75, burst: [2, 4] },
  normal: { react: [0.38, 0.62], err: 0.035, head: 0.18, track: 2.0, fov: 0.85, burst: [3, 6] },
  hard:   { react: [0.2, 0.34], err: 0.018, head: 0.32, track: 3.2, fov: 0.95, burst: [4, 8] },
};
const PREFS = {
  rifle: ['spear', 'scar17', 'hk416', 'ak74', 'm4', 'ak47'],
  cqb: ['vector', 'mp5', 'm4super', 'apc9', 'p90', 'ks12', 'uzi', 'm590', 'r870'],
  sniper: ['m82', 'axmc', 'm1a', 'r700'],
  lmg: ['m249', 'scar17', 'm4', 'ak47'],
};
const _a = new THREE.Vector3(), _b = new THREE.Vector3();

export function makeBrain(ent, diff = 'normal') {
  const roll = Math.random();
  ent.brain = { diff: DIFF[diff] || DIFF.normal, arch: roll < 0.5 ? 'rifle' : roll < 0.78 ? 'cqb' : roll < 0.93 ? 'sniper' : 'lmg', path: null, pi: 0, goal: null, repath: 0, target: null, seenT: 0, react: 0, lastSeen: null, lostT: 0, look: 0, fireT: 0, burst: 0, strafe: 0, strafeT: 0, crouchT: 0, stuck: 0, lastPos: new THREE.Vector3(), think: Math.random() * 0.2, aimErr: new THREE.Vector2(), nadeT: 10 + Math.random() * 20, healT: 0, alert: null, alertT: 0 };
}

// what a bot buys when it (re)spawns, with its own money
export function botBuy(ent, buy) {
  const B = ent.brain, prefs = PREFS[B.arch];
  // keep the gun it already owns this match if it's on its list
  let gun = ent.owned.find((g) => prefs.includes(g) && GUNS[g].slot === 'primary');
  if (!gun) for (const g of prefs) if (GUNS[g].price <= ent.money - 100) { if (buy(ent, g)) { gun = g; break; } }
  if (gun) ent.loadout.primary = gun;
  if (ent.money > 900 && ent.armor.type === 'none') buy(ent, ent.money > 2500 ? 'iv' : 'iii');
  else if (ent.money > 500 && ent.armor.type === 'none') buy(ent, 'iiia');
  if (ent.money > 700 && ent.helmet.type === 'none') buy(ent, 'ach');
  if (ent.money > 100 && (ent.util.bandage || 0) < 2) buy(ent, 'bandage');
  if (ent.money > 200 && Math.random() < 0.5) buy(ent, 'frag');
  if (ent.money > 400 && Math.random() < 0.3) buy(ent, 'smoke');
  // a scope for the sniper, a red dot for the rest
  const g = ent.loadout.primary;
  if (g && GUNS[g].att) {
    const want = B.arch === 'sniper' ? ['optic_sniper', 'optic_lpvo', 'grip_bipod'] : ['optic_holo', 'optic_dot', 'grip_vert', 'optic_acog'];
    for (const a of want) if (GUNS[g].att.includes(a) && ent.money > 400) buy(ent, a, g);
  }
}

// one bot, one frame. G: the game's host-side API
export function botThink(ent, dt, G) {
  const B = ent.brain, D = B.diff, W = G.W;
  if (!ent.alive) return;
  const st = ent.ws; if (!st || !st.stats) return;
  if (st.stats.melee || st.stats.nade) { if (!G.equip(ent, 'primary')) G.equip(ent, 'sidearm'); return; }
  const am = ent.ammo[st.id] || { mag: 0, res: 0 };
  const eye = _a.copy(ent.pos).add(_b.set(0, ent.stance === 2 ? 0.35 : ent.stance === 1 ? 1.05 : 1.62, 0)).clone();
  // ---- senses, a few times a second ----
  B.think -= dt;
  if (B.think <= 0) {
    B.think = 0.15 + Math.random() * 0.1;
    let best = null, bestD = 1e9;
    const fwd = new THREE.Vector3(-Math.sin(ent.yaw), 0, -Math.cos(ent.yaw));
    for (const o of G.enemiesOf(ent)) {
      if (!o.alive || !o.body) continue;
      const tp = o.body.center, d = tp.distanceTo(eye);
      if (d > 160) continue;
      const to = _b.copy(tp).sub(eye).setY(0).normalize(), cos = to.dot(fwd);
      const close = d < 7, hurtBy = B.hurtBy === o.id && B.hurtT > 0;
      if (cos < Math.cos(D.fov * 1.1) && !close && !hurtBy) continue;
      // prone and far is hard to spot
      if (o.stance === 2 && d > 45 && Math.random() < 0.7) continue;
      const head = o.body.headPos.clone().add(_b.set(0, 0.1, 0));
      if (!(clearLine(W, eye, tp) || clearLine(W, eye, head))) continue;
      if (G.smoky(eye, tp)) continue;
      if (d < bestD) { bestD = d; best = o; }
    }
    if (best) {
      if (B.target !== best) { B.target = best; B.react = D.react[0] + Math.random() * (D.react[1] - D.react[0]) + (bestD > 60 ? 0.2 : 0); B.seenT = 0; B.aimErr.set((Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(D.err * (1 + bestD / 40)); }
      B.lastSeen = best.pos.clone(); B.lostT = 0;
    } else if (B.target) { B.lostT += 0.2; if (B.lostT > 1.2) { B.target = null; B.goal = B.lastSeen; B.path = null; } }
    // heard gunfire: look that way
    const heard = G.lastShotNear(ent);
    if (heard && !B.target) { B.alert = heard.clone(); B.alertT = 3; if (Math.random() < 0.4) { B.goal = heard.clone(); B.path = null; } }
  }
  B.alertT -= dt; B.hurtT = (B.hurtT || 0) - dt;
  // ---- health ----
  if (ent.bleed > 0.6 && !B.target && (ent.util.bandage || ent.util.cat || ent.util.ifak) && B.healT <= 0) { G.heal(ent); B.healT = 4; }
  B.healT -= dt;
  // ---- combat ----
  const T = B.target;
  let wantMove = true, aimYaw = ent.yaw, aimPitch = 0;
  if (T && T.alive && T.body) {
    B.seenT += dt;
    const head = Math.random() < D.head;
    const aimAt = (head ? T.body.headPos.clone().add(_b.set(0, 0.1, 0)) : T.body.center.clone()).add(T.vel ? T.vel.clone().multiplyScalar(0.1) : _b.set(0, 0, 0));
    const to = aimAt.sub(eye), d = to.length();
    const errK = Math.max(0.15, 1 - B.seenT / D.track);
    aimYaw = Math.atan2(-to.x, -to.z) + B.aimErr.x * errK;
    aimPitch = Math.atan2(to.y, Math.hypot(to.x, to.z)) + B.aimErr.y * errK;
    const gs = st.stats, snipe = gs.cls === 'Sniper' || gs.cls === 'Anti-materiel' || gs.cls === 'Marksman';
    ent.ads = B.seenT > 0.2 && (d > 12 || snipe);
    if (B.seenT > B.react) {
      if (am.mag <= 0) G.reload(ent);
      else {
        B.fireT -= dt;
        if (B.fireT <= 0) {
          if (gs.modes[0] === 'auto' && d < 45) { G.fire(ent, aimYaw, aimPitch); B.burst++; if (B.burst >= D.burst[0] + Math.random() * (D.burst[1] - D.burst[0])) { B.burst = 0; B.fireT = 0.25 + Math.random() * 0.35; } else B.fireT = 60 / gs.rpm; }
          else { G.fire(ent, aimYaw, aimPitch); B.fireT = snipe ? 1.1 + Math.random() * 0.8 : Math.max(60 / gs.rpm, 0.18 + Math.random() * 0.25 + d / 200); }
        }
      }
      // close in on targets out of range for shotguns / SMGs, hold position otherwise
      wantMove = (gs.cls === 'Shotgun' && d > 14) || (gs.cls === 'SMG' && d > 35);
      if (!wantMove) {
        B.strafeT -= dt; if (B.strafeT <= 0) { B.strafeT = 0.6 + Math.random() * 1.2; B.strafe = snipe || Math.random() < 0.35 ? 0 : Math.random() < 0.5 ? -1 : 1; }
        B.crouchT -= dt; if (B.crouchT <= 0) { B.crouchT = 2 + Math.random() * 3; ent.stance = snipe && d > 30 ? (Math.random() < 0.5 ? 2 : 1) : Math.random() < 0.35 ? 1 : 0; }
      }
    }
    // a grenade at someone sitting behind cover
    B.nadeT -= dt;
    if (B.nadeT <= 0 && ent.util.frag > 0 && d > 10 && d < 32 && B.seenT > 1) { B.nadeT = 12 + Math.random() * 15; G.throwNade(ent, 'frag', T.pos); }
  } else {
    ent.ads = false;
    if (ent.stance === 2) ent.stance = 0;
    if (ent.stance === 1 && Math.random() < dt * 0.5) ent.stance = 0;
    if (am.mag < st.stats.mag * 0.4 && am.res > 0) G.reload(ent);
    if (B.alertT > 0 && B.alert) { const to = _b.copy(B.alert).sub(ent.pos); aimYaw = Math.atan2(-to.x, -to.z); }
  }
  // ---- moving ----
  B.repath -= dt;
  if (!B.goal || B.repath <= 0 || (B.path && B.pi >= B.path.length)) {
    if (!B.goal || (B.path && B.pi >= B.path.length) || B.repath < -20) { B.goal = G.botGoal(ent); B.path = null; }
  }
  if (!B.path && B.goal) { B.path = findPath(W, ent.pos, B.goal) || [B.goal.clone()]; B.pi = 1; B.repath = 6 + Math.random() * 4; }
  let mv = _b.set(0, 0, 0);
  if (wantMove && B.path && B.pi < B.path.length) {
    const wp = B.path[B.pi], to = _a.set(wp.x - ent.pos.x, 0, wp.z - ent.pos.z), d = to.length();
    if (d < 0.6) B.pi++;
    else { mv.copy(to).divideScalar(d); if (!T) aimYaw = Math.atan2(-mv.x, -mv.z) + Math.sin(performance.now() / 900 + ent.seed) * 0.4; }
  }
  if (T && !wantMove && B.strafe) { const r = new THREE.Vector3(Math.cos(ent.yaw), 0, -Math.sin(ent.yaw)); mv = r.multiplyScalar(B.strafe); }
  // turn towards the aim at a human-ish rate
  const turn = (T ? 5 : 3) * dt;
  let dy = aimYaw - ent.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
  ent.yaw += Math.max(-turn, Math.min(turn, dy)) * (Math.abs(dy) > 1 ? 1 : 1);
  if (Math.abs(dy) < turn) ent.yaw = aimYaw;
  ent.pitch += (aimPitch - ent.pitch) * Math.min(1, dt * 8);
  const sprint = !T && mv.lengthSq() > 0 && ent.stance === 0 && (B.goal && ent.pos.distanceTo(B.goal) > 20);
  ent.sprint = sprint;
  const speed = (ent.stance === 2 ? 0.8 : ent.stance === 1 ? 1.9 : sprint ? 5.6 : 3.4) * G.weightMul(ent) * (ent.limp ? 0.7 : 1);
  if (ent.stance === 2 && mv.lengthSq() > 0 && !T) ent.stance = 0;
  ent.vel.x = mv.x * speed; ent.vel.z = mv.z * speed;
  ent.vel.y -= 9.8 * dt;
  const r = moveBody(W, ent.pos, ent.vel, dt, 0.3, ent.stance === 2 ? 0.5 : ent.stance === 1 ? 1.2 : 1.8);
  if (r.onGround && r.hitWall && mv.lengthSq() > 0) ent.vel.y = 3.8; // hop a low obstacle
  // stuck: pick somewhere else
  if (ent.pos.distanceToSquared(B.lastPos) < 0.01 && mv.lengthSq() > 0) { B.stuck += dt; if (B.stuck > 1.5) { B.stuck = 0; B.goal = randomNavPoint(W); B.path = null; } } else B.stuck = 0;
  B.lastPos.copy(ent.pos);
  ent.speed = Math.hypot(ent.vel.x, ent.vel.z);
}
export function botGoalFor(ent, G) {
  const W = G.W;
  if (G.mode === 'dom') {
    const fl = G.flags.map((f, i) => ({ f, i, d: Math.hypot(f.x - ent.pos.x, f.z - ent.pos.z) }));
    const want = fl.filter(({ f }) => f.owner !== ent.team).sort((a, b) => a.d - b.d + (Math.random() - 0.5) * 30);
    const pick = want.length && Math.random() < 0.85 ? want[0] : fl[(Math.random() * fl.length) | 0];
    const r = pick.f.r * 0.7, a = Math.random() * 6.28;
    const [cx, cz] = navNearest(W, pick.f.x + Math.cos(a) * r, pick.f.z + Math.sin(a) * r); return navPos(W, cx, cz);
  }
  // deathmatch: head roughly towards where the fighting is
  const foes = G.enemiesOf(ent).filter((o) => o.alive);
  if (foes.length && Math.random() < 0.7) { const o = foes[(Math.random() * foes.length) | 0]; const [cx, cz] = navNearest(W, o.pos.x + (Math.random() - 0.5) * 30, o.pos.z + (Math.random() - 0.5) * 30); return navPos(W, cx, cz); }
  return randomNavPoint(W);
}
export function botLoadoutFor(ent) { return gunStats(ent.loadout.primary || ent.loadout.sidearm); }

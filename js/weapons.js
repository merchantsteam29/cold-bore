// Weapon handling for any soldier (you, other players' copies, bots): magazines and reserve rounds per gun,
// reloads (a tactical reload keeps the round in the chamber, an empty one is slower), shell-by-shell loading,
// bolt and pump cycling, fire modes, switching, melee, grenades with cooking, and first aid.
import { GUNS, MELEE, UTIL, CAL } from './data.js';
import { gunStats } from './combat.js';

export function newKit(ent) {
  ent.loadout = { primary: null, sidearm: 'glock17', melee: 'fists' };
  ent.owned = ['glock17', 'fists']; // bought this match
  ent.att = {};                      // gunId -> [attachment ids] bought
  ent.ammo = {};
  ent.util = { frag: 0, flash: 0, smoke: 0, bandage: 0, cat: 0, ifak: 0 };
  ent.armor = { type: 'none', dur: 0 }; ent.helmet = { type: 'none', dur: 0 };
}
// a fresh life: full magazines for whatever you're carrying
export function arm(ent) {
  for (const id of [ent.loadout.primary, ent.loadout.sidearm, ent.picked?.id]) {
    if (!id || !GUNS[id]) continue;
    const s = gunStats(id, ent.att[id] || []);
    ent.ammo[id] = { mag: s.mag + (s.shell || s.modes[0] === 'bolt' || s.cls === 'Revolver' ? 0 : 1), res: s.mag * s.spare };
  }
  ent.ws = { slot: null, id: null, stats: null, reloadT: -1, reloadDur: 0, cycleT: -1, cycleDur: 0, fireT: 0, mode: 0, switchT: 0, swingT: -1, healT: -1, healItem: null, nade: null, throwT: -1, burst: 0, trig: false };
  equip(ent, ent.loadout.primary ? 'primary' : 'sidearm', true);
}
export function curGun(ent) { const w = ent.ws; return w && (w.slot === 'primary' || w.slot === 'sidearm' || w.slot === 'picked') ? w.id : null; }
export function equip(ent, slot, instant = false) {
  const w = ent.ws; if (!w) return;
  const id = slot === 'primary' ? ent.loadout.primary : slot === 'sidearm' ? ent.loadout.sidearm : slot === 'melee' ? ent.loadout.melee : slot === 'picked' ? ent.picked?.id : null;
  if (!id) return false;
  if (w.slot === slot && w.id === id) return true;
  w.slot = slot; w.id = id; w.reloadT = -1; w.cycleT = -1; w.swingT = -1; w.mode = 0;
  w.stats = slot === 'melee' ? { ...MELEE[id], melee: true } : gunStats(id, slot === 'picked' ? ent.picked.att : ent.att[id] || []);
  if (!ent.ammo[id] && GUNS[id]) ent.ammo[id] = { mag: w.stats.mag, res: w.stats.mag * w.stats.spare };
  w.switchT = instant ? 0 : slot === 'melee' ? 0.3 : GUNS[id]?.slot === 'sidearm' ? 0.35 : 0.3 + (w.stats.kg || 3) * 0.05;
  w.switchDur = w.switchT;
  return true;
}
const busy = (w) => w.reloadT >= 0 || w.cycleT >= 0 || w.switchT > 0 || w.swingT >= 0 || w.healT >= 0 || w.throwT >= 0;
export function isBusy(ent) { return busy(ent.ws); }

// timers; G.onReloadDone etc. are optional hooks for sounds
export function tick(ent, dt, G) {
  const w = ent.ws; if (!w) return;
  if (w.switchT > 0) w.switchT = Math.max(0, w.switchT - dt);
  w.fireT -= dt;
  if (w.reloadT >= 0) {
    w.reloadT += dt;
    const a = ent.ammo[w.id], s = w.stats;
    if (s.shell) {
      // one shell at a time; firing (or running out) stops the loading
      if (w.reloadT >= w.reloadDur) {
        if (a.res > 0 && a.mag < s.mag) { a.mag++; a.res--; G?.sound?.(ent, 'shell'); w.reloadT = 0; }
        if (a.mag >= s.mag || a.res <= 0) { w.reloadT = -1; if (w.needPump) { w.needPump = false; w.cycleT = 0; w.cycleDur = 0.45; G?.sound?.(ent, 'pump'); } }
      }
    } else if (w.reloadT >= w.reloadDur) {
      const keep = a.mag > 0 && s.modes[0] !== 'bolt' && s.cls !== 'Revolver' && s.cls !== 'LMG' ? 1 : 0; // the round in the chamber
      const want = s.mag + keep - a.mag, take = Math.min(want, a.res + (a.mag - keep > 0 ? 0 : 0));
      // the old magazine (and what's left in it) goes back in the pouch, like a real tactical reload
      a.res += Math.max(0, a.mag - keep); const put = Math.min(s.mag, a.res); a.res -= put; a.mag = put + keep;
      void take;
      w.reloadT = -1; G?.sound?.(ent, s.modes[0] === 'bolt' ? 'bolt' : 'in');
    } else if (!w.outPlayed && w.reloadT > w.reloadDur * 0.3) { w.outPlayed = true; G?.sound?.(ent, 'out'); }
  }
  if (w.cycleT >= 0) { w.cycleT += dt; if (w.cycleT >= w.cycleDur) w.cycleT = -1; }
  if (w.swingT >= 0) {
    const was = w.swingT; w.swingT += dt / (w.stats.rate || 0.6);
    if (was < 0.4 && w.swingT >= 0.4) G?.meleeHit?.(ent);
    if (w.swingT >= 1) w.swingT = -1;
  }
  if (w.healT >= 0) {
    w.healT += dt;
    const U = UTIL[w.healItem];
    if (w.healT >= U.time) { w.healT = -1; G?.healDone?.(ent, w.healItem); w.healItem = null; }
  }
  if (w.throwT >= 0) {
    const was = w.throwT; w.throwT += dt / 0.55;
    if (was < 0.6 && w.throwT >= 0.6) G?.release?.(ent);
    if (w.throwT >= 1) { w.throwT = -1; w.nade = null; equip(ent, w.prevSlot || 'primary', false) || equip(ent, 'sidearm'); }
  }
  if (w.nade && w.nade.cooking) { w.nade.cook += dt; if (w.nade.kind === 'frag' && w.nade.cook >= UTIL.frag.fuse) G?.release?.(ent, true); }
}

// one trigger pull; returns true if a round went
export function canFire(ent) {
  const w = ent.ws; if (!w || !w.stats || w.stats.melee) return false;
  if (w.switchT > 0 || w.healT >= 0 || w.throwT >= 0 || w.cycleT >= 0 || w.fireT > 0) return false;
  const a = ent.ammo[w.id]; if (!a) return false;
  if (w.reloadT >= 0) { if (w.stats.shell && a.mag > 0) { w.reloadT = -1; return true; } return false; }
  return a.mag > 0;
}
export function fired(ent) {
  const w = ent.ws, s = w.stats, a = ent.ammo[w.id];
  a.mag--; w.fireT = 60 / s.rpm;
  const mode = s.modes[w.mode] || s.modes[0];
  if (mode === 'bolt' && a.mag > 0) { w.cycleT = 0; w.cycleDur = 60 / s.rpm * 0.85; w.cycleKind = 'bolt'; w.fireT = 0; }
  if (mode === 'pump' && a.mag > 0) { w.cycleT = 0; w.cycleDur = 60 / s.rpm * 0.8; w.cycleKind = 'pump'; w.fireT = 0; }
  return mode;
}
export function fireMode(ent) { const w = ent.ws; return w?.stats?.modes ? w.stats.modes[w.mode] || w.stats.modes[0] : null; }
export function toggleMode(ent) { const w = ent.ws; if (!w?.stats?.modes || w.stats.modes.length < 2) return false; w.mode = (w.mode + 1) % w.stats.modes.length; return true; }
export function reload(ent, G) {
  const w = ent.ws; if (!w || !w.stats || w.stats.melee || busy(w)) return false;
  const a = ent.ammo[w.id], s = w.stats; if (!a || a.res <= 0) return false;
  const full = s.mag + (s.shell || s.modes[0] === 'bolt' || s.cls === 'Revolver' || s.cls === 'LMG' ? 0 : 1);
  if (a.mag >= full || (s.shell && a.mag >= s.mag)) return false;
  w.reloadT = 0; w.outPlayed = false;
  w.reloadDur = (s.shell ? s.reload[0] : a.mag > 0 ? s.reload[0] : s.reload[1]) * s.reloadMul;
  if (s.shell && a.mag === 0 && s.modes[0] === 'pump') w.needPump = true;
  if (!s.shell) G?.sound?.(ent, s.cls === 'LMG' ? 'belt' : 'out0');
  return true;
}
export function swing(ent) { const w = ent.ws; if (!w || busy(w) || !w.stats?.melee) return false; w.swingT = 0; return true; }
// a quick melee from any weapon: switch to the knife and swing
export function quickMelee(ent) { const w = ent.ws; if (!w || busy(w)) return false; w.quickFrom = w.slot === 'melee' ? null : w.slot; equip(ent, 'melee', true); w.swingT = 0; return true; }
export function startNade(ent, kind) {
  const w = ent.ws; if (!w || busy(w) || !(ent.util[kind] > 0)) return false;
  w.prevSlot = w.slot === 'melee' ? w.quickFrom || 'primary' : w.slot; w.nade = { kind, cook: 0, cooking: kind === 'frag' }; w.slot = 'nade'; w.id = kind; w.stats = { nade: true }; w.switchT = 0.25; w.switchDur = 0.25;
  ent.util[kind]--; return true;
}
export function throwNow(ent) { const w = ent.ws; if (!w?.nade || w.throwT >= 0) return false; w.throwT = 0; return true; }
// first aid: a tourniquet for limb bleeds, a bandage for the rest, an IFAK when hurt
export function pickMed(ent) {
  const u = ent.util;
  if (ent.limbBleed && u.cat > 0) return 'cat';
  if (ent.bleed > 0.05 && u.bandage > 0) return 'bandage';
  if ((ent.bleed > 0.05 || ent.hp < 75) && u.ifak > 0) return 'ifak';
  if (ent.limbBleed && u.ifak > 0) return 'ifak';
  return null;
}
export function startHeal(ent) {
  const w = ent.ws; if (!w || busy(w)) return null;
  const it = pickMed(ent); if (!it) return null;
  ent.util[it]--; w.healT = 0; w.healItem = it; return it;
}
export function gunKey(ent) {
  const w = ent.ws; if (!w) return '';
  if (w.slot === 'melee') return 'm:' + w.id;
  if (w.slot === 'nade') return 'n:' + w.id;
  const att = w.slot === 'picked' ? ent.picked?.att || [] : ent.att[w.id] || [];
  return w.id + '|' + att.join(',') + '|' + (ent.finish?.[w.id] || 'black');
}
export const calOf = (id) => GUNS[id]?.cal;
export const supersonic = (cal) => (CAL[cal]?.vel || 0) > 343;

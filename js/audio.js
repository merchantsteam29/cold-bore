// COLD BORE sound: all made live with Web Audio, no files. Gunshots are built per calibre (the crack, the
// body, the slap off the buildings), far ones arrive late (sound travels at 343 m/s) and lose their top end,
// suppressed ones are a cough. Rounds passing close snap. A flashbang leaves you deaf with a ringing.
let ctx = null, master, sfx, amb, verb, verbIn, noiseBuf, deafF, listenerReady = false;
const L = { pos: { x: 0, y: 0, z: 0 } };
export const audio = { vol: 0.8, get ctx() { return ctx; } };

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = audio.vol;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 6; comp.attack.value = 0.002; comp.release.value = 0.2;
  deafF = ctx.createBiquadFilter(); deafF.type = 'lowpass'; deafF.frequency.value = 20000;
  master.connect(deafF).connect(comp).connect(ctx.destination);
  sfx = ctx.createGain(); sfx.connect(master);
  amb = ctx.createGain(); amb.gain.value = 0.6; amb.connect(master);
  // an outdoor slap-back: short, bright, sparse
  verb = ctx.createConvolver(); const len = ctx.sampleRate * 2.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) { const t = i / len; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 4) * (Math.random() < 0.3 + (1 - t) * 0.5 ? 1 : 0.2); } }
  verb.buffer = ir; verbIn = ctx.createGain(); verbIn.gain.value = 0.5; verbIn.connect(verb); const vo = ctx.createGain(); vo.gain.value = 0.45; verb.connect(vo).connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  startAmbience();
  loadSamples();
}
export function setVolume(v) { audio.vol = v; if (master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.05); }
const now = () => ctx.currentTime;
function noise(loop = false) { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = loop; return s; }
function env(g, t, a, peak, d, end = 0.0001) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(end, t + a + d); }
function filt(type, f, q = 1) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }

export function setListener(pos, fwd) {
  if (!ctx) return; const Ls = ctx.listener; L.pos = { x: pos.x, y: pos.y, z: pos.z };
  if (Ls.positionX) { Ls.positionX.value = pos.x; Ls.positionY.value = pos.y; Ls.positionZ.value = pos.z; Ls.forwardX.value = fwd.x; Ls.forwardY.value = fwd.y; Ls.forwardZ.value = fwd.z; Ls.upX.value = 0; Ls.upY.value = 1; Ls.upZ.value = 0; }
  else { Ls.setPosition(pos.x, pos.y, pos.z); Ls.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0); }
  listenerReady = true;
}
const distTo = (p) => p ? Math.hypot(p.x - L.pos.x, p.y - L.pos.y, p.z - L.pos.z) : 0;
// a sound placed in the world; far = 0..1 (how much the distance has eaten the highs)
function out(pos, wet = 0.4, ref = 2, roll = 1) {
  const g = ctx.createGain();
  let node = g;
  if (pos && listenerReady) {
    const d = distTo(pos), lp = filt('lowpass', Math.max(700, 18000 / (1 + d / 18)));
    g.connect(lp); node = lp;
    const p = ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = roll; p.maxDistance = 600;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
    node.connect(p); p.connect(sfx); const w = ctx.createGain(); w.gain.value = wet * Math.min(2, 0.6 + d / 40); p.connect(w).connect(verbIn);
  } else { node.connect(sfx); const w = ctx.createGain(); w.gain.value = wet; node.connect(w).connect(verbIn); }
  return g;
}
const delayOf = (pos) => pos ? Math.min(1.5, distTo(pos) / 343) : 0;

// per calibre: crack (Hz), body (Hz), loudness, length, tail
const CALS = {
  '9mm': [2600, 140, 0.8, 0.09, 0.5], '9x18': [2500, 135, 0.75, 0.09, 0.5], '.45': [2000, 110, 0.85, 0.11, 0.55], '5.7': [3400, 160, 0.75, 0.07, 0.5], '.50AE': [1500, 80, 1.1, 0.16, 0.8], '.500': [1300, 70, 1.2, 0.18, 0.9],
  '5.56': [3000, 120, 1, 0.1, 0.8], '5.45': [3100, 125, 1, 0.1, 0.8], '7.62x39': [2300, 100, 1.05, 0.12, 0.9], '7.62x51': [2000, 85, 1.15, 0.14, 1.1], '7.62x54R': [1950, 82, 1.2, 0.15, 1.2], '6.8x51': [2100, 85, 1.2, 0.15, 1.15],
  '.338': [1700, 70, 1.3, 0.18, 1.4], '.50BMG': [1100, 50, 1.5, 0.26, 1.8], '12ga': [1500, 75, 1.2, 0.15, 1.0],
};
// ---------- recorded sounds ----------
// Real recordings in sounds/, listed in sounds/sounds.json as { "rifle": ["rifle1.ogg", ...], ... }. Anything
// listed is used instead of the synthesized version; anything missing falls back to the synth, so the game
// works with none, some or all of them. Keys (and what stands in when one is missing):
const FALLBACK = { pistol45: 'pistol', smg: 'pistol', magnum: 'pistol', ak: 'rifle', battle: 'rifle', sniper: 'battle', fifty: 'sniper', shotgun: 'battle',
  suppressed_rifle: 'suppressed_pistol', suppressed_pistol: null, mag_out: null, mag_in: null, bolt: null, pump: null, slide: null, shell_load: 'mag_in',
  explosion: null, casing: null, casing_shotgun: 'casing', dryfire: null, impact_flesh: null, impact_stone: null, impact_metal: null, impact_wood: 'impact_stone' };
const BUF = {}; let samplesP = null;
export function loadSamples(base = 'sounds/') {
  if (samplesP || !ctx) return samplesP;
  samplesP = (async () => {
    let list; try { const r = await fetch(base + 'sounds.json'); if (!r.ok) return; list = await r.json(); } catch { return; }
    await Promise.all(Object.entries(list).map(async ([k, files]) => {
      const out = [];
      for (const f of [].concat(files)) { try { const ab = await (await fetch(base + f)).arrayBuffer(); out.push(await ctx.decodeAudioData(ab)); } catch { /* skip a bad file */ } }
      if (out.length) BUF[k] = out;
    }));
  })();
  return samplesP;
}
// far versions (recorded at a distance) stand in for themselves: 'rifle_far' -> 'rifle'
const pick = (k) => { while (k && !BUF[k]) k = k.endsWith('_far') ? k.slice(0, -4) : FALLBACK[k]; return k ? BUF[k][(Math.random() * BUF[k].length) | 0] : null; };
export const hasSample = (k) => !!pick(k);
// plays one, placed in the world like the synth sounds; rate varies the pitch slightly so repeats don't sound copied
function sample(k, pos = null, vol = 1, t = null, rate = 1, wet = 0.3) {
  const b = pick(k); if (!b || !ctx) return false;
  const s = ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = rate * (0.96 + Math.random() * 0.08);
  const g = out(pos, wet, pos ? 6 : 2, pos ? 0.7 : 1); g.gain.value = vol; s.connect(g); s.start(t ?? now());
  return true;
}
const CAL_KEY = { '9x18': 'pistol', '9mm': 'pistol', '.45': 'pistol45', '5.7': 'smg', '.50AE': 'magnum', '.500': 'magnum', '5.56': 'rifle', '5.45': 'rifle', '7.62x39': 'ak', '7.62x51': 'battle', '7.62x54R': 'sniper', '6.8x51': 'battle', '.338': 'sniper', '.50BMG': 'fifty', '12ga': 'shotgun' };

export function gunshot(cal, pos = null, suppressed = false, mine = false) {
  if (!ctx) return; const C = CALS[cal] || CALS['5.56'];
  const t = now() + delayOf(pos), vol = C[2] * (mine ? 0.9 : 1.6);
  const key = suppressed ? (C[1] > 100 && cal !== '9mm' && cal !== '.45' ? 'suppressed_rifle' : 'suppressed_pistol') : CAL_KEY[cal] || 'rifle';
  // a recording if there is one; calibres that borrow another's recording are pitched to suit
  const borrowed = !BUF[key], rate = borrowed ? ({ ak: 0.92, battle: 0.85, sniper: 0.78, fifty: 0.65, magnum: 0.85, smg: 1.1, shotgun: 0.8 }[key] || 1) : key === 'magnum' ? 0.86 : 1;
  // past ~40 m, the take recorded from further away (its own echo and lost highs)
  const far = pos && distTo(pos) > 40 && !suppressed ? key + '_far' : key;
  if (sample(far, pos, Math.min(1.4, vol * 0.8), t, rate, far === key ? 0.35 : 0.15)) {
    if (!suppressed && C[4] > 0.9) { const e = noise(), lp = filt('lowpass', 700), eg = out(pos, 0.3, 6, 0.6); e.connect(lp).connect(eg); const d = 0.08; eg.gain.setValueAtTime(0.0001, t); eg.gain.exponentialRampToValueAtTime(vol * 0.12 * C[4], t + d); eg.gain.exponentialRampToValueAtTime(0.0001, t + d + C[4]); e.start(t, Math.random()); e.stop(t + d + C[4] + 0.1); }
    return;
  }
  if (suppressed) {
    // a suppressed rifle is still loud-ish (~135 dB), a pistol a cough; the mechanism clacks
    const n = noise(), bp = filt('bandpass', C[0] * 0.35, 0.8), g = out(pos, 0.15, 2.5, 1.4); n.connect(bp).connect(g); env(g, t, 0.002, vol * (C[1] > 100 ? 0.25 : 0.4), 0.08); n.start(t, Math.random()); n.stop(t + 0.15);
    click(0.15, t + 0.01, pos); return;
  }
  const n = noise(), hp = filt('bandpass', C[0] * (0.9 + Math.random() * 0.2), 0.6), g = out(pos, 0.35, 4, 0.9);
  n.connect(hp).connect(g); env(g, t, 0.0008, vol, C[3]); n.start(t, Math.random()); n.stop(t + C[3] + 0.05);
  const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(C[1] * 2.2, t); o.frequency.exponentialRampToValueAtTime(C[1] * 0.45, t + 0.15);
  const og = out(pos, 0.25, 4, 0.9); o.connect(og); env(og, t, 0.001, vol * 0.95, 0.16); o.start(t); o.stop(t + 0.22);
  // the slap and roll off the buildings
  const e = noise(), lp = filt('lowpass', 1100), eg = out(pos, 0.25, 6, 0.6); e.connect(lp).connect(eg);
  const d = 0.05 + Math.random() * 0.05; eg.gain.setValueAtTime(0.0001, t); eg.gain.exponentialRampToValueAtTime(vol * 0.3 * C[4], t + d); eg.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.25 + C[4] * 0.8);
  e.start(t, Math.random()); e.stop(t + d + C[4] + 0.4);
}
// a round passing close: a supersonic snap (or a buzz for subsonic pistol rounds)
export function snap(pos, supersonic = true) {
  if (!ctx) return; const t = now();
  if (supersonic) { const n = noise(), hp = filt('highpass', 3500, 0.7), g = out(pos, 0.1, 1, 1); n.connect(hp).connect(g); env(g, t, 0.0005, 0.9, 0.03); n.start(t, Math.random()); n.stop(t + 0.05); }
  else { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(400, t + 0.12); const g = out(pos, 0, 1, 1); o.connect(g); env(g, t, 0.01, 0.12, 0.1); o.start(t); o.stop(t + 0.15); }
}
export function click(vol = 0.3, t = null, pos = null) { if (!ctx) return; t = t ?? now(); const n = noise(), bp = filt('bandpass', 3500, 5), g = out(pos, 0.05); n.connect(bp).connect(g); env(g, t, 0.0005, vol, 0.025); n.start(t, Math.random()); n.stop(t + 0.04); }
export function dryFire() { if (!sample('dryfire', null, 0.6)) click(0.4); }
export function mech(kind = 'in', pos = null) { // reload parts: out / in / bolt / slide / pump / shell / belt
  if (!ctx) return; const t = now();
  const sk = { out: 'mag_out', in: 'mag_in', bolt: 'bolt', slide: 'slide', pump: 'pump', shell: 'shell_load', belt: 'mag_in', cock: 'slide' }[kind];
  if (sk && sample(sk, pos, 0.8, null, 1, 0.05)) return;
  const f = { out: [1600, 0.25], in: [1100, 0.4], bolt: [2200, 0.45], slide: [2600, 0.4], pump: [900, 0.5], shell: [2400, 0.25], belt: [800, 0.3], cock: [1900, 0.35] }[kind] || [1500, 0.3];
  const n = noise(), bp = filt('bandpass', f[0], 4), g = out(pos, 0.05, 1.5); n.connect(bp).connect(g); env(g, t, 0.001, f[1], 0.05); n.start(t, Math.random()); n.stop(t + 0.08);
  const n2 = noise(), bp2 = filt('bandpass', f[0] * 0.6, 3), g2 = out(pos, 0.05, 1.5); n2.connect(bp2).connect(g2); env(g2, t + 0.07, 0.001, f[1] * 0.7, 0.04); n2.start(t + 0.07, Math.random()); n2.stop(t + 0.13);
}
export function impact(pos, what = 'stone') {
  if (!ctx) return; const t = now() + delayOf(pos) * 0.5;
  const ik = { flesh: 'impact_flesh', metal: 'impact_metal', helmet: 'impact_metal', plate: 'impact_metal', wood: 'impact_wood' }[what] || 'impact_stone';
  if (sample(ik, pos, what === 'flesh' ? 0.9 : 0.6, t, what === 'plate' ? 0.8 : 1, 0.15)) return;
  if (what === 'flesh') { const n = noise(), lp = filt('lowpass', 700), g = out(pos, 0.1, 1.5); n.connect(lp).connect(g); env(g, t, 0.001, 0.7, 0.08); n.start(t, Math.random()); n.stop(t + 0.12); const o = ctx.createOscillator(); o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.08); const og = out(pos, 0, 1.5); o.connect(og); env(og, t, 0.001, 0.5, 0.08); o.start(t); o.stop(t + 0.1); return; }
  if (what === 'helmet') { for (const fq of [2400, 3700]) { const o = ctx.createOscillator(); o.frequency.value = fq; const g = out(pos, 0.2, 1.5); o.connect(g); env(g, t, 0.001, 0.25, 0.25); o.start(t); o.stop(t + 0.3); } return; }
  if (what === 'plate') { const n = noise(), bp = filt('bandpass', 1800, 3), g = out(pos, 0.2, 1.5); n.connect(bp).connect(g); env(g, t, 0.001, 0.8, 0.12); n.start(t, Math.random()); n.stop(t + 0.16); return; }
  const fq = { metal: 4200, wood: 900, dirt: 600, stone: 2000, dust: 700 }[what] || 2000;
  const n = noise(), bp = filt('bandpass', fq, what === 'metal' ? 9 : 1.5), g = out(pos, 0.25, 1.5); n.connect(bp).connect(g); env(g, t, 0.001, what === 'metal' ? 0.3 : 0.35, what === 'metal' ? 0.25 : 0.05); n.start(t, Math.random()); n.stop(t + 0.3);
}
export function shell(pos = null, shotgun = false) { // a casing landing
  if (!ctx) return; const t = now() + 0.35 + Math.random() * 0.2;
  if (sample(shotgun ? 'casing_shotgun' : 'casing', pos, 0.35, t, 1, 0.02)) return;
  if (shotgun) { const n = noise(), bp = filt('bandpass', 900, 3), g = out(pos, 0.05, 1); n.connect(bp).connect(g); env(g, t, 0.001, 0.05, 0.05); n.start(t, Math.random()); n.stop(t + 0.07); return; }
  for (let i = 0; i < 3; i++) { const o = ctx.createOscillator(); o.frequency.value = 5000 + Math.random() * 2500; const g = out(pos, 0.05, 1); o.connect(g); env(g, t + i * 0.06, 0.001, 0.025, 0.05); o.start(t + i * 0.06); o.stop(t + i * 0.06 + 0.07); }
}
export function swing() {
  if (!ctx) return; const t = now(); const n = noise(), bp = filt('bandpass', 1200, 1.5), g = out(null, 0.05); n.connect(bp).connect(g);
  bp.frequency.setValueAtTime(500, t); bp.frequency.exponentialRampToValueAtTime(2600, t + 0.15); env(g, t, 0.02, 0.3, 0.15); n.start(t, Math.random()); n.stop(t + 0.2);
}
export function boom(pos, vol = 1) {
  if (!ctx) return; const t = now() + delayOf(pos);
  if (sample('explosion', pos, 1.4 * vol, t, vol < 1 ? 1.25 : 1, 0.6)) return;
  const n = noise(), lp = filt('lowpass', 500), g = out(pos, 0.9, 6, 0.7); n.connect(lp).connect(g); env(g, t, 0.003, vol * 1.6, 2.4); lp.frequency.setValueAtTime(2400, t); lp.frequency.exponentialRampToValueAtTime(90, t + 1.6); n.start(t); n.stop(t + 2.6);
  const o = ctx.createOscillator(); o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(28, t + 0.8); const og = out(pos, 0.3, 6, 0.7); o.connect(og); env(og, t, 0.005, vol * 1.2, 0.9); o.start(t); o.stop(t + 1);
  // debris pattering down
  for (let i = 0; i < 8; i++) { const tt = t + 0.4 + Math.random() * 1.2; const d = noise(), bp = filt('bandpass', 1500 + Math.random() * 2500, 3), dg = out(pos, 0.1, 3); d.connect(bp).connect(dg); env(dg, tt, 0.001, 0.05, 0.03); d.start(tt, Math.random()); d.stop(tt + 0.05); }
}
export function bang(pos) { boom(pos, 0.8); }
export function hiss(pos, len = 2.5) { if (!ctx) return; const t = now(); const n = noise(true), bp = filt('bandpass', 3000, 0.6), g = out(pos, 0.1, 2); n.connect(bp).connect(g); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + len); n.start(t); n.stop(t + len + 0.1); }
export function pin() { if (!ctx) return; mech('cock'); const t = now() + 0.15; const o = ctx.createOscillator(); o.frequency.value = 3200; const g = out(null, 0); o.connect(g); env(g, t, 0.001, 0.08, 0.15); o.start(t); o.stop(t + 0.2); }
export function bounce(pos) { if (!ctx) return; const t = now(); const o = ctx.createOscillator(); o.frequency.value = 900 + Math.random() * 400; const g = out(pos, 0.05, 1); o.connect(g); env(g, t, 0.001, 0.12, 0.06); o.start(t); o.stop(t + 0.08); }
// being flashed: everything muffled, a high ring that fades
let ringO = null;
export function deafen(amount = 1, secs = 4) {
  if (!ctx) return; const t = now();
  deafF.frequency.cancelScheduledValues(t); deafF.frequency.setValueAtTime(300 + (1 - amount) * 4000, t); deafF.frequency.exponentialRampToValueAtTime(20000, t + secs);
  ringO?.stop(); ringO = ctx.createOscillator(); ringO.frequency.value = 4100 + Math.random() * 400; const g = ctx.createGain(); ringO.connect(g).connect(ctx.destination);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06 * amount, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + secs * 1.2); ringO.start(t); ringO.stop(t + secs * 1.2 + 0.1);
}
export function hitTick(kill = false, head = false) {
  if (!ctx) return; const t = now();
  const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = head ? 1800 : kill ? 900 : 1300; const g = ctx.createGain(); o.connect(filt('lowpass', 3000)).connect(g).connect(master);
  env(g, t, 0.001, head ? 0.08 : 0.05, kill ? 0.12 : 0.04); o.start(t); o.stop(t + 0.15);
}
export function hurt(vol = 0.6) { // getting hit: a thump in the chest, a grunt
  if (!ctx) return; const t = now();
  const o = ctx.createOscillator(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12); const g = out(null, 0); o.connect(g); env(g, t, 0.002, vol, 0.12); o.start(t); o.stop(t + 0.15);
  const v = ctx.createOscillator(); v.type = 'sawtooth'; v.frequency.setValueAtTime(140 + Math.random() * 40, t); v.frequency.linearRampToValueAtTime(90, t + 0.25); const bp = filt('bandpass', 700, 3), vg = out(null, 0.05); v.connect(bp).connect(vg); env(vg, t + 0.02, 0.02, vol * 0.25, 0.22); v.start(t); v.stop(t + 0.3);
}
export function heartbeat(rate) { if (!ctx) return; const t = now(); for (const [dt, v] of [[0, 0.35], [0.16, 0.22]]) { const o = ctx.createOscillator(); o.frequency.value = 52; const g = ctx.createGain(); o.connect(g).connect(master); env(g, t + dt, 0.01, v * rate, 0.1); o.start(t + dt); o.stop(t + dt + 0.15); } }
export function step(surface = 'sand', vol = 0.25, pos = null) {
  if (!ctx) return; const t = now();
  const fq = { sand: 900, concrete: 1800, metal: 2600, wood: 1200 }[surface] || 1200;
  const n = noise(), bp = filt('bandpass', fq * (0.8 + Math.random() * 0.4), surface === 'metal' ? 6 : 1.4), g = out(pos, 0.05, 1.5, 1.5); n.connect(bp).connect(g); env(g, t, 0.004, vol, surface === 'sand' ? 0.09 : 0.05); n.start(t, Math.random()); n.stop(t + 0.12);
}
export function ui(kind = 'click') {
  if (!ctx) return; const t = now();
  const fq = kind === 'buy' ? 1500 : kind === 'deny' ? 220 : kind === 'cash' ? 2200 : 900;
  const o = ctx.createOscillator(); o.type = kind === 'deny' ? 'square' : 'sine'; o.frequency.value = fq; const g = ctx.createGain(); o.connect(g).connect(master); env(g, t, 0.003, 0.06, kind === 'cash' ? 0.25 : 0.06); o.start(t); o.stop(t + 0.3);
  if (kind === 'buy' || kind === 'cash') { const o2 = ctx.createOscillator(); o2.frequency.value = fq * 1.5; const g2 = ctx.createGain(); o2.connect(g2).connect(master); env(g2, t + 0.07, 0.003, 0.05, 0.15); o2.start(t + 0.07); o2.stop(t + 0.3); }
}
export function capture(ours = true) { if (!ctx) return; const t = now(); const seq = ours ? [660, 880, 990] : [500, 420, 330]; seq.forEach((f, i) => { const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f; const g = ctx.createGain(); o.connect(g).connect(master); env(g, t + i * 0.1, 0.01, 0.08, 0.2); o.start(t + i * 0.1); o.stop(t + i * 0.1 + 0.3); }); }

// wind, and far away: dogs, a call to prayer on the desert map, gulls and ships at the port
let ambT = null;
function startAmbience() {
  const n = noise(true), lp = filt('lowpass', 500), g = ctx.createGain(); g.gain.value = 0.05; n.connect(lp).connect(g).connect(amb); n.start();
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07; const lg = ctx.createGain(); lg.gain.value = 250; lfo.connect(lg).connect(lp.frequency); lfo.start();
}
export function ambience(kind) {
  clearInterval(ambT); if (!ctx) return;
  ambT = setInterval(() => {
    if (!ctx || Math.random() < 0.6) return; const t = now();
    if (kind === 'kessel') {
      if (Math.random() < 0.5) { // a ship's horn far off
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 72; const lp = filt('lowpass', 400), g = ctx.createGain(); o.connect(lp).connect(g).connect(amb); env(g, t, 0.6, 0.03, 2.5); o.start(t); o.stop(t + 3.3);
      } else for (let i = 0; i < 3; i++) { const o = ctx.createOscillator(); o.frequency.setValueAtTime(1600, t + i * 0.25); o.frequency.exponentialRampToValueAtTime(900, t + i * 0.25 + 0.2); const g = ctx.createGain(); o.connect(g).connect(amb); env(g, t + i * 0.25, 0.02, 0.012, 0.18); o.start(t + i * 0.25); o.stop(t + i * 0.25 + 0.25); } // gulls
    } else {
      for (let i = 0; i < 2 + Math.random() * 3; i++) { // a dog barking a few streets over
        const tt = t + i * 0.32, o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(420, tt); o.frequency.exponentialRampToValueAtTime(250, tt + 0.12);
        const bp = filt('bandpass', 900, 2), g = ctx.createGain(); o.connect(bp).connect(g).connect(amb); env(g, tt, 0.01, 0.015, 0.12); o.start(tt); o.stop(tt + 0.16);
      }
    }
  }, 9000);
}

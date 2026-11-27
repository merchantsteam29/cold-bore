// COLD BORE: a realistic multiplayer FPS. This file runs everything: the renderer, the match (host side:
// timer, scores, Domination points, bots), the network messages, your soldier, shooting and wounds, the HUD
// and every menu. See data.js for the guns and prices, combat.js for ballistics, bots.js for the AI.
import * as THREE from 'three';
import * as TX from './tex.js';
import { GUNS, ATTACH, MELEE, UTIL, ARMOR, HELMET, CAL, PARTS, ECON, FINISH, UNIFORM, MODES, TEAM, fmt$ } from './data.js';
import { buildWorld, MAP_LIST, groundAt, moveBody, fits, clearLine, raycast } from './world.js';
import { Soldier } from './soldier.js';
import { createGore } from './gore.js';
import { createFX } from './fx.js';
import { createViewmodel } from './viewmodel.js';
import { traceShot, woundFrom, gunStats, ammoPrice, fragDamage } from './combat.js';
import * as WP from './weapons.js';
import { makeBrain, botBuy, botThink, botGoalFor, BOT_NAMES } from './bots.js';
import { Net, newCode, cleanCode, cleanName } from './net.js';
import { Browser, Announcer } from './lobby.js';
import { Input } from './input.js';
import * as AU from './audio.js';
import { makeGun, makeGrenade } from './guns.js';
import { createGovernor } from '../perf.js';
import { createPost } from './post.js';

const VER = 3; // network protocol: players on other versions can't join
const TEST = /[?&]test\b/.test(location.search);
const $ = (id) => document.getElementById(id);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const now = () => performance.now() / 1000;

// ================= SAVE =================
const PKEY = 'coldbore.prog', SKEY = 'coldbore.settings';
const load = (k, d) => { try { return { ...d, ...JSON.parse(localStorage.getItem(k) || '{}') }; } catch { return { ...d }; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full */ } };
// earned and spent only ever go up, so two devices merge by taking the larger of each (sync.js 'max')
const prog = load(PKEY, { name: '', earned: 0, spent: 0, own: { fin: { black: true }, uni: { multicam: true } }, equip: { uni: 'multicam', fin: {} }, stats: { kills: 0, deaths: 0, hs: 0, matches: 0, wins: 0, best: 0, longest: 0, earnedMatches: 0 } });
const set = load(SKEY, { sens: 1, ads: 0.8, fov: 90, vol: 0.8, gore: 80, quality: 'high', adsT: 'hold', cross: '0', hitm: '1', inv: '0', pads: '1', perf: '0', warned: false });
if (!prog.name) prog.name = 'Recruit-' + ((Math.random() * 9000 + 1000) | 0);
const bank = () => Math.max(0, prog.earned - prog.spent);
function persist() { store(PKEY, prog); store(SKEY, set); try { window.GameSync?.syncNow?.(); } catch { /* fine */ } }

// ================= RENDERER =================
const canvas = $('c');
// phones and tablets start on Low; everything else on Medium (the settings can raise it)
const PHONE = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 900;
if (!localStorage.getItem(SKEY)) set.quality = PHONE ? 'low' : 'medium';
// multisampling costs a lot on weak GPUs: only on High / Ultra (changing it needs a reload)
const renderer = new THREE.WebGLRenderer({ canvas, antialias: set.quality === 'high' || set.quality === 'ultra', powerPreference: 'high-performance' });
// checking every shader's compile log stalls the GPU; only the tests want it
renderer.debug.checkShaderErrors = TEST;
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.autoClear = false;
let basePR = 1;
const gov = createGovernor({ min: 0.5, apply: (s) => { renderer.setPixelRatio(basePR * s); pfx?.resize(); } });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.04, 1600);
// the FOV setting is horizontal (like most shooters); three.js wants vertical. zoom = optical magnification.
const vfov = (zoom = 1) => 2 * Math.atan(Math.tan(clamp(set.fov, 60, 120) * Math.PI / 360) / camera.aspect / zoom) * 180 / Math.PI;
camera.rotation.order = 'YXZ'; scene.add(camera);
const hemi = new THREE.HemisphereLight(0xbcd3ea, 0x8a7458, 1.1); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d8, 3); sun.castShadow = true; scene.add(sun); scene.add(sun.target);
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
// shadows only around you (the area follows the camera): sharper, and far less to draw into the shadow map
const sc = sun.shadow.camera; sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55; sc.near = 1; sc.far = 400;
sun.shadow.autoUpdate = false;
const wlight = new THREE.SpotLight(0xfff4e0, 0, 45, 0.38, 0.45, 1.5); camera.add(wlight); camera.add(wlight.target); wlight.target.position.set(0, 0, -5); wlight.position.set(0.15, -0.1, 0);
const laserDot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 5), new THREE.MeshBasicMaterial({ color: 0xff2010, toneMapped: false })); laserDot.visible = false; scene.add(laserDot);
const VM = createViewmodel(innerWidth / innerHeight);
const pfx = createPost(renderer, scene, camera, VM.scene, VM.cam);
let shadowEvery = 1, shadowN = 0;
// Low: every PBR material is swapped for a Lambert one (far cheaper per pixel: no reflections, no roughness maths).
// The swap is remembered both ways, so switching quality back restores the originals.
const toLamb = new WeakMap(), toStd = new WeakMap();
function lambertOf(m) {
  if (!m || !m.isMeshStandardMaterial) return m;
  let l = toLamb.get(m);
  if (!l) {
    l = new THREE.MeshLambertMaterial({ map: m.map, color: m.color, transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest, side: m.side, depthWrite: m.depthWrite, emissive: m.emissive, emissiveIntensity: m.emissiveIntensity, polygonOffset: m.polygonOffset, polygonOffsetFactor: m.polygonOffsetFactor, flatShading: m.flatShading, vertexColors: m.vertexColors, fog: m.fog });
    if (m.metalness > 0.5) l.color = m.color.clone().multiplyScalar(0.55); // bare metal without reflections reads too bright
    toLamb.set(m, l); toStd.set(l, m);
  }
  return l;
}
function cheapen(root, on) {
  root.traverse((o) => {
    const m = o.material; if (!m || o.isSprite || o.isLine || o.isPoints) return;
    const swap = (x) => on ? lambertOf(x) : (toStd.get(x) || x);
    if (Array.isArray(m)) o.material = m.map(swap); else { const n = swap(m); if (n !== m) o.material = n; }
  });
}
const isCheap = () => set.quality === 'low';
function applyQuality() {
  const q = set.quality;
  basePR = q === 'low' ? Math.min(1, devicePixelRatio) * 0.75 : q === 'medium' ? Math.min(1, devicePixelRatio) : q === 'high' ? Math.min(1.5, devicePixelRatio) : Math.min(2, devicePixelRatio);
  renderer.setPixelRatio(basePR); gov.reset();
  pfx.setQuality(q);
  const sz = q === 'medium' ? 1024 : q === 'high' ? 2048 : 4096;
  sun.shadow.radius = q === 'ultra' ? 3 : 1.5;
  if (sun.shadow.mapSize.x !== sz) { sun.shadow.mapSize.set(sz, sz); sun.shadow.map?.dispose(); sun.shadow.map = null; }
  // Low: no shadows at all (the sky light still shades everything). Materials recompile when this changes.
  const sh = q !== 'low';
  let W0 = null; try { W0 = G.W; } catch { /* called at boot, before the game state exists */ }
  pfx.setCheap(q === 'low', W0?.def); cheapen(scene, q === 'low'); cheapen(VM.scene, q === 'low');
  hemi.intensity = (W0?.sun.hemi[2] ?? 1.1) * (q === 'low' ? 1.0 : 0.45); // no environment light on Low: the hemisphere does it all
  if (renderer.shadowMap.enabled !== sh) { renderer.shadowMap.enabled = sh; scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; }); }
  shadowEvery = q === 'medium' ? 2 : 1;
  // how far you can see (the haze hides the cut)
  camera.far = q === 'low' ? 450 : q === 'medium' ? 800 : 1600; camera.updateProjectionMatrix(); pfx.setFar(camera.far);
  TX.setAniso(q === 'low' ? 2 : q === 'high' || q === 'ultra' ? 8 : 4);
}
function resize() { renderer.setSize(innerWidth, innerHeight, false); pfx.resize(); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); VM.cam.aspect = camera.aspect; VM.cam.updateProjectionMatrix(); }
addEventListener('resize', resize);
if (TEST) set.quality = 'low'; // automated tests run in software-rendered Chrome; tools/look.mjs picks its own level
applyQuality(); resize();

const input = new Input(canvas);
// phones: on-screen controls (left half: a stick wherever your thumb lands; right half: drag to look)
input.bindTouch($('touch'));
addEventListener('touchstart', () => { if (!input.touchMode) input.setMode('touch'); }, { passive: true });
if (PHONE) input.setMode('touch');
input.pads = set.pads === '1';
const gore = createGore(scene, (x, z, y) => G.W ? groundAt(G.W, x, z, y) : 0);
gore.level = set.gore / 100;
const fx = createFX(scene, (x, z, y) => G.W ? groundAt(G.W, x, z, y) : 0);

// ================= GAME STATE =================
const G = {
  state: 'menu', // menu | play | end
  net: null, announcer: null, browser: new Browser(), cfg: null, W: null,
  ents: new Map(), me: null, corpses: [], drops: new Map(), nades: new Map(), timeLeft: 0, scores: [0, 0], flags: [],
  shots: [], nextBot: 1, nadeSeq: 0, endT: 0, lastS: 0, lastM: 0, lastE: 0, killSeq: 0,
};
window.__ATTACH = ATTACH;

// ================= ENTITIES =================
function makeEnt(id, name, team, bot = false) {
  const e = { id, name, team, bot, pos: V(), vel: V(), yaw: 0, pitch: 0, stance: 0, lean: 0, speed: 0, phase: 0, ads: false, sprint: false,
    alive: false, hp: 100, bleed: 0, limbBleed: false, limp: false, armHurt: false, money: ECON.start, earned: 0, kills: 0, deaths: 0, assists: 0, score: 0,
    body: null, buf: [], dmgBy: {}, uni: 'multicam', finish: {}, seed: Math.random() * 100, partDmg: {}, ownedAtt: {}, gk: '', spawnT: 0, deadT: 0, picked: null, scav: new Set() };
  WP.newKit(e);
  if (bot) { makeBrain(e, G.cfg?.diff || 'normal'); e.uni = Object.keys(UNIFORM)[(Math.random() * 8) | 0]; }
  G.ents.set(id, e);
  return e;
}
const isMine = (e) => e && (e === G.me || (G.net?.isHost && e.bot));
const ownerOf = (e) => e.bot ? 'h' : e.id;
const teams = () => !!MODES[G.cfg?.mode]?.teams;
const enemies = (a, b) => a !== b && (!teams() || a.team !== b.team);
function enemiesOf(e) { const out = []; for (const o of G.ents.values()) if (enemies(e, o)) out.push(o); return out; }
function rebuildBody(e) {
  if (e.body && !e.body.dead) e.body.dispose();
  else if (e.body) { G.corpses.push(e.body); while (G.corpses.length > 14) G.corpses.shift().dispose(); }
  const b = new Soldier({ uniform: e.uni, team: teams() ? e.team : -1, armor: e.armor.type, helmet: e.helmet.type });
  scene.add(b.group); e.body = b; e.gkShown = '';
  if (e === G.me) b.group.visible = false;
  if (teams() && G.me && e !== G.me && e.team === G.me.team) b.setTag(e.name, TEAM[e.team].color);
}
function showGun(e) {
  if (!e.body || e.body.dead || e.gkShown === e.gk) return;
  e.gkShown = e.gk; const k = e.gk || '';
  if (k.startsWith('m:')) e.body.setMelee(k.slice(2));
  else if (k.startsWith('n:') || !k) e.body.setGun(null);
  else { const [id, att, fin] = k.split('|'); e.body.setGun(id, att ? att.split(',').filter(Boolean) : [], fin || 'black'); }
}
function holdOf(e) { const k = e.gk || ''; return k.startsWith('m:') ? 'melee' : k.startsWith('n:') || !k ? 'none' : 'gun'; }
function poseEnt(e, dt) {
  if (!e.body || !e.alive) return;
  showGun(e);
  e.phase += dt * Math.max(0.0, e.speed) * (e.stance === 2 ? 3.2 : e.stance === 1 ? 2.6 : 2.25);
  const w = e.ws;
  e.body.pose({ pos: e.pos, yaw: e.yaw, pitch: e.pitch, stance: e.stance, lean: e.lean, speed: e.speed, phase: e.phase, vel: e.vel, hold: holdOf(e), ads: e.ads, sprint: e.sprint,
    reload: isMine(e) ? (w && w.reloadT >= 0 ? w.reloadT / w.reloadDur : 0) : e.rl || 0, kick: e.kick || 0, swing: isMine(e) ? (w && w.swingT >= 0 ? w.swingT : 0) : e.sw || 0, throwT: isMine(e) ? Math.max(0, w?.throwT || 0) : 0 });
  e.kick = (e.kick || 0) * Math.exp(-dt * 14);
  const near = e.pos.distanceToSquared(camera.position) < 1600;
  if (e.body.shadowNear !== near) { e.body.shadowNear = near; for (const m of e.body.skinned || []) m.castShadow = near; if (e.body.gun) e.body.gun.traverse((o) => { if (o.isMesh) o.castShadow = near; }); }
  // footsteps you can hear (others only, and only close)
  if (e !== G.me && e.speed > 0.5 && e.stance < 2) {
    const s = Math.floor(e.phase / Math.PI);
    if (s !== e.stepN) { e.stepN = s; const d = e.pos.distanceTo(camera.position); if (d < 35) AU.step(e.pos.y > 0.2 ? 'concrete' : G.W.def.ground === 'asphalt' ? 'concrete' : 'sand', (e.sprint ? 0.5 : e.stance ? 0.15 : 0.3), e.pos); }
  }
}
// other players' copies: drawn 100 ms in the past, between the two states around that moment
function interp(e) {
  const B = e.buf; if (!B.length) return;
  const t = now() - 0.1;
  while (B.length > 2 && B[1].t <= t) B.shift();
  const a = B[0], b = B[1] || B[0];
  const f = b.t > a.t ? clamp((t - a.t) / (b.t - a.t), 0, 1.2) : 1;
  const px = a.p[0] + (b.p[0] - a.p[0]) * f, py = a.p[1] + (b.p[1] - a.p[1]) * f, pz = a.p[2] + (b.p[2] - a.p[2]) * f;
  e.vel.set((b.p[0] - a.p[0]) / Math.max(0.03, b.t - a.t), 0, (b.p[2] - a.p[2]) / Math.max(0.03, b.t - a.t));
  e.pos.set(px, py, pz);
  let dy = b.y - a.y; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
  e.yaw = a.y + dy * f; e.pitch = a.x + (b.x - a.x) * f;
}

// ================= MATCH SETUP =================
function buildMatch(cfg) {
  clearMatch(false);
  G.cfg = cfg;
  G.W = buildWorld(scene, cfg.map, set.quality);
  const W = G.W, s = W.sun;
  const d = V(...s.dir).normalize();
  sun.color.setHex(s.color); sun.intensity = s.int; sun.position.copy(d).multiplyScalar(200); sun.target.position.set(0, 0, 0);
  hemi.color.setHex(s.hemi[0]); hemi.groundColor.setHex(s.hemi[1]); hemi.intensity = s.hemi[2] * (isCheap() ? 1.0 : 0.45); // the environment map does most of the ambient (except on Low)
  VM.sun.color.setHex(s.color); VM.sun.intensity = s.int * 0.75; VM.sun.position.copy(d); VM.hemi.color.setHex(s.hemi[0]); VM.hemi.groundColor.setHex(s.hemi[1]);
  scene.fog = new THREE.Fog(W.fog[0], W.fog[1], W.fog[2]);
  pfx.setSky(W.def); VM.scene.environment = scene.environment; pfx.setCheap(isCheap(), W.def);
  scene.background = new THREE.Color(W.fog[0]);
  G.flags = cfg.mode === 'dom' ? W.flags.map((f) => ({ ...f, owner: -1, p: 0 })) : [];
  buildFlagMarkers();
  G.scores = [0, 0]; G.timeLeft = MODES[cfg.mode].time; G.ended = false;
  AU.ambience(cfg.map);
  $('flagsH')?.remove();
  warmShaders();
}
// Every kind of thing that can appear mid-fight (soldiers, ragdoll wounds, gibs, debris, fireballs, flashes, tracers,
// grenades, dropped guns, the first-person gun) is compiled now, while the match loads, instead of stuttering the
// first time it shows up.
function warmShaders() {
  const tmp = new THREE.Group(); scene.add(tmp);
  const s = new Soldier({ uniform: 'multicam', armor: 'iii', helmet: 'fast', team: 0 }); s.setGun('m4', ['optic_holo', 'las_light']); tmp.add(s.group);
  s.pose({ pos: V(0, -50, 0), yaw: 0, pitch: 0, stance: 0, lean: 0, speed: 0, phase: 0, hold: 'gun' });
  s.wound(s.center.clone(), V(0, 0, 1), 'chest'); s.setTag('x', '#fff');
  tmp.add(makeGrenade('frag'), makeGrenade('smoke'), makeGun('glock17'), makeGun('r870'));
  gore.gib(V(0, -50, 0), V(0, 1, 0), 3); gore.splat(V(0, -50, 0), 0.3); gore.pool(V(0, -50, 0)); gore.spray(V(0, -50, 0), V(0, 1, 0), 3);
  fx.chunk(V(0, -50, 0), V(0, 1, 0), 3); fx.smoke(V(0, -60, 0), 0.1);
  // everything visible and un-culled for this one frame, so every shader is actually used once
  if (isCheap()) { cheapen(scene, true); cheapen(VM.scene, true); }
  const hidden = [], culled = []; scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } if (o.frustumCulled) { culled.push(o); o.frustumCulled = false; } });
  try {
    renderer.compile(scene, camera); renderer.compile(VM.scene, VM.cam);
    // and draw it once, small and off-screen, so the driver finishes every shader now (not on first sight mid-fight)
    // (on the real screen: a render target would use different shader variants; the deploy screen covers it)
    renderer.clear(); renderer.render(scene, camera); renderer.clearDepth(); renderer.render(VM.scene, VM.cam);
    if (pfx.composer) pfx.render(true, { hurt: 0, suppress: 0, flash: 0 }, 0);
  } catch { /* fine */ }
  for (const o of hidden) o.visible = false;
  for (const o of culled) o.frustumCulled = true;
  s.dispose(); tmp.removeFromParent(); gore.clear(); fx.clear();
  // the first-person guns and arms
  VM.setGun('hk416', ['optic_holo', 'grip_vert']); try { renderer.compile(VM.scene, VM.cam); } catch { /* fine */ } VM.setEmpty();
}
function clearMatch(full = true) {
  for (const e of G.ents.values()) e.body?.dispose();
  for (const c of G.corpses) c.dispose(); G.corpses = [];
  for (const d of G.drops.values()) d.mesh.removeFromParent(); G.drops.clear();
  for (const n of G.nades.values()) n.mesh.removeFromParent(); G.nades.clear();
  for (const m of G.flagMarks || []) m.removeFromParent(); G.flagMarks = [];
  gore.clear(); fx.clear();
  if (G.W) { G.W.dispose(); G.W = null; }
  if (full) { G.ents.clear(); G.me = null; }
  else for (const e of G.ents.values()) { e.body = null; }
}
function buildFlagMarkers() {
  G.flagMarks = [];
  for (const f of G.flags) {
    const g = new THREE.Group(); g.position.set(f.x, groundAt(G.W, f.x, f.z, 3), f.z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 4.5, 8), new THREE.MeshStandardMaterial({ color: 0x777b7e, metalness: 0.7, roughness: 0.4 })); pole.position.y = 2.25; pole.castShadow = true; g.add(pole);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.8, 6, 3), new THREE.MeshStandardMaterial({ color: 0xdddddd, side: THREE.DoubleSide, roughness: 1 })); cloth.position.set(0.66, 4, 0); g.add(cloth);
    const ring = new THREE.Mesh(new THREE.RingGeometry(f.r - 0.12, f.r, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; g.add(ring);
    g.userData = { cloth, ring }; scene.add(g); G.flagMarks.push(g);
  }
}

// ================= NETWORK =================
const RELAY = new Set(['sh', 'wd', 'kill', 'spawn', 'nade', 'boom', 'chat']);
function post(m) {
  const net = G.net; if (!net) return;
  m.f = net.id;
  if (net.isHost) { if (!net.offline) net.broadcast(m, { self: false }); }
  else net.send(m);
  handle(m, net.id);
}
function onNet(m, from) {
  const net = G.net;
  if (net.isHost && from !== 'h') {
    m.f = from;
    if (RELAY.has(m.t)) net.broadcast(m, { except: from, self: false });
    if (m.t === 'hit') { routeHit(m); return; }
    if (m.t === 's') { const e = G.ents.get(from); if (e) takeState(e, m); return; }
    if (m.t === 'take') { hostTake(m, from); return; }
    if (m.t === 'quit') { playerLeft(m.id); return; }
  }
  handle(m, from);
}
function routeHit(m) {
  const v = G.ents.get(m.v); if (!v) return;
  const o = ownerOf(v);
  if (o === G.net.id || (G.net.isHost && v.bot)) applyHit(v, m);
  else if (G.net.isHost) G.net.sendTo(o, m);
  else G.net.send(m);
}
function takeState(e, s) {
  if (e === G.me) return;
  e.buf.push({ t: now(), p: s.p, y: s.y, x: s.x });
  if (e.buf.length > 12) e.buf.shift();
  e.stance = s.st; e.lean = s.l; e.speed = s.sp; e.ads = !!(s.fl & 1); e.sprint = !!(s.fl & 2); e.rl = s.r || 0; e.sw = s.w || 0;
  if (s.g !== undefined) e.gk = s.g;
}
function myState() {
  const e = G.me, w = e.ws;
  return { t: 's', p: [+e.pos.x.toFixed(2), +e.pos.y.toFixed(2), +e.pos.z.toFixed(2)], y: +e.yaw.toFixed(3), x: +e.pitch.toFixed(3), st: e.stance, l: +e.lean.toFixed(2), sp: +e.speed.toFixed(1), fl: (e.ads ? 1 : 0) | (e.sprint ? 2 : 0), g: e.gk, r: w && w.reloadT >= 0 ? +(w.reloadT / w.reloadDur).toFixed(2) : 0, w: w && w.swingT >= 0 ? +w.swingT.toFixed(2) : 0 };
}
// tests: the slowest time each kind of event took (window.__spikes)
const SPK = TEST ? (window.__spikes = {}) : null;
const spk = (k, t0) => { if (SPK) { const d = performance.now() - t0; if (d > (SPK[k] || 0)) SPK[k] = +d.toFixed(1); } };
function handle(m, from) {
  const t0 = SPK ? performance.now() : 0; handle0(m, from); spk('msg:' + m.t, t0);
}
function handle0(m, from) {
  const e = m.i ? G.ents.get(m.i) : null;
  switch (m.t) {
    case 'init': onInit(m); break;
    case 'E': onRoster(m.list); break;
    case 'S': for (const s of m.a) { const x = G.ents.get(s[0]); if (x && x !== G.me) takeState(x, { p: [s[1], s[2], s[3]], y: s[4], x: s[5], st: s[6], l: s[7], sp: s[8], fl: s[9], g: s[10], r: s[11], w: s[12] }); } break;
    case 'M': G.timeLeft = m.tl; G.scores = m.ts; if (m.fl) m.fl.forEach(([o, p], i) => { if (G.flags[i]) { G.flags[i].owner = o; G.flags[i].p = p; } }); break;
    case 'sh': if (from !== G.net.id) remoteShot(m); break;
    case 'hit': if (!G.net.isHost) { const v = G.ents.get(m.v); if (v && isMine(v)) applyHit(v, m); } break;
    case 'wd': onWound(m); break;
    case 'kill': onKill(m); break;
    case 'spawn': if (e && from !== G.net.id) onSpawn(e, m); break;
    case 'nade': if (from !== G.net.id) spawnNade(m, false); break;
    case 'boom': onBoom(m); break;
    case 'took': onTook(m); break;
    case 'cash': if (m.to === G.me?.id) addMoney(G.me, m.n, m.why); break;
    case 'cap': onCap(m); break;
    case 'end': onEnd(m); break;
    case 'new': onNew(m); break;
    case 'chat': toast(m.text); break;
    case 'quit': if (G.net.isHost) playerLeft(m.id); break;
  }
}

// ---- host: players joining and leaving ----
function onRosterNet(roster) {
  if (!G.net?.isHost || G.state === 'menu') return;
  for (const r of roster) if (!G.ents.has(r.id)) playerJoined(r);
}
function playerJoined(r) {
  const e = makeEnt(r.id, r.name, pickTeam(), false);
  e.alive = false;
  fillBots();
  G.net.sendTo(r.id, { t: 'init', cfg: G.cfg, tl: G.timeLeft, ts: G.scores, fl: G.flags.map((f) => [f.owner, f.p]), list: rosterList(), you: e.team });
  broadcastRoster();
  post({ t: 'chat', text: `${r.name} joined the match` });
}
function playerLeft(id) {
  const e = G.ents.get(id); if (!e || e.bot) return;
  e.body?.dispose(); G.ents.delete(id);
  fillBots(); broadcastRoster();
  post({ t: 'chat', text: `${e.name} left` });
}
function pickTeam() {
  if (!teams()) return 0;
  const n = [0, 0]; for (const e of G.ents.values()) n[e.team]++;
  return n[0] <= n[1] ? 0 : 1;
}
// keeps the match at the chosen number of players: bots fill the empty places, and leave when people join
function fillBots() {
  const want = G.cfg.bots | 0, all = [...G.ents.values()], humans = all.filter((e) => !e.bot).length, bots = all.filter((e) => e.bot);
  let need = Math.max(0, want - humans) - bots.length;
  while (need > 0) {
    const used = new Set(all.map((e) => e.name));
    const name = BOT_NAMES.find((n) => !used.has(n)) || 'Bot' + G.nextBot;
    const b = makeEnt('b' + G.nextBot++, name, pickTeam(), true); all.push(b); b.deadT = now() - 4; need--;
  }
  while (need < 0) {
    // the bot to remove: from the bigger team
    const n = [0, 0]; for (const e of G.ents.values()) n[e.team]++;
    const big = n[0] > n[1] ? 0 : 1;
    const b = [...G.ents.values()].filter((e) => e.bot).sort((x, y) => (y.team === big) - (x.team === big))[0]; if (!b) break;
    if (b.body) { if (!b.body.dead) b.body.dispose(); }
    G.ents.delete(b.id); need++;
  }
  // even the teams out
  if (teams()) for (let k = 0; k < 4; k++) {
    const n = [0, 0]; for (const e of G.ents.values()) n[e.team]++;
    if (Math.abs(n[0] - n[1]) <= 1) break;
    const big = n[0] > n[1] ? 0 : 1, b = [...G.ents.values()].find((e) => e.bot && e.team === big);
    if (!b) break; b.team = 1 - big; if (b.alive) { b.alive = false; b.deadT = now(); b.body?.dispose(); b.body = null; }
  }
}
function rosterList() { return [...G.ents.values()].map((e) => ({ i: e.id, n: e.name, tm: e.team, b: e.bot ? 1 : 0, k: e.kills, d: e.deaths, a: e.assists, sc: e.score, al: e.alive ? 1 : 0, u: e.uni, ar: e.armor.type, he: e.helmet.type, p: [+e.pos.x.toFixed(1), +e.pos.y.toFixed(1), +e.pos.z.toFixed(1)] })); }
function broadcastRoster() { if (G.net?.isHost) post({ t: 'E', list: rosterList() }); }
function onRoster(list) {
  const ids = new Set(list.map((r) => r.i));
  for (const [id, e] of G.ents) if (!ids.has(id) && e !== G.me) { e.body?.dispose(); G.ents.delete(id); }
  for (const r of list) {
    let e = G.ents.get(r.i);
    if (!e) { e = makeEnt(r.i, r.n, r.tm, !!r.b); if (r.b) e.brain = null; e.kills = r.k; e.deaths = r.d; e.assists = r.a; e.score = r.sc; e.uni = r.u; e.armor.type = r.ar; e.helmet.type = r.he; if (r.al && r.p) { e.pos.set(...r.p); e.alive = true; rebuildBody(e); } }
    else if (G.net.isHost) continue;
    const teamChanged = e.team !== r.tm; e.team = r.tm; e.name = r.n;
    if (!G.net.isHost) { e.kills = r.k; e.deaths = r.d; e.assists = r.a; e.score = r.sc; }
    if (teamChanged && e.body && e !== G.me) { e.uni = r.u; rebuildBody(e); }
  }
  if (G.me) for (const e of G.ents.values()) if (e.body && !e.body.dead && e !== G.me) e.body.setTag(teams() && e.team === G.me.team ? e.name : '', teams() ? TEAM[e.team]?.color : '#fff');
}
function onInit(m) {
  buildMatch(m.cfg);
  G.timeLeft = m.tl; G.scores = m.ts; m.fl?.forEach(([o, p], i) => { if (G.flags[i]) { G.flags[i].owner = o; G.flags[i].p = p; } });
  G.ents.clear();
  const me = makeEnt(G.net.id, prog.name, m.you, false); G.me = me; me.uni = prog.equip.uni; me.finish = { ...prog.equip.fin };
  onRoster(m.list);
  enterPlay();
}

// ================= STARTING / LEAVING =================
function newMatchCfg(over = {}) {
  const modes = Object.keys(MODES), maps = MAP_LIST.map((m) => m.id);
  return { mode: modes[(Math.random() * modes.length) | 0], map: maps[(Math.random() * maps.length) | 0], bots: 10, diff: 'normal', pub: true, ff: false, name: prog.name + "'s match", ...over };
}
async function hostMatch(cfg, offline = false) {
  status('Starting match…');
  const net = new Net(VER); G.net = net;
  net.onMessage = onNet; net.onRoster = onRosterNet; net.onClose = (why) => leaveMatch(why);
  try {
    if (offline) await net.solo(prog.name);
    else { let ok = false; for (let i = 0; i < 4 && !ok; i++) { try { await net.host(newCode(), prog.name); ok = true; } catch (e) { if (i === 3) throw e; } } }
  } catch (e) { status(); toast(e.message + ' Starting an offline match instead.'); return hostMatch(cfg, true); }
  net.maxPlayers = 12;
  net.peekInfo = () => ({ mode: G.cfg?.mode, map: G.cfg?.map });
  buildMatch(cfg);
  const me = makeEnt('h', prog.name, 0, false); G.me = me; me.uni = prog.equip.uni; me.finish = { ...prog.equip.fin };
  fillBots();
  if (!offline && cfg.pub) startAnnounce();
  status(); enterPlay();
}
function startAnnounce() {
  G.announcer?.stop(); G.announcer = new Announcer();
  G.announcer.start(G.net.code, () => ({ name: G.cfg.name, mode: G.cfg.mode, map: G.cfg.map, players: [...G.ents.values()].filter((e) => !e.bot).length, bots: [...G.ents.values()].filter((e) => e.bot).length, max: 12, ver: VER })).catch(() => {});
}
async function joinMatch(code) {
  status('Joining ' + code + '…');
  const net = new Net(VER); G.net = net;
  net.onMessage = onNet; net.onClose = (why) => leaveMatch(why);
  try { await net.join(code, prog.name); }
  catch (e) { status(); G.net = null; throw e; }
  status('Loading match…');
  // the host sends 'init' straight away
  setTimeout(() => { if (G.state === 'menu' && G.net === net) { status(); toast('The host did not answer.'); net.destroy(); G.net = null; } }, 10000);
}
async function quickPlay() {
  status('Looking for a match…', 'Online matches first; if there are none, you host one and bots fill it.');
  const B = G.browser;
  try { await Promise.race([B.start(), new Promise((r) => setTimeout(r, 4500))]); } catch { /* offline */ }
  await new Promise((r) => setTimeout(r, B.status === 'online' ? 2200 : 300));
  for (const s of B.matches(VER).filter((s) => s.players < s.max)) {
    try { await joinMatch(s.code); return; } catch { B.markDead(s.code); }
  }
  status();
  hostMatch(newMatchCfg({ name: prog.name + "'s match", diff: 'normal' }), B.status !== 'online' && !navigator.onLine);
}
function enterPlay() {
  G.state = 'play';
  if (menuSoldier) { menuSoldier.dispose(); menuSoldier = null; }
  for (const id of ['title', 'hostD', 'joinD', 'browseD', 'armD', 'setD', 'statsD', 'end']) $(id).hidden = true;
  $('hud').hidden = false; status();
  const me = G.me; me.alive = false; me.deadT = now() - 10; me.money = ECON.start; me.earned = 0;
  VM.setUniform(prog.equip.uni);
  showDeath(true);
  G.lastS = G.lastM = 0;
  AU.initAudio();
}
function leaveMatch(why) {
  if (G.state === 'menu') return;
  if (G.state === 'play' && G.me) bankMatch(false, true);
  G.announcer?.stop(); G.announcer = null;
  try { G.net?.destroy(); } catch { /* gone */ }
  G.net = null; G.state = 'menu';
  clearMatch(true);
  for (const id of ['hud', 'death', 'board', 'pause', 'buy', 'end', 'scope']) $(id).hidden = true;
  $('bloodV').style.opacity = 0;
  input.unlock();
  showTitle(); menuScene();
  if (why) toast(why);
}

// ================= MONEY =================
function addMoney(e, n, why = '') {
  if (!n) return;
  const room = ECON.max - e.money, add = Math.min(n, Math.max(0, room));
  e.money += add; e.earned += n;
  if (e === G.me) { const d = document.createElement('div'); d.textContent = `+${fmt$(n)} ${why}`; $('cashFx').appendChild(d); setTimeout(() => d.remove(), 1900); AU.ui('cash'); }
}
// buys an item for any soldier; returns true if it worked. `forGun` for attachments.
function buy(e, id, forGun = null) {
  const pay = (p) => { if (e.money < p) return false; e.money -= p; return true; };
  if (GUNS[id]) {
    const g = GUNS[id], slot = g.slot;
    if (!e.owned.includes(id)) { if (!pay(g.price)) return false; e.owned.push(id); }
    e.loadout[slot] = id; e.picked = null;
    const s = gunStats(id, e.att[id] || []); e.ammo[id] = { mag: s.mag, res: s.mag * s.spare };
    if (e.alive && e.ws) WP.equip(e, slot);
    return true;
  }
  if (ATTACH[id]) {
    const gun = forGun; if (!gun || !GUNS[gun]?.att.includes(id)) return false;
    const own = e.ownedAtt[gun] || (e.ownedAtt[gun] = []);
    if (!own.includes(id)) { if (!pay(ATTACH[id].price)) return false; own.push(id); }
    const slot = ATTACH[id].slot, cur = (e.att[gun] || []).filter((a) => ATTACH[a].slot !== slot);
    const was = (e.att[gun] || []).includes(id);
    e.att[gun] = was && e === G.me ? cur : [...cur, id];
    if (e.ws && e.ws.id === gun) { const keep = e.ammo[gun]; e.ws.id = null; WP.equip(e, e.ws.slot === 'picked' ? 'primary' : e.ws.slot, true); if (keep) { const s = gunStats(gun, e.att[gun]); keep.mag = Math.min(keep.mag, s.mag + 1); e.ammo[gun] = keep; } }
    return true;
  }
  if (MELEE[id]) { if (!e.owned.includes(id)) { if (!pay(MELEE[id].price)) return false; e.owned.push(id); } e.loadout.melee = id; return true; }
  if (UTIL[id]) { const U = UTIL[id]; if ((e.util[id] || 0) >= U.max || !pay(U.price)) return false; e.util[id] = (e.util[id] || 0) + 1; return true; }
  if (ARMOR[id]) { if (e.armor.type === id && e.armor.dur >= ARMOR[id].dur) return false; if (!pay(ARMOR[id].price)) return false; e.armor = { type: id, dur: ARMOR[id].dur }; return true; }
  if (HELMET[id]) { if (e.helmet.type === id && e.helmet.dur >= HELMET[id].dur) return false; if (!pay(HELMET[id].price)) return false; e.helmet = { type: id, dur: HELMET[id].dur }; return true; }
  if (id.startsWith('ammo:')) { const gun = id.slice(5), s = gunStats(gun, e.att[gun] || []); if (!pay(ammoPrice(gun))) return false; const a = e.ammo[gun] || (e.ammo[gun] = { mag: 0, res: 0 }); a.res += s.mag * (s.shell ? 4 : 2); return true; }
  return false;
}
function canBuyNow() {
  const me = G.me; if (!me) return false;
  if (!me.alive) return true;
  if (now() - me.spawnT < 20) return true;
  if (teams()) { const sp = G.W.spawns[me.team]; return sp.some(([x, z]) => Math.hypot(x - me.pos.x, z - me.pos.z) < 16); }
  return false;
}

// ================= SPAWNING =================
function spawnPoint(e) {
  const W = G.W, list = teams() ? W.spawns[e.team] : W.ffa;
  let best = null, bestS = -1e9;
  for (const [x, z] of list) {
    let near = 1e9;
    for (const o of G.ents.values()) if (o.alive && o !== e && enemies(e, o)) near = Math.min(near, Math.hypot(o.pos.x - x, o.pos.z - z));
    const s = Math.min(near, 60) + Math.random() * (teams() ? 30 : 12);
    if (s > bestS) { bestS = s; best = [x, z]; }
  }
  const x = best[0] + (Math.random() - 0.5) * 1.5, z = best[1] + (Math.random() - 0.5) * 1.5;
  return V(x, groundAt(W, x, z, 2), z);
}
function spawnEnt(e) {
  const p = spawnPoint(e);
  e.pos.copy(p); e.vel.set(0, 0, 0);
  e.yaw = Math.atan2(p.x, p.z) + (Math.random() - 0.5) * 0.6; // facing the middle of the map
  e.pitch = 0; e.stance = 0; e.lean = 0;
  e.hp = 100; e.bleed = 0; e.limbBleed = false; e.limp = false; e.armHurt = false; e.dmgBy = {}; e.partDmg = {}; e.picked = null; e.scav = new Set();
  e.alive = true; e.spawnT = now();
  WP.arm(e); e.gk = WP.gunKey(e);
  rebuildBody(e);
  post({ t: 'spawn', i: e.id, p: [p.x, p.y, p.z], y: e.yaw, u: e.uni, ar: e.armor.type, he: e.helmet.type, tm: e.team, g: e.gk });
}
function onSpawn(e, m) {
  e.pos.set(...m.p); e.yaw = m.y; e.uni = m.u; e.armor.type = m.ar; e.helmet.type = m.he; e.team = m.tm; e.gk = m.g; e.alive = true; e.buf = [];
  e.hp = 100;
  rebuildBody(e);
  if (G.net.isHost) broadcastRoster();
}
function deploy() {
  const me = G.me; if (!me || me.alive || G.state !== 'play' || now() - me.deadT < 4.5) return;
  showDeath(false); $('buy').hidden = true;
  if (input.touchMode && !document.fullscreenElement) { document.documentElement.requestFullscreen?.().then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {}); }
  spawnEnt(me);
  VM.setUniform(me.uni);
  input.lock();
}

// ================= SHOOTING =================
const tmpBodies = [];
function bodiesList() { tmpBodies.length = 0; for (const e of G.ents.values()) if (e.alive && e.body && !e.body.dead) tmpBodies.push({ ent: e, body: e.body }); return tmpBodies; }
// one trigger pull by a soldier this machine controls (you, or a bot on the host)
function shoot(e, origin, dirs) {
  const w = e.ws, s = w.stats, cal = s.cal;
  const bodies = bodiesList(), mine = e === G.me;
  let anyHit = null;
  dirs.forEach((d, i) => {
    const tr = traceShot(G.W, origin, d, cal, bodies, e.id);
    const showTr = !mine ? i === 0 || s.cls !== 'Shotgun' : i === 0 && s.cls !== 'Shotgun' && (w.shotN = (w.shotN || 0) + 1) % 3 === 1;
    renderTrace(tr, origin, cal, showTr, i === 0);
    for (const h of tr.hits) {
      if (teams() && !G.cfg.ff && h.ent.team === e.team) continue;
      // a plate or helmet that will stop it sparks instead (the victim's machine decides for real)
      const A = ARMOR[h.ent.armor.type], H = HELMET[h.ent.helmet.type];
      const guess = (h.part === 'chest' && A && A.lvl >= h.pen && h.ent.armor.dur !== 0) || (h.part === 'head' && H && H.lvl >= h.pen && Math.random() < 0.6);
      if (guess) { fx.spark(h.point, 6, h.dir.clone().negate(), 2); AU.impact(h.point, h.part === 'head' ? 'helmet' : 'plate'); }
      else { gore.hit(h.point, h.dir, CAL[cal].mist, h.through, null, wallRay); AU.impact(h.point, 'flesh'); }
      sendHit({ t: 'hit', v: h.ent.id, by: e.id, w: w.id, cal, part: h.part, pen: +h.pen.toFixed(2), mul: +h.mul.toFixed(3), dist: +h.dist.toFixed(1), pt: vArr(h.point), dir: vArr(h.dir), thr: h.through ? 1 : 0 });
      if (mine) anyHit = h;
    }
    nearMiss(e, tr);
  });
  if (anyHit && set.hitm === '1') hitMarker(anyHit.part === 'head' ? 'h' : '');
  G.shots.push({ p: origin.clone(), t: now(), sup: s.suppressed, by: e.id });
  if (G.shots.length > 30) G.shots.shift();
  post({ t: 'sh', i: e.id, o: vArr(origin), d: dirs.map(vArr), c: cal, s: s.suppressed ? 1 : 0 });
}
const vArr = (v) => [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)];
const wallRay = (o, d, max) => { const h = raycast(G.W, o, d, max); return h && !h.ground ? h : h; };
function renderTrace(tr, origin, cal, tracer, sound) {
  if (tracer) fx.tracer(tr.segs, CAL[cal].vel);
  let n = 0;
  for (const wl of tr.walls) { if (n++ > 3) break; fx.impact(wl.point, wl.normal, wl.mat, wl.exit); if (sound && n === 1) AU.impact(wl.point, ({ metal: 'metal', container: 'metal', steel: 'metal', wood: 'wood', sand: 'dirt' })[wl.mat] || 'stone'); }
}
function remoteShot(m) {
  const e = G.ents.get(m.i); if (!e || !G.W) return;
  const o = V(...m.o);
  // the muzzle flash at their gun, not their eye
  const fwd = V(...m.d[0]);
  const muz = e.body?.gun ? e.body.gun.localToWorld(e.body.gun.userData.info.muzzle.clone()) : o;
  fx.muzzle(muz, fwd, CAL[m.c]?.dmg > 80 ? 2 : 1, !!m.s);
  AU.gunshot(m.c, muz, !!m.s, false);
  e.kick = 1;
  m.d.forEach((d, i) => {
    const tr = traceShot(G.W, o, V(...d), m.c, [], m.i);
    renderTrace(tr, o, m.c, i === 0, i === 0);
    nearMiss(e, tr);
  });
  G.shots.push({ p: o.clone(), t: now(), sup: !!m.s, by: m.i });
  if (G.shots.length > 30) G.shots.shift();
}
// rounds that pass close to your head snap, and rattle you
function nearMiss(shooter, tr) {
  const me = G.me; if (!me || !me.alive || shooter === me) return;
  const head = camera.position;
  for (const [a, b] of tr.segs) {
    const ab = b.clone().sub(a), l = ab.length(); if (l < 0.01) continue; ab.divideScalar(l);
    const t = clamp(head.clone().sub(a).dot(ab), 0, l), d = a.clone().addScaledVector(ab, t).distanceTo(head);
    if (d < 2.2) { AU.snap(a.clone().addScaledVector(ab, t), true); G.suppress = Math.min(1, (G.suppress || 0) + 0.35 * (1 - d / 2.2)); return; }
  }
}
function sendHit(m) {
  const v = G.ents.get(m.v); if (!v) return;
  if (isMine(v)) applyHit(v, m);
  else if (G.net.isHost) G.net.sendTo(ownerOf(v), m);
  else G.net.send(m);
}
// on the victim's machine: what the round did
function applyHit(v, m) {
  if (!v.alive) return;
  const r = woundFrom(v, m);
  v.hp -= r.dmg; v.bleed += r.bleed;
  v.partDmg[m.part] = (v.partDmg[m.part] || 0) + r.dmg;
  if (r.limb && r.bleed > 0) v.limbBleed = true;
  if (m.part?.startsWith('leg') && r.dmg > 15) v.limp = true;
  if (m.part?.startsWith('arm') && r.dmg > 15) v.armHurt = true;
  if (m.by && m.by !== v.id) v.dmgBy[m.by] = (v.dmgBy[m.by] || 0) + r.dmg;
  v.lastBy = m.by; v.lastW = m.w;
  if (v.bot && v.brain) { v.brain.hurtBy = m.by; v.brain.hurtT = 3; const s = G.ents.get(m.by); if (s && !v.brain.target) { v.brain.goal = s.pos.clone(); v.brain.path = null; } }
  if (m.w !== 'fall') post({ t: 'wd', v: v.id, by: m.by, part: m.part, pt: m.pt, dir: m.dir, c: m.cal, thr: m.thr, st: r.stopped, ex: m.frag ? 1 : 0 });
  if (v === G.me) hurtMe(r, m);
  if (v.hp <= 0) killEnt(v, m);
}
function killEnt(v, m) {
  v.alive = false; v.hp = 0;
  const as = Object.entries(v.dmgBy).filter(([id, d]) => id !== m.by && d >= 25).map(([id]) => id);
  const killer = G.ents.get(m.by);
  const d = killer ? killer.pos.distanceTo(v.pos) : 0;
  const imp = m.dir ? V(...m.dir).multiplyScalar(m.frag ? 6 : Math.min(9, (CAL[m.cal]?.dmg || 30) / 14)) : V(0, 0, 0);
  if (m.frag) imp.y += 4;
  post({ t: 'kill', v: v.id, k: m.by, w: m.w, part: m.part, hs: m.part === 'head' ? 1 : 0, d: +d.toFixed(0), imp: vArr(imp), as, c: m.cal, ex: m.frag ? 1 : 0, exd: m.exd || 0, pt: m.pt, gk: v.gk, seq: ++G.killSeq });
}
function onWound(m) {
  const v = G.ents.get(m.v); if (!v || !v.body) return;
  const pt = V(...m.pt), dir = V(...(m.dir || [0, 0, 1]));
  if (m.st === 'plate' || m.st === 'helmet') { fx.spark(pt, 6, dir.clone().negate(), 2); AU.impact(pt, m.st); return; }
  if (m.by !== G.me?.id) gore.hit(pt, dir, CAL[m.c]?.mist || 1.5, !!m.thr, null, wallRay);
  if (gore.level > 0) { v.body.wound(pt, dir, m.part, 0.05 + (CAL[m.c]?.mist || 1) * 0.02); if (m.thr) v.body.wound(pt.clone().addScaledVector(dir, 0.25), dir, m.part, 0.06, true); }
}
function onKill(m) {
  const v = G.ents.get(m.v), k = G.ents.get(m.k); if (!v) return;
  if (v.killSeen === m.seq + ':' + m.f) return; v.killSeen = m.seq + ':' + m.f;
  v.alive = false; v.deadT = now(); v.deaths++;
  const self = !k || k === v;
  if (k && !self) { k.kills++; k.score += 100 + (m.hs ? 50 : 0); }
  for (const id of m.as || []) { const a = G.ents.get(id); if (a) { a.assists++; a.score += 50; if (isMine(a)) addMoney(a, ECON.assist, 'assist'); } }
  if (teams() && k && !self && G.cfg.mode === 'tdm') G.scores[k.team]++;
  // money for the kill
  if (k && !self && isMine(k)) {
    const melee = !!MELEE[m.w];
    addMoney(k, ECON.kill + (m.hs ? ECON.head : 0) + (melee ? ECON.melee : 0), m.hs ? 'headshot' : melee ? 'melee kill' : 'kill');
    if (k === G.me) { hitMarker('k'); AU.hitTick(true, !!m.hs); prog.stats.kills++; if (m.hs) prog.stats.hs++; prog.stats.longest = Math.max(prog.stats.longest, m.d || 0); }
  }
  // the body goes down
  if (v.body && !v.body.dead) ragdoll(v, m);
  makeDrop(v, m);
  if (v === G.me) { prog.stats.deaths++; dieMe(m); }
  if (v.bot) v.armor = { type: 'none', dur: 0 }, v.helmet = { type: 'none', dur: 0 }, v.util.frag = v.util.flash = v.util.smoke = 0;
  feed(m);
  if (G.net.isHost) { checkLimit(); broadcastRoster(); }
}
// the body, and what the gore setting says the round did to it
function ragdoll(v, m) {
  const b = v.body, imp = V(...(m.imp || [0, 0, 0]));
  const vel = v.vel.clone(); vel.y = Math.min(vel.y, 0);
  b.die(imp, m.part, vel);
  const L = gore.level, cal = m.c, heavy = ['.338', '.50BMG', '.50AE', '.500', '7.62x51', '6.8x51'].includes(cal) || (cal === '12ga' && (m.d || 99) < 8);
  if (L > 0 && m.hs && heavy && L >= 0.5) {
    // the head is destroyed: what a heavy round does at close range
    const hp = b.headPos.clone().add(V(0, 0.1, 0)), dir = imp.clone().normalize();
    b.detach('head', imp.clone().multiplyScalar(0.3));
    b.hideSeg('head'); stump(b, 'neck');
    gore.gib(hp, dir, 14, 3); gore.spray(hp, dir.clone().add(V(0, 0.3, 0)), 70, 5, 0.6); gore.puff(hp, dir, 1.0, 0.9); gore.puff(hp, dir.clone().multiplyScalar(0.5), 0.7, 1.2);
    const wh = raycast(G.W, hp, dir, 4); if (wh && !wh.ground) gore.splat(wh.point, 0.9, wh.normal);
    G.bleeders.push({ b, j: 'neck', t: 4 });
  } else if (L >= 0.7 && (m.ex && (m.exd || 9) < 2.6 || (cal === '.50BMG' && /arm|leg/.test(m.part || '')))) {
    const limbs = m.ex ? ['armL', 'armR', 'legL', 'legR'].sort(() => Math.random() - 0.5).slice(0, 1 + (Math.random() < 0.5 ? 1 : 0)) : [m.part];
    for (const l of limbs) {
      const sp = b.detach(l, imp.clone().multiplyScalar(0.8).add(V((Math.random() - 0.5) * 4, 2, (Math.random() - 0.5) * 4)));
      if (sp) { const j = b.joint(sp.root).clone(); gore.gib(j, imp.clone().normalize(), 6, 2); gore.spray(j, V(0, 1, 0), 40, 3, 1); stump(b, l.startsWith('arm') ? 'chest' : 'belly', j); G.bleeders.push({ b, j: sp.root, t: 3 }); }
    }
  }
  if (L > 0) G.pools.push({ b, t: 0, made: false });
}
function stump(b, seg, at = null) {
  const s = new THREE.Mesh(new THREE.SphereGeometry(seg === 'neck' ? 0.06 : 0.07, 8, 6), new THREE.MeshStandardMaterial({ map: TX.meat(), roughness: 0.35 }));
  const g = b.segMesh[seg]; if (!g) return;
  g.updateMatrixWorld(true);
  s.position.copy(at ? g.worldToLocal(at.clone()) : V(0, 0.13, 0)); g.add(s);
}
G.bleeders = []; G.pools = [];
function feed(m) {
  const v = G.ents.get(m.v), k = G.ents.get(m.k);
  const d = document.createElement('div');
  const col = (e) => teams() && e ? TEAM[e.team].color : '#e6e5df';
  const wn = GUNS[m.w]?.name.split(' (')[0] || MELEE[m.w]?.name || ({ frag: 'M67 frag', bleed: 'bled out', fall: 'fall' }[m.w]) || m.w || '';
  const nameSpan = (e) => { const s = document.createElement('span'); s.textContent = e ? e.name : '?'; s.style.color = col(e); return s; };
  if (k && k !== v) { d.appendChild(nameSpan(k)); const w = document.createElement('span'); w.className = 'w'; w.textContent = `[${wn}${m.hs ? ' · head' : ''}${m.d > 50 ? ' · ' + m.d + ' m' : ''}]`; d.appendChild(w); }
  else { const w = document.createElement('span'); w.className = 'w'; w.textContent = `[${wn || 'died'}]`; d.appendChild(w); }
  d.appendChild(nameSpan(v));
  if (v === G.me || k === G.me) d.className = 'me';
  $('feed').appendChild(d); while ($('feed').children.length > 6) $('feed').firstChild.remove();
  setTimeout(() => d.remove(), 7000);
}

// ================= DROPS (a dead soldier's gun) =================
function makeDrop(v, m) {
  const k = m.gk || v.gk; if (!k || k.startsWith('m:') || k.startsWith('n:') || !G.W) return;
  const [id, att, fin] = k.split('|'); if (!GUNS[id]) return;
  const mesh = makeGun(id, { att: att ? att.split(',').filter(Boolean) : [], finish: fin || 'black' });
  const p = v.body ? v.body.center.clone() : v.pos.clone();
  p.x += (Math.random() - 0.5) * 0.6; p.z += (Math.random() - 0.5) * 0.6; p.y = groundAt(G.W, p.x, p.z, p.y + 0.5) + 0.03;
  mesh.position.copy(p); mesh.rotation.set(Math.PI / 2, Math.random() * 6, 0, 'YXZ'); mesh.rotation.x = 0; mesh.rotation.z = Math.PI / 2;
  scene.add(mesh);
  const dropId = v.id + ':' + v.deaths;
  G.drops.set(dropId, { id: dropId, gun: id, att: att ? att.split(',').filter(Boolean) : [], mesh, pos: p, t: now() });
  // only a few lie around
  if (G.drops.size > 16) { const [first] = G.drops.keys(); G.drops.get(first).mesh.removeFromParent(); G.drops.delete(first); }
  // the bodies of a bot's victims stop being obstacles
}
function hostTake(m, from) {
  const d = G.drops.get(m.d); if (!d || d.taken) return;
  d.taken = true; post({ t: 'took', d: m.d, by: from });
}
function onTook(m) {
  const d = G.drops.get(m.d); if (!d) return;
  d.mesh.removeFromParent(); G.drops.delete(m.d);
  const e = G.ents.get(m.by);
  if (e && isMine(e) && e.alive) {
    e.picked = { id: d.gun, att: d.att }; const s = gunStats(d.gun, d.att);
    e.ammo[d.gun] = { mag: s.mag, res: s.mag * 2 };
    if (GUNS[d.gun].slot === 'sidearm') { e.loadout.sidearm = d.gun; e.att[d.gun] = d.att; e.picked = null; WP.equip(e, 'sidearm'); }
    else WP.equip(e, 'picked');
    if (e === G.me) { toast('Picked up ' + GUNS[d.gun].name); AU.mech('in'); }
  }
}

// ================= GRENADES =================
function throwNade(e, kind, vel, cook = 0) {
  const o = e === G.me ? camera.position.clone().add(dirOf(e).multiplyScalar(0.4)) : e.pos.clone().add(V(0, 1.6, 0));
  const id = e.id + '#' + (++G.nadeSeq);
  const m = { t: 'nade', n: id, by: e.id, k: kind, o: vArr(o), v: vArr(vel), f: +(UTIL[kind].fuse - cook).toFixed(2) };
  spawnNade(m, true); post(m);
}
function spawnNade(m, auth) {
  if (G.nades.has(m.n) || !G.W) return;
  const mesh = makeGrenade(m.k); mesh.position.set(...m.o); scene.add(mesh);
  G.nades.set(m.n, { ...m, p: mesh.position, vel: V(...m.v), mesh, t: 0, auth, rest: false });
}
function updateNades(dt) {
  for (const [id, n] of G.nades) {
    n.t += dt;
    if (!n.rest) {
      n.vel.y -= 9.8 * dt;
      const before = n.p.clone(), r = moveBody(G.W, n.p, n.vel.clone(), dt, 0.04, 0.08, 0);
      // a bounce: whatever axis got stopped flips
      const moved = n.p.clone().sub(before), want = n.vel.clone().multiplyScalar(dt);
      if (Math.abs(moved.x - want.x) > 1e-4) { n.vel.x *= -0.4; AU.bounce(n.p); }
      if (Math.abs(moved.z - want.z) > 1e-4) { n.vel.z *= -0.4; AU.bounce(n.p); }
      if (r.onGround) { if (Math.abs(n.vel.y) > 2) { AU.bounce(n.p); n.vel.y = -n.vel.y * 0.3; n.p.y += 0.001; } else n.vel.y = 0; n.vel.x *= Math.pow(0.04, dt); n.vel.z *= Math.pow(0.04, dt); if (n.vel.lengthSq() < 0.05) n.rest = true; }
      if (r.hitCeil) n.vel.y = -Math.abs(n.vel.y) * 0.3;
      n.mesh.rotation.x += dt * 8; n.mesh.rotation.z += dt * 5;
    }
    if (n.auth && n.t >= n.f) post({ t: 'boom', n: id, k: n.k, p: vArr(n.p), by: n.by });
    if (n.t > n.f + 3) { n.mesh.removeFromParent(); G.nades.delete(id); }
  }
}
function onBoom(m) {
  const n = G.nades.get(m.n); if (n) { n.mesh.removeFromParent(); G.nades.delete(m.n); }
  if (!G.W) return;
  const p = V(...m.p);
  if (m.k === 'smoke') { fx.smoke(p); AU.hiss(p, 3); return; }
  if (m.k === 'flash') {
    AU.bang(p); fx.explosion(p, 0.3);
    const me = G.me;
    if (me?.alive) {
      const eye = camera.position, d = eye.distanceTo(p);
      if (d < 22 && clearLine(G.W, p.clone().add(V(0, 0.2, 0)), eye)) {
        const fwd = V(0, 0, -1).applyQuaternion(camera.quaternion), facing = Math.max(0, fwd.dot(p.clone().sub(eye).normalize()));
        const amt = clamp((1 - d / 22) * (0.35 + facing * 0.9), 0, 1);
        G.flash = Math.max(G.flash || 0, amt * 5); AU.deafen(amt, 2 + amt * 4);
      }
    }
    if (G.net.isHost) for (const e of G.ents.values()) if (e.bot && e.alive && e.pos.distanceTo(p) < 16 && clearLine(G.W, p.clone().add(V(0, 0.3, 0)), e.pos.clone().add(V(0, 1.6, 0)))) { e.brain.target = null; e.brain.think = 3; e.brain.blind = 3; }
    return;
  }
  // frag
  fx.explosion(p, 1); AU.boom(p, 1);
  if (G.me?.alive) { const d = camera.position.distanceTo(p); if (d < 25) { G.shake = Math.max(G.shake || 0, 1 - d / 25); if (d < 12) AU.deafen(0.6 * (1 - d / 12), 3); } }
  for (const e of G.ents.values()) {
    if (!e.alive || !isMine(e) || !e.body) continue;
    const c = e.body.center, d = c.distanceTo(p);
    if (d > 15) continue;
    const covered = !clearLine(G.W, p.clone().add(V(0, 0.25, 0)), c) && !clearLine(G.W, p.clone().add(V(0, 0.25, 0)), e.body.headPos);
    const dmg = fragDamage(d, covered); if (dmg <= 0) continue;
    const parts = ['chest', 'belly', 'legL', 'legR', 'armL', 'armR'];
    const thrower = G.ents.get(m.by);
    if (teams() && !G.cfg.ff && thrower && thrower.team === e.team && thrower !== e) continue;
    // fragments: several hits on different parts (plates only cover the chest)
    const n = dmg > 100 ? 5 : 3;
    for (let i = 0; i < n && e.alive; i++) applyHit(e, { by: m.by, w: 'frag', frag: true, dmg: dmg / n * 1.35, part: parts[(Math.random() * parts.length) | 0], pt: vArr(c.clone().add(V((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.4))), dir: vArr(c.clone().sub(p).normalize()), cal: null, exd: d });
  }
}
function dirOf(e) { return V(0, 0, -1).applyEuler(new THREE.Euler(e.pitch, e.yaw, 0, 'YXZ')); }

// ================= THE LOCAL PLAYER =================
const P = { punch: 0, punchV: 0, punchR: 0, land: 0, landY: 0, landKick: 0, recoilP: 0, recoilY: 0, recov: 0, recovY: 0, breath: 1, holdB: false, stamina: 1, fat: 0, adsOn: false, light: false, throwSel: 'frag', lastDy: 0, stepN: 0, wasGround: true, vyMax: 0, cook: false, shake: 0, flinch: 0, swayT: 0 };
const EYE = [1.65, 1.08, 0.36], HEIGHT = [1.8, 1.2, 0.55];
function weightMul(e) {
  const g = GUNS[WP.curGun(e)]?.kg || 1, a = ARMOR[e.armor.type]?.kg || 0;
  return clamp(1.04 - (g + a - 3) * 0.016, 0.76, 1.04);
}
function updateMe(dt) {
  const me = G.me, w = me.ws, pad = input.pad, k = (c) => input.down(c), hit = (c) => input.hit(c);
  const ui = !$('buy').hidden || !$('pause').hidden;
  const gs = w?.stats || {};
  // ---- look ----
  const zoom = VM.info?.zoom && VM.ads > 0.9 ? VM.info.zoom : 1;
  input.touchSens = set.sens;
  const sens = 0.0022 * set.sens * (me.ads ? set.ads / Math.max(1, zoom * 0.75) : 1) * (input.padMode ? 1.4 : 1);
  if (!ui) { me.yaw -= input.dx * sens; me.pitch -= input.dy * sens * (set.inv === '1' ? -1 : 1); }
  // recoil goes in over a few frames, part of it comes back
  const rk = Math.min(1, dt * 30);
  const dp = P.recoilP * rk, dyw = P.recoilY * rk; me.pitch += dp; me.yaw += dyw; P.recoilP -= dp; P.recoilY -= dyw;
  P.recov += dp * 0.5; P.recovY += dyw * 0.3;
  if (P.recoilP < 0.0005) { const back = P.recov * Math.min(1, dt * 5); me.pitch -= back; P.recov -= back; const by = P.recovY * Math.min(1, dt * 5); me.yaw -= by; P.recovY -= by; }
  me.pitch = clamp(me.pitch, -1.45, 1.45);
  // aim assist (touch only): a gentle pull towards an enemy close to the crosshair, stronger when aiming
  if (pad?.touch && !ui) {
    const f = V(0, 0, -1).applyQuaternion(camera.quaternion), cam = camera.position;
    let best = null, bestA = me.ads ? 0.07 : 0.11;
    for (const o of G.ents.values()) {
      if (!o.alive || !o.body || !enemies(me, o)) continue;
      const to = o.body.center.clone().sub(cam), d = to.length(); if (d > 120) continue;
      const ang = f.angleTo(to); if (ang < bestA && clearLine(G.W, cam, o.body.center)) { bestA = ang; best = to; }
    }
    if (best) {
      const k = Math.min(1, dt * (me.ads ? 5 : 2.5) * (input.touch.look ? 1 : 0.6));
      let dy = Math.atan2(-best.x, -best.z) - me.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      me.yaw += dy * k; me.pitch += (Math.atan2(best.y, Math.hypot(best.x, best.z)) - me.pitch) * k;
    }
  }
  // ---- stance, lean ----
  const W = G.W;
  const want = (s) => { const nb = { ...me.pos }; void nb; return s >= me.stance || fits(W, me.pos, 0.28, HEIGHT[s]); };
  if (!ui) {
    if (hit('KeyC') || hit('ControlLeft') || (pad && pad.b)) { const s = me.stance === 1 ? 0 : 1; if (want(s)) me.stance = s; P.bHold = now(); }
    if (pad?.bHeld && P.bHold && now() - P.bHold > 0.45) { if (me.stance !== 2 && want(2)) me.stance = 2; P.bHold = 0; }
    if (hit('KeyZ')) { const s = me.stance === 2 ? 0 : 2; if (want(s)) me.stance = s; else if (want(1)) me.stance = 1; }
  }
  let leanT = (!ui && k('KeyQ') ? -1 : 0) + (!ui && k('KeyE') ? 1 : 0);
  if (me.stance === 2 || me.sprint) leanT = 0;
  me.lean += (leanT - me.lean) * Math.min(1, dt * 9);
  // ---- moving ----
  let mx = 0, mz = 0;
  if (!ui) { if (k('KeyW')) mz += 1; if (k('KeyS')) mz -= 1; if (k('KeyD')) mx += 1; if (k('KeyA')) mx -= 1; if (pad) { mx += pad.mx; mz += pad.mz; } }
  const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
  const sprintKey = !ui && (k('ShiftLeft') || k('ShiftRight') || (pad && pad.run));
  me.sprint = sprintKey && mz > 0.5 && me.stance === 0 && !me.ads && P.stamina > 0.05 && !(w && w.reloadT >= 0 && false);
  if (me.sprint) { P.stamina = Math.max(0, P.stamina - dt / 7); P.fat = Math.min(1, P.fat + dt * 0.15); } else P.stamina = Math.min(1, P.stamina + dt / 9);
  P.fat = Math.max(0, P.fat - dt * 0.08);
  let speed = me.stance === 2 ? 0.85 : me.stance === 1 ? 2.0 : me.sprint ? 6.1 : 3.6;
  if (me.ads) speed *= me.stance === 2 ? 0.5 : 0.62;
  speed *= weightMul(me) * (me.limp ? 0.62 : 1);
  if (w && w.healT >= 0) speed *= 0.5;
  const fwd = V(-Math.sin(me.yaw), 0, -Math.cos(me.yaw)), right = V(Math.cos(me.yaw), 0, -Math.sin(me.yaw));
  const target = fwd.multiplyScalar(mz).addScaledVector(right, mx).multiplyScalar(speed);
  const onG = P.wasGround, acc = onG ? 14 : 2.5;
  me.vel.x += (target.x - me.vel.x) * Math.min(1, dt * acc); me.vel.z += (target.z - me.vel.z) * Math.min(1, dt * acc);
  if (!ui && (hit('Space') || (pad && pad.jump)) && onG && me.stance === 0 && P.stamina > 0.1) { me.vel.y = 4.1; P.stamina -= 0.1; }
  else if (!ui && (hit('Space') || (pad && pad.jump)) && me.stance > 0 && want(0)) me.stance = 0;
  me.vel.y -= 9.81 * dt;
  const vyBefore = me.vel.y;
  const r = moveBody(W, me.pos, me.vel, dt, 0.28, HEIGHT[me.stance], me.stance === 2 ? 0.25 : 0.45);
  if (r.onGround && !P.wasGround && vyBefore < -8.5) { const dmg = (Math.abs(vyBefore) - 8.5) * 16; applyHit(me, { by: me.id, w: 'fall', frag: true, dmg, part: Math.random() < 0.5 ? 'legL' : 'legR', pt: vArr(me.pos), dir: [0, -1, 0] }); }
  if (r.onGround && !P.wasGround && vyBefore < -3) { AU.step(me.pos.y > 0.2 ? 'concrete' : 'sand', 0.4); P.land = Math.min(1.5, -vyBefore / 6); P.landKick = P.land * 0.6; }
  P.wasGround = r.onGround;
  me.speed = Math.hypot(me.vel.x, me.vel.z);
  me.phase += dt * me.speed * (me.stance === 2 ? 3.2 : me.stance === 1 ? 2.6 : 2.25);
  const step = Math.floor(me.phase / Math.PI);
  if (step !== P.stepN && me.speed > 0.6 && r.onGround) { P.stepN = step; if (me.stance < 2) AU.step(me.pos.y > 0.2 || W.def.ground === 'asphalt' ? 'concrete' : 'sand', me.sprint ? 0.32 : me.stance ? 0.1 : 0.2); }
  // ---- weapons ----
  if (!w) return;
  WP.tick(me, dt, hooks);
  const adsBtn = !ui && (input.rmb || (pad && pad.aim));
  if (set.adsT === 'toggle') { if (!ui && (input.rmbHit || (pad && pad.aim && !P.padAimWas))) P.adsOn = !P.adsOn; P.padAimWas = !!(pad && pad.aim); }
  const canAds = !!gs.modes && w.reloadT < 0 && w.healT < 0 && !me.sprint && w.switchT <= 0;
  me.ads = canAds && (set.adsT === 'toggle' ? P.adsOn : adsBtn);
  if (!canAds && set.adsT === 'toggle' && w.reloadT < 0) P.adsOn = P.adsOn && !me.sprint;
  if (!ui) {
    if (hit('Digit1') || (pad && pad.y && w.slot !== 'primary' && w.slot !== 'picked')) { WP.equip(me, me.picked ? 'picked' : 'primary') || WP.equip(me, 'primary'); }
    else if (hit('Digit2') || (pad && pad.y)) WP.equip(me, 'sidearm');
    if (hit('Digit3')) WP.equip(me, 'melee');
    if (input.wheel) { WP.equip(me, w.slot === 'sidearm' ? (me.picked ? 'picked' : 'primary') : 'sidearm'); input.wheel = 0; }
    if (hit('KeyR') || (pad && pad.x)) WP.reload(me, hooks);
    if (hit('KeyV') || (pad && pad.prev)) { if (WP.toggleMode(me)) { AU.click(0.3); toast('Fire mode: ' + WP.fireMode(me).toUpperCase(), 900); } }
    if (hit('KeyF') || (pad && pad.r3)) { if (w.slot === 'melee') WP.swing(me); else WP.quickMelee(me); if (w.swingT === 0) AU.swing(); }
    if (hit('KeyH') || (pad && pad.rb)) { const it = WP.startHeal(me); if (it) toast('Using ' + UTIL[it].name, 1500); else toast('Nothing to treat with, or nothing to treat', 1200); }
    if (hit('KeyT') || (pad && pad.next)) { P.light = !P.light; AU.click(0.2); }
    if (pad && pad.up) { const order = ['frag', 'flash', 'smoke']; P.throwSel = order[(order.indexOf(P.throwSel) + 1) % 3]; toast('Throwable: ' + UTIL[P.throwSel].name, 900); }
    // throwing: G frag (hold to cook), 4 flash, 5 smoke, LB the selected one
    const nadeKey = hit('KeyG') ? 'frag' : hit('Digit4') ? 'flash' : hit('Digit5') ? 'smoke' : pad && pad.lb ? P.throwSel : null;
    if (nadeKey && !w.nade) { if (WP.startNade(me, nadeKey)) { AU.pin(); P.nadeKey = nadeKey === P.throwSel && pad?.lb ? 'pad' : nadeKey === 'frag' ? 'KeyG' : nadeKey === 'flash' ? 'Digit4' : 'Digit5'; } else toast('No ' + UTIL[nadeKey].name.split(' (')[0] + ' left. Buy them (B).', 1200); }
    if (w.nade && w.throwT < 0 && w.switchT <= 0) { const held = P.nadeKey === 'pad' ? pad?.lbHeld : k(P.nadeKey); if (!held) WP.throwNow(me); }
    if (hit('KeyX') || (pad && pad.xHeld && P.prompt)) tryPickup();
  }
  // ---- firing ----
  const trig = !ui && (input.lmb || (pad && pad.fire)), trigHit = !ui && (input.lmbHit || (pad && pad.fireHit));
  if (w.slot === 'melee') { if (trigHit && WP.swing(me)) AU.swing(); }
  else if (gs.modes && !me.sprint && now() - (P.sprintEnd || 0) > 0.18) {
    const mode = WP.fireMode(me), auto = mode === 'auto';
    if ((auto && trig) || trigHit) {
      if (WP.canFire(me)) fireMe();
      else if (trigHit && me.ammo[w.id]?.mag === 0 && w.reloadT < 0) { AU.dryFire(); if (me.ammo[w.id].res > 0) WP.reload(me, hooks); }
    }
  }
  if (me.sprint) P.sprintEnd = now();
  me.gk = WP.gunKey(me);
  // ---- bleeding ----
  bleedTick(me, dt);
  // ---- a gun you can take, or ammo off a body ----
  P.prompt = null;
  for (const d of G.drops.values()) {
    const dist = d.pos.distanceTo(me.pos);
    if (dist < 1.8) {
      P.prompt = d;
      const cur = WP.curGun(me);
      if (cur && GUNS[cur].cal === GUNS[d.gun].cal && !me.scav.has(d.id)) { me.scav.add(d.id); const a = me.ammo[cur]; a.res += gunStats(cur, me.att[cur] || []).mag; toast('+1 magazine (' + CAL[GUNS[cur].cal].name + ')', 1200); AU.mech('out'); }
    }
  }
}
function tryPickup() {
  const d = P.prompt; if (!d || !G.me.alive) return;
  if (G.net.isHost) hostTake({ d: d.id }, G.net.id); else G.net.send({ t: 'take', d: d.id });
}
function bleedTick(e, dt) {
  if (!e.alive || e.bleed <= 0) return;
  e.hp -= e.bleed * dt;
  if (e.body && Math.random() < dt * e.bleed * 0.6 && gore.level > 0) { const c = e.body.center; gore.spray(c, V(0, -1, 0), 1, 0.5, 0.3); }
  if (e.hp <= 0) killEnt(e, { by: e.lastBy || e.id, w: e.lastBy && e.lastBy !== e.id ? e.lastW || 'bleed' : 'bleed', part: 'chest', dir: [0, -1, 0] });
}
// your trigger pull: spread, the shot, recoil, the bang
function fireMe() {
  const me = G.me, w = me.ws, s = w.stats;
  const mode = WP.fired(me);
  const C = CAL[s.cal];
  const aimDir = V(0, 0, -1).applyQuaternion(camera.quaternion);
  // spread: tight aimed, wide from the hip, worse moving or in the air
  const moveK = 1 + me.speed / 3 + (P.wasGround ? 0 : 2.5), stK = me.stance === 2 ? 0.55 : me.stance === 1 ? 0.8 : 1;
  const spread = (me.ads ? 0.0012 + (s.cls === 'Shotgun' ? 0.004 : 0) : s.hipSpread * moveK) * stK * (me.armHurt ? 1.4 : 1);
  const dirs = [];
  const n = C.pellets || 1;
  const base = aimDir.clone().add(randCone(spread));
  for (let i = 0; i < n; i++) dirs.push(n > 1 ? base.clone().add(randCone(C.spread)).normalize() : base.normalize());
  const origin = camera.position.clone();
  shoot(me, origin, dirs);
  // recoil
  const bip = s.bipod && me.stance >= 1 ? 0.3 : 1;
  const rec = s.recoil * s.recoilMul * (me.ads ? 0.85 : 1) * (me.stance === 2 ? 0.6 : me.stance === 1 ? 0.82 : 1) * bip * (me.armHurt ? 1.3 : 1);
  P.recoilP += rec * 0.011 * (0.85 + Math.random() * 0.3);
  P.recoilY += rec * 0.006 * (Math.random() - 0.5) * 2;
  P.kick = 1; P.shake = Math.max(P.shake, rec * 0.12); P.punchV = (P.punchV || 0) + rec * 0.35; P.punchR = (Math.random() - 0.5) * rec * 0.2;
  me.kick = 1;
  // muzzle flash, sound, brass
  const mw = camera.localToWorld(VM.muzzlePos());
  fx.muzzle(mw, aimDir, C.dmg > 80 ? 2 : s.cls === 'Shotgun' ? 1.6 : 1, s.suppressed);
  VM.flash();
  AU.gunshot(s.cal, null, s.suppressed, true);
  const ej = VM.ejectPos();
  if (ej && mode !== 'bolt' && mode !== 'pump' && s.cls !== 'Revolver') { fx.eject(camera.localToWorld(ej), aimDir, V(1, 0, 0).applyQuaternion(camera.quaternion), s.cls === 'Shotgun'); AU.shell(null, s.cls === 'Shotgun'); }
  if (mode === 'bolt') setTimeout(() => AU.mech('bolt'), 180);
  if (mode === 'pump') setTimeout(() => { AU.mech('pump'); fx.eject(camera.localToWorld(VM.ejectPos() || V()), aimDir, V(1, 0, 0).applyQuaternion(camera.quaternion), true); }, 160);
  input.rumble(Math.min(1, rec * 0.4), Math.min(1, rec * 0.3), 70);
}
function randCone(a) { const r = Math.sqrt(Math.random()) * a, t = Math.random() * Math.PI * 2; return V(Math.cos(t) * r, Math.sin(t) * r, Math.cos(t + 1) * r * 0.5); }
// weapon hooks: sounds, the knife landing, grenades leaving the hand, first aid finishing
const hooks = {
  sound(e, kind) { if (e === G.me) AU.mech(kind === 'out0' ? 'out' : kind); else if (e.body) AU.mech(kind === 'out0' ? 'out' : kind, e.pos); },
  meleeHit(e) {
    const o = e === G.me ? camera.position.clone() : e.pos.clone().add(V(0, 1.5, 0)), d = dirOf(e), M = MELEE[e.ws.id];
    let best = null;
    for (const { ent, body } of bodiesList()) { if (ent === e) continue; const h = body.raycast(o, d, M.range); if (h && (!best || h.t < best.t)) best = { ...h, ent }; }
    if (!best) { const wh = raycast(G.W, o, d, M.range); if (wh) { fx.impact(wh.point, wh.normal, wh.mat); AU.impact(wh.point, 'stone'); } return; }
    if (teams() && !G.cfg.ff && best.ent.team === e.team) return;
    const back = dirOf(best.ent).setY(0).normalize().dot(d.clone().setY(0).normalize()) > 0.5;
    gore.hit(best.point, d, 0.8, false, null, wallRay); AU.impact(best.point, 'flesh');
    sendHit({ t: 'hit', v: best.ent.id, by: e.id, w: e.ws.id, melee: e.ws.id, back, part: best.part, pt: vArr(best.point), dir: vArr(d) });
    if (e === G.me && set.hitm === '1') hitMarker('');
    if (e.ws.quickFrom) { const q = e.ws.quickFrom; setTimeout(() => { if (e.ws?.slot === 'melee') WP.equip(e, q); e.ws.quickFrom = null; }, 350); }
  },
  release(e, inHand = false) {
    const w = e.ws, n = w.nade; if (!n) return;
    const cook = n.cook || 0;
    if (e === G.me) {
      const d = V(0, 0, -1).applyQuaternion(camera.quaternion); d.y += 0.18; d.normalize();
      const v = inHand ? V(0, 0, 0) : d.multiplyScalar(n.kind === 'smoke' ? 12 : 15).add(e.vel.clone().multiplyScalar(0.6));
      throwNade(e, n.kind, v, cook);
    }
    w.nade = null;
    if (inHand) { w.throwT = 0.99; }
  },
  healDone(e, item) {
    const U = UTIL[item];
    if (item === 'cat') { e.limbBleed = false; e.bleed = Math.max(0, e.bleed * 0.25); }
    else if (item === 'bandage') { e.bleed = Math.max(0, e.bleed - 1.6); if (e.bleed < 0.2) e.bleed = 0; }
    else { e.bleed = 0; e.limbBleed = false; e.limp = false; e.armHurt = false; e.hp = Math.min(100, e.hp + U.heal); e.partDmg = {}; }
    if (e.bleed === 0) e.limbBleed = false;
    if (e === G.me) { AU.mech('slide'); toast(U.name + ' done', 1200); }
  },
};
// when the hand comes forward with a nade on a bot
function botRelease(e, target) {
  const o = e.pos.clone().add(V(0, 1.6, 0)), to = target.clone().sub(o), dh = Math.hypot(to.x, to.z), T = clamp(dh / 13, 0.6, 1.6);
  const v = V(to.x / T, (to.y + 0.5 * 9.8 * T * T) / T, to.z / T);
  throwNade(e, 'frag', v, 0);
}
function hurtMe(r, m) {
  const me = G.me;
  if (r.stopped) { P.flinch = 0.6; AU.impact(camera.position, r.stopped); G.blood = Math.max(G.blood || 0, 0.25); }
  else { AU.hurt(0.4 + Math.min(0.5, r.dmg / 80)); G.blood = Math.min(1, (G.blood || 0) + r.dmg / 45); P.flinch = Math.min(1.5, r.dmg / 25); }
  input.rumble(0.8, 0.5, 160);
  // which way it came from
  const s = G.ents.get(m.by);
  if (s && s !== me) { const to = s.pos.clone().sub(me.pos), ang = Math.atan2(-to.x, -to.z) - me.yaw; dmgArc(ang); }
}
function dieMe(m) {
  const me = G.me, k = G.ents.get(m.k);
  me.armor = { type: 'none', dur: 0 }; me.helmet = { type: 'none', dur: 0 };
  me.util.frag = me.util.flash = me.util.smoke = 0;
  me.picked = null;
  if (me.body) me.body.group.visible = true;
  input.unlock();
  P.adsOn = false; me.ads = false;
  const by = !k || k === me ? (m.w === 'fall' ? 'You fell' : m.w === 'bleed' ? 'You bled out' : 'You died') : 'Killed by ' + k.name;
  $('dBy').textContent = by;
  const wn = GUNS[m.w]?.name || MELEE[m.w]?.name || (m.w === 'frag' ? 'M67 fragmentation grenade' : '');
  $('dHow').textContent = [wn, m.part ? 'hit: ' + (PARTS[m.part]?.label || m.part) : '', m.d ? m.d + ' m' : ''].filter(Boolean).join(' · ');
  G.deathCam = { from: camera.position.clone(), k: k && k !== me ? k : null, t: 0 };
  setTimeout(() => { if (G.me && !G.me.alive && G.state === 'play') showDeath(true); }, 1800);
}
function showDeath(on) { $('death').hidden = !on; if (on) { $('scope').hidden = true; input.unlock(); } }

// ================= BOTS (host) =================
const botG = {
  get W() { return G.W; }, get mode() { return G.cfg.mode; }, get flags() { return G.flags; },
  enemiesOf, smoky: (a, b) => fx.smoky(a, b), weightMul,
  lastShotNear(e) { const t = now(); let best = null, bd = 1e9; for (const s of G.shots) { if (t - s.t > 1.5 || s.by === e.id) continue; const sh = G.ents.get(s.by); if (sh && !enemies(e, sh)) continue; const d = s.p.distanceTo(e.pos); if (d < (s.sup ? 22 : 70) && d < bd) { bd = d; best = s.p; } } return best; },
  heal(e) { WP.startHeal(e); },
  equip(e, slot) { return WP.equip(e, slot); },
  paths: 1, takePath() { if (botG.paths <= 0) return false; botG.paths--; return true; },
  reload(e) { WP.reload(e, hooks); },
  spk(k, t0) { spk(k, t0); },
  fire(e, yaw, pitch) {
    if (!WP.canFire(e)) return; const tf = SPK ? performance.now() : 0; try { this.fire0(e, yaw, pitch); } finally { spk('botFire', tf); }
  },
  fire0(e, yaw, pitch) { const s = e.ws.stats; WP.fired(e);
    const eye = e.pos.clone().add(V(0, EYE[e.stance], 0));
    const base = V(0, 0, -1).applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    const sp = (e.ads ? 0.0025 : s.hipSpread * 0.6) * (1 + e.speed / 4);
    const C = CAL[s.cal], n = C.pellets || 1, b0 = base.clone().add(randCone(sp)).normalize(), dirs = [];
    for (let i = 0; i < n; i++) dirs.push(n > 1 ? b0.clone().add(randCone(C.spread)).normalize() : b0);
    shoot(e, eye, dirs); e.kick = 1;
    const muz = e.body?.gun ? e.body.gun.localToWorld(e.body.gun.userData.info.muzzle.clone()) : eye;
    fx.muzzle(muz, base, C.dmg > 80 ? 2 : 1, s.suppressed); AU.gunshot(s.cal, muz, s.suppressed, false);
    if (WP.fireMode(e) === 'bolt') setTimeout(() => AU.mech('bolt', e.pos), 200);
  },
  throwNade(e, kind, target) { if (e.util[kind] > 0) { e.util[kind]--; botRelease(e, target); } },
  botGoal(e) { return botGoalFor(e, botG); },
};
function updateBots(dt) {
  botG.paths = 1;
  for (const e of G.ents.values()) {
    if (!e.bot) continue;
    if (!e.brain) makeBrain(e, G.cfg.diff);
    if (!e.alive) {
      if (e.frozen) continue; // tests
      if (now() - e.deadT > 5 && G.state === 'play') { const tr = SPK ? performance.now() : 0; botBuy(e, buy); spk('botBuy', tr); e.brain.target = null; e.brain.goal = null; e.brain.path = null; spawnEnt(e); }
      continue;
    }
    if (e.frozen) { e.vel.set(0, 0, 0); WP.tick(e, dt, hooks); continue; } // tests
    if (e.brain.blind > 0) { e.brain.blind -= dt; e.brain.target = null; }
    const tb = SPK ? performance.now() : 0; botThink(e, dt, botG); spk('botThink', tb);
    WP.tick(e, dt, hooks);
    if (!WP.isBusy(e) && e.ws.stats && !e.ws.stats.melee && e.ammo[e.ws.id]?.mag === 0) { if (!WP.reload(e, hooks) && e.ws.slot === 'primary') WP.equip(e, 'sidearm'); }
    bleedTick(e, dt);
    e.gk = WP.gunKey(e);
    if (e.pos.y < -5) { e.pos.copy(spawnPoint(e)); }
  }
}

// ================= MATCH RULES (host) =================
function hostTick(dt) {
  if (G.ended) { if (now() > G.endT) nextMatch(); return; }
  G.timeLeft -= dt;
  if (G.cfg.mode === 'dom') {
    G.domT = (G.domT || 0) + dt;
    if (G.domT >= 0.25) {
      const step = G.domT; G.domT = 0;
      G.flags.forEach((f, i) => {
        const n = [0, 0], who = [[], []];
        for (const e of G.ents.values()) if (e.alive && Math.hypot(e.pos.x - f.x, e.pos.z - f.z) < f.r && e.pos.y < 6) { n[e.team]++; who[e.team].push(e.id); }
        const t = n[0] && !n[1] ? 0 : n[1] && !n[0] ? 1 : -1;
        if (t >= 0 && f.owner !== t) {
          const rate = (1 + 0.5 * (Math.min(3, n[t]) - 1)) / 6 * step; // 6 s alone from neutral, faster with more
          f.p = clamp(f.p + (t === 0 ? rate : -rate), -1, 1);
          if ((t === 0 && f.p >= 1) || (t === 1 && f.p <= -1)) { f.owner = t; post({ t: 'cap', f: i, tm: t, who: who[t] }); for (const id of who[t]) { const e = G.ents.get(id); e.score += 150; if (e.bot) addMoney(e, ECON.capture); else if (e === G.me) addMoney(e, ECON.capture, 'captured ' + f.name); else G.net.sendTo(id, { t: 'cash', to: id, n: ECON.capture, why: 'captured ' + f.name }); } }
        } else if (t >= 0 && f.owner === t) f.p = clamp(f.p + (t === 0 ? 1 : -1) * step / 4, -1, 1);
        else if (t < 0 && !n[0] && !n[1] && f.owner === -1) f.p *= 0.995;
        // held points score
        if (f.owner >= 0) { f.acc = (f.acc || 0) + step; if (f.acc >= 1) { f.acc -= 1; G.scores[f.owner]++; } }
      });
    }
  }
  checkLimit();
  if (now() - G.lastM > 1) { G.lastM = now(); post({ t: 'M', tl: +G.timeLeft.toFixed(1), ts: G.scores, fl: G.flags.map((f) => [f.owner, +f.p.toFixed(2)]) }); }
}
function onCap(m) {
  const f = G.flags[m.f]; if (!f) return; f.owner = m.tm; f.p = m.tm === 0 ? 1 : -1;
  const mine = G.me && teams() && G.me.team === m.tm;
  AU.capture(mine); toast(`${TEAM[m.tm].name} captured ${f.name}`, 1800);
}
function checkLimit() {
  if (G.ended || !G.net?.isHost) return;
  const M = MODES[G.cfg.mode];
  let win = null;
  if (G.cfg.mode === 'ffa') { const top = [...G.ents.values()].sort((a, b) => b.kills - a.kills)[0]; if (top && (top.kills >= M.limit || G.timeLeft <= 0)) win = { ent: top.id }; }
  else { const [a, b] = G.scores; if (a >= M.limit || b >= M.limit || G.timeLeft <= 0) win = { team: a === b ? -1 : a > b ? 0 : 1 }; }
  if (win) { G.ended = true; G.endT = now() + 14; post({ t: 'end', win, ts: G.scores, list: rosterList() }); }
}
function onEnd(m) {
  G.ended = true; G.state = 'end'; if (m.list && !G.net.isHost) onRoster(m.list);
  const me = G.me;
  let won = false, res = '', sub = '';
  if (m.win.ent !== undefined) { const w = G.ents.get(m.win.ent); won = m.win.ent === me.id; res = won ? 'VICTORY' : 'DEFEAT'; sub = (w ? w.name : '?') + ' won with ' + (w ? w.kills : 0) + ' kills'; }
  else { won = m.win.team === me.team; res = m.win.team < 0 ? 'DRAW' : won ? 'VICTORY' : 'DEFEAT'; sub = `${TEAM[0].name} ${m.ts[0]} — ${m.ts[1]} ${TEAM[1].name}`; }
  const bonus = bankMatch(won);
  $('eRes').textContent = res; $('eRes').style.color = won ? 'var(--acc)' : 'var(--ink)';
  $('eSub').textContent = sub;
  $('eEarn').textContent = `Earned ${fmt$(me.earned)} + ${won ? 'win' : 'match'} bonus ${fmt$(bonus)} → bank ${fmt$(bank())}`;
  $('eTable').innerHTML = boardHTML();
  $('end').hidden = false; $('death').hidden = true; $('buy').hidden = true; input.unlock();
  G.endAt = now() + 14;
}
// match money becomes career money (the bank) once, at the end or when you leave
function bankMatch(won, leaving = false) {
  const me = G.me; if (!me || me.banked) return 0;
  me.banked = true;
  const bonus = leaving ? 0 : won ? ECON.win : ECON.lose;
  prog.earned += Math.round(me.earned + bonus);
  prog.stats.matches++; if (won) prog.stats.wins++;
  prog.stats.best = Math.max(prog.stats.best, me.kills);
  prog.stats.earnedMatches += Math.round(me.earned + bonus);
  persist();
  return bonus;
}
function nextMatch() {
  // public matches rotate the map and mode; private ones keep the host's choice
  const cfg = G.cfg.pub ? { ...G.cfg, ...newMatchCfg({ bots: G.cfg.bots, diff: G.cfg.diff, pub: true, ff: G.cfg.ff, name: G.cfg.name }) } : { ...G.cfg };
  post({ t: 'new', cfg });
}
function onNew(m) {
  const keep = [...G.ents.values()];
  buildMatch(m.cfg);
  for (const e of keep) { e.kills = e.deaths = e.assists = e.score = 0; e.money = ECON.start; e.earned = 0; e.alive = false; e.deadT = now() - 3; e.body = null; WP.newKit(e); if (e.bot) makeBrain(e, m.cfg.diff); }
  if (G.me) G.me.banked = false;
  G.state = 'play'; $('end').hidden = true;
  if (G.net.isHost) { fillBots(); broadcastRoster(); }
  showDeath(true);
  $('dBy').textContent = MODES[m.cfg.mode].name + ' · ' + G.W.name; $('dHow').textContent = MODES[m.cfg.mode].desc;
}

// ================= HUD =================
const hudCache = {};
const setText = (id, t) => { if (hudCache[id] !== t) { hudCache[id] = t; $(id).textContent = t; } };
function hitMarker(kind) { const h = $('hitm'); h.className = 'on ' + kind; clearTimeout(h._t); h._t = setTimeout(() => (h.className = ''), kind === 'k' ? 260 : 120); if (kind !== 'k') AU.hitTick(false, kind === 'h'); }
function dmgArc(ang) { const d = document.createElement('div'); d.style.transform = `rotate(${-ang}rad)`; $('dmgDir').appendChild(d); requestAnimationFrame(() => { d.style.opacity = 1; setTimeout(() => { d.style.opacity = 0; setTimeout(() => d.remove(), 900); }, 400); }); }
function buildCompass() { const s = $('compStrip'), names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' }; let h = ''; for (let k = 0; k < 3; k++) for (let d = 0; d < 360; d += 15) h += names[d] ? `<span class="c">${names[d]}</span>` : `<span>${d % 45 ? '·' : d}</span>`; s.innerHTML = h; }
buildCompass();
function updateHUD() {
  const me = G.me; if (!me) return;
  // compass: north is -Z
  let hd = (-me.yaw * 180 / Math.PI) % 360; if (hd < 0) hd += 360;
  $('compStrip').style.left = (210 - (360 + hd) / 15 * 30 - 15) + 'px';
  setText('cash', fmt$(me.money));
  // score line
  const M = MODES[G.cfg.mode], tl = Math.max(0, G.timeLeft), tt = `${(tl / 60) | 0}:${String((tl | 0) % 60).padStart(2, '0')}`;
  let sh;
  if (G.cfg.mode === 'ffa') { const sorted = [...G.ents.values()].sort((a, b) => b.kills - a.kills), rank = sorted.indexOf(me) + 1; sh = `<span>#${rank}</span><span class="t">${tt}</span><span>${me.kills} / ${M.limit}</span><span class="muted" style="font-size:15px">LEADER ${sorted[0]?.kills || 0}</span>`; }
  else sh = `<span class="b">${TEAM[0].name} ${G.scores[0]}</span><span class="t">${tt}</span><span class="o">${G.scores[1]} ${TEAM[1].name}</span>`;
  if (G.flags.length) sh += '<div id="flagsH">' + G.flags.map((f) => `<div style="border-color:${f.owner < 0 ? 'var(--faint)' : TEAM[f.owner].color};color:${f.owner < 0 ? 'var(--ink)' : TEAM[f.owner].color}">${f.name}<i style="width:${Math.abs(f.p) * 100}%;background:${f.p > 0 ? TEAM[0].color : TEAM[1].color}"></i></div>`).join('') + '</div>';
  if (hudCache.score !== sh) { hudCache.score = sh; $('score').innerHTML = sh; }
  // you
  const w = me.ws;
  if (me.alive && w) {
    const a = me.ammo[w.id];
    if (w.slot === 'melee') { setText('amN', '—'); setText('amR', ''); setText('amG', MELEE[w.id].name); setText('amM', ''); }
    else if (w.slot === 'nade') { setText('amN', ''); setText('amR', ''); setText('amG', UTIL[w.id].name + (w.nade?.cooking ? ' · cooking ' + (UTIL.frag.fuse - w.nade.cook).toFixed(1) : '')); setText('amM', ''); }
    else if (a) { setText('amN', String(a.mag)); setText('amR', '/ ' + a.res); setText('amG', GUNS[w.id].name + (w.slot === 'picked' ? ' (picked up)' : '')); setText('amM', (WP.fireMode(me) || '').toUpperCase() + (w.reloadT >= 0 ? ' · RELOADING' : '')); }
    const u = me.util;
    const uh = `<span>G frag <b>${u.frag}</b></span><span>4 flash <b>${u.flash}</b></span><span>5 smoke <b>${u.smoke}</b></span><span>H med <b>${u.bandage + u.cat + u.ifak}</b></span>`;
    if (hudCache.uh !== uh) { hudCache.uh = uh; $('utilH').innerHTML = uh; }
    setText('hpN', String(Math.max(0, Math.ceil(me.hp))));
    setText('armTxt', (me.armor.type !== 'none' ? ARMOR[me.armor.type].name.split(' ')[1] + ' ' + (me.armor.dur > 0 ? '▮'.repeat(Math.ceil(me.armor.dur)) : 'cracked') : 'no armour') + (me.helmet.type !== 'none' ? ' · helmet' : ''));
    $('bleedTxt').hidden = me.bleed <= 0.05;
    const partCol = (p) => { const d = me.partDmg[p] || 0; const k = clamp(d / 60, 0, 1); return `rgba(${230},${229 - k * 190},${223 - k * 200},${0.55 + k * 0.4})`; };
    for (const [id, p] of [['bpHead', 'head'], ['bpChest', 'chest'], ['bpBelly', 'belly'], ['bpArmL', 'armL'], ['bpArmR', 'armR'], ['bpLegL', 'legL'], ['bpLegR', 'legR']]) { const c = partCol(p); if (hudCache[id] !== c) { hudCache[id] = c; $(id).style.fill = c; } }
  }
  $('cross').hidden = (set.cross !== '1' && !input.touchMode) || !me.alive || me.ads;
  const touchOn = input.touchMode && G.state === 'play' && me.alive && $('buy').hidden && $('pause').hidden && $('end').hidden;
  if (hudCache.touchOn !== touchOn) { hudCache.touchOn = touchOn; $('touch').classList.toggle('on', touchOn); if (!touchOn) { input.touch.aimOn = false; input.touch.runOn = false; } }
  if (touchOn) { $('tAim').classList.toggle('toggled', !!input.touch.aimOn); $('tRun').classList.toggle('toggled', !!input.touch.runOn); $('tTake').classList.toggle('show', !!P.prompt); }
  if (hudCache.alive !== me.alive) { hudCache.alive = me.alive; $('ammo').hidden = $('bodyH').hidden = !me.alive; }
  // prompt
  const pr = me.alive && P.prompt ? `<kbd>${input.padMode ? input.label(2) : 'X'}</kbd>Take ${GUNS[P.prompt.gun].name}` : me.alive && canBuyNow() && now() - me.spawnT < 20 ? `<kbd>${input.touchMode ? 'BUY' : input.padMode ? '▼' : 'B'}</kbd>Buy` : '';
  if (hudCache.pr !== pr) { hudCache.pr = pr; $('prompt').innerHTML = pr; $('prompt').hidden = !pr; }
  // the edges go red as you lose blood
  const lowHp = me.alive ? clamp((60 - me.hp) / 60, 0, 1) : 0;
  $('bloodV').style.opacity = set.quality === 'low' ? Math.max(G.blood || 0, lowHp * 0.7).toFixed(2) : 0;
  $('flashW').style.opacity = clamp(G.flash || 0, 0, 1).toFixed(2);
  setText('msg', G.cfg.mode === 'dom' && me.alive ? domMsg() : '');
}
function domMsg() {
  const me = G.me; for (const f of G.flags) if (Math.hypot(me.pos.x - f.x, me.pos.z - f.z) < f.r) return f.owner === me.team ? `Holding ${f.name}` : `Capturing ${f.name} ${Math.round(Math.abs(f.p) * 100)}%`;
  return '';
}
function boardHTML() {
  const list = [...G.ents.values()].sort((a, b) => b.score - a.score || b.kills - a.kills);
  const row = (e) => `<tr class="${e === G.me ? 'me' : ''} ${e.alive ? '' : 'dead'}"><td class="${teams() ? (e.team ? 'to' : 'tb') : ''}">${teams() ? TEAM[e.team].name.slice(0, 1) : ''}</td><td>${esc(e.name)}${e.bot ? '<span class="bot">BOT</span>' : ''}</td><td>${e.kills}</td><td>${e.deaths}</td><td>${e.assists}</td><td>${e.score}</td></tr>`;
  const head = '<tr><th></th><th>Name</th><th>K</th><th>D</th><th>A</th><th>Score</th></tr>';
  if (!teams()) return `<table>${head}${list.map(row).join('')}</table>`;
  return [0, 1].map((t) => `<h3 style="color:${TEAM[t].color}">${TEAM[t].name} · ${G.scores[t]}</h3><table>${head}${list.filter((e) => e.team === t).map(row).join('')}</table>`).join('');
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function status(t, small = '') { const s = $('status'); if (!t) { s.hidden = true; return; } s.hidden = false; s.innerHTML = esc(t) + (small ? `<small>${esc(small)}</small>` : ''); }
function toast(t, ms = 3000) { const el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(el._t); el._t = setTimeout(() => (el.hidden = true), ms); }

// ================= BUY MENU =================
let buyTab = 'Rifles';
const BUY_TABS = { Pistols: (g) => g.slot === 'sidearm', SMGs: (g) => g.cls === 'SMG' || g.cls === 'PDW', Rifles: (g) => g.cls === 'Rifle' || g.cls === 'Battle rifle', Snipers: (g) => g.cls === 'Sniper' || g.cls === 'Marksman' || g.cls === 'Anti-materiel', Shotguns: (g) => g.cls === 'Shotgun', LMG: (g) => g.cls === 'LMG' };
function openBuy() {
  if (!G.me || G.state !== 'play') return;
  if (!canBuyNow()) { toast('You can only buy while dead, in your first 20 seconds, or back at your spawn.', 2200); return; }
  $('buy').hidden = false; input.unlock(); renderBuy();
}
function closeBuy() { $('buy').hidden = true; if (G.me?.alive) input.lock(); }
function renderBuy() {
  const me = G.me, tabs = [...Object.keys(BUY_TABS), 'Attachments', 'Melee', 'Utility', 'Armour'];
  $('buyMoney').textContent = fmt$(me.money);
  $('buyWhere').textContent = me.alive ? '· at spawn' : '· before you deploy';
  $('buyTabs').innerHTML = tabs.map((t) => `<button class="${t === buyTab ? 'on' : ''}" data-t="${t}">${t}</button>`).join('');
  const items = [];
  const card = (id, name, desc, price, own, eq, extra = '', forGun = '') => items.push(`<div class="item ${own ? 'own' : ''} ${eq ? 'eq' : ''} ${!own && price > me.money ? 'cant' : ''}" data-id="${id}" data-g="${forGun}"><div class="nm">${esc(name)}</div><div class="ds">${esc(desc)}${extra}</div><div class="pr">${price ? fmt$(price) : 'Free'}<i>${eq ? 'EQUIPPED' : own ? 'OWNED' : ''}</i></div></div>`);
  if (BUY_TABS[buyTab]) {
    for (const [id, g] of Object.entries(GUNS)) if (BUY_TABS[buyTab](g)) {
      const C = CAL[g.cal];
      card(id, g.name, g.desc, g.issued ? 0 : g.price, me.owned.includes(id), me.loadout[g.slot] === id, `<br><span class="mono" style="color:var(--ink)">${C.name} · ${g.mag} rds · ${g.rpm} rpm · ${g.kg} kg</span>`);
    }
    for (const id of [me.loadout.primary, me.loadout.sidearm].filter(Boolean)) if (BUY_TABS[buyTab](GUNS[id])) card('ammo:' + id, 'Ammunition: ' + GUNS[id].name.split(' (')[0], `${GUNS[id].shell ? 4 : 2} magazines of ${CAL[GUNS[id].cal].name}`, ammoPrice(id), false, false);
  } else if (buyTab === 'Attachments') {
    for (const gid of [me.loadout.primary, me.loadout.sidearm].filter(Boolean)) {
      items.push(`<div style="grid-column:1/-1"><h3 style="margin:6px 0 0">${esc(GUNS[gid].name)}</h3></div>`);
      for (const a of GUNS[gid].att) { const A = ATTACH[a]; card(a, A.name, `${A.slot.toUpperCase()} · ${A.desc}`, A.price, (me.ownedAtt[gid] || []).includes(a), (me.att[gid] || []).includes(a), '', gid); }
      if (!GUNS[gid].att.length) items.push('<div class="note" style="grid-column:1/-1">No attachments for this gun.</div>');
    }
  } else if (buyTab === 'Melee') { for (const [id, M] of Object.entries(MELEE)) card(id, M.name, M.desc, M.price, me.owned.includes(id), me.loadout.melee === id); }
  else if (buyTab === 'Utility') { for (const [id, U] of Object.entries(UTIL)) card(id, U.name, U.desc + ` (carry ${U.max})`, U.price, false, false, `<br><span class="mono" style="color:var(--ink)">Have ${me.util[id] || 0} / ${U.max}</span>`); }
  else if (buyTab === 'Armour') {
    for (const [id, A] of Object.entries(ARMOR)) if (id !== 'none') card(id, A.name, A.desc + ` (${A.kg} kg)`, A.price, false, me.armor.type === id && me.armor.dur > 0);
    for (const [id, H] of Object.entries(HELMET)) if (id !== 'none') card(id, H.name, H.desc, H.price, false, me.helmet.type === id && me.helmet.dur > 0);
  }
  $('buyItems').innerHTML = items.join('');
  const L = me.loadout;
  $('buyKit').innerHTML = `<span>Primary <b>${L.primary ? esc(GUNS[L.primary].name) : '—'}</b></span><span>Sidearm <b>${esc(GUNS[L.sidearm].name)}</b></span><span>Melee <b>${esc(MELEE[L.melee].name)}</b></span><span>Armour <b>${me.armor.type !== 'none' ? esc(ARMOR[me.armor.type].name) : 'none'}</b></span><span>Helmet <b>${me.helmet.type !== 'none' ? esc(HELMET[me.helmet.type].name) : 'none'}</b></span>`;
}
$('buyTabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { buyTab = b.dataset.t; renderBuy(); AU.ui(); } });
$('buyItems').addEventListener('click', (e) => {
  const it = e.target.closest('.item'); if (!it || !G.me) return;
  const id = it.dataset.id, ok = buy(G.me, id, it.dataset.g || null);
  AU.ui(ok ? 'buy' : 'deny'); if (!ok) toast(G.me.money < 1 ? 'No money' : 'Not enough money (or you already have the most you can carry)', 1500);
  if (ok && G.me.alive && (ARMOR[id] || HELMET[id])) { rebuildBody(G.me); G.me.body.group.visible = false; post({ t: 'spawn', i: G.me.id, p: vArr(G.me.pos), y: G.me.yaw, u: G.me.uni, ar: G.me.armor.type, he: G.me.helmet.type, tm: G.me.team, g: G.me.gk }); }
  renderBuy();
});
$('buyClose').onclick = closeBuy;

// ================= MENUS =================
function showTitle() {
  if (SOFTWARE && !TEST) toast('Your browser is drawing the game WITHOUT your graphics card (hardware acceleration is off: ' + gpuName + '). Turn on "Use graphics acceleration" in the browser settings and restart it. It will be many times faster.', 15000);
  $('title').hidden = false; $('warn').hidden = !!set.warned ? true : $('warn').hidden;
  $('nameIn').value = prog.name;
  $('bankLine').textContent = 'Bank ' + fmt$(bank());
  const s = prog.stats; $('statLine').textContent = `${s.kills} kills · ${s.deaths} deaths · ${s.matches} matches · longest kill ${s.longest} m`;
}
$('nameIn').addEventListener('change', () => { prog.name = cleanName($('nameIn').value); $('nameIn').value = prog.name; persist(); });
const openD = (id) => { $(id).hidden = false; AU.initAudio(); AU.ui(); };
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => { b.closest('.dialog').hidden = true; AU.ui(); }));
$('bQuick').onclick = () => { AU.initAudio(); quickPlay(); };
$('brQuick').onclick = () => { $('browseD').hidden = true; quickPlay(); };
$('bOffline').onclick = () => { AU.initAudio(); hostMatch(newMatchCfg({ pub: false, name: 'Offline' }), true); };
$('bHost').onclick = () => openD('hostD'); $('brHost').onclick = () => { $('browseD').hidden = true; openD('hostD'); };
$('bJoin').onclick = () => { openD('joinD'); $('jCode').focus(); };
$('bSettings').onclick = () => { fillSettings(); openD('setD'); };
$('bArmory').onclick = () => { renderArmory(); openD('armD'); };
$('bStats').onclick = () => { const s = prog.stats; $('statsG').innerHTML = [['Kills', s.kills], ['Deaths', s.deaths], ['K/D', (s.kills / Math.max(1, s.deaths)).toFixed(2)], ['Headshots', s.hs], ['Matches', s.matches], ['Wins', s.wins], ['Most kills in a match', s.best], ['Longest kill', s.longest + ' m'], ['Earned in matches', fmt$(prog.earned)], ['Spent in the armory', fmt$(prog.spent)], ['Bank', fmt$(bank())]].map(([a, b]) => `<label>${a}</label><span class="mono">${b}</span>`).join(''); openD('statsD'); };
$('hMode').innerHTML = Object.entries(MODES).map(([k, m]) => `<option value="${k}">${m.name}</option>`).join('');
$('hMap').innerHTML = MAP_LIST.map((m) => `<option value="${m.id}">${m.name}</option>`).join('');
const hDesc = () => { $('hDesc').textContent = MODES[$('hMode').value].desc + ' ' + MAP_LIST.find((m) => m.id === $('hMap').value).desc; $('hBotsV').textContent = $('hBots').value + ' players'; };
['hMode', 'hMap', 'hBots'].forEach((id) => $(id).addEventListener('input', hDesc)); hDesc();
$('hGo').onclick = () => { $('hostD').hidden = true; hostMatch({ mode: $('hMode').value, map: $('hMap').value, bots: +$('hBots').value, diff: $('hDiff').value, pub: $('hPublic').checked, ff: $('hFF').checked, name: prog.name + "'s match" }); };
$('jGo').onclick = async () => { const c = cleanCode($('jCode').value); if (c.length !== 4) { $('jErr').textContent = 'Codes are 4 letters.'; return; } $('jErr').textContent = ''; try { await joinMatch(c); $('joinD').hidden = true; } catch (e) { $('jErr').textContent = e.message; } };
$('jCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('jGo').click(); });
$('bBrowse').onclick = () => {
  openD('browseD'); const B = G.browser;
  const draw = () => {
    $('brStatus').textContent = B.status === 'online' ? 'Online. Matches appear here as hosts announce them.' : B.status === 'connecting' ? 'Connecting to the match list…' : 'The match list is unreachable right now (you can still host, or join with a code).';
    const L = B.matches(VER);
    $('brList').innerHTML = L.length ? L.map((s) => `<div class="it"><span>${esc(s.name)}</span><span class="mono">${esc(MODES[s.mode]?.short || s.mode)}</span><span>${esc(MAP_LIST.find((m) => m.id === s.map)?.name || s.map)}</span><span class="mono">${s.players}+${s.bots}/${s.max}</span><button data-code="${s.code}">Join</button></div>`).join('') : '<div class="it muted"><span>No public matches right now. Quick Play will host one for you, with bots.</span></div>';
  };
  B.onChange = draw; draw(); B.start().catch(() => {}).then(draw);
};
$('brList').addEventListener('click', async (e) => { const b = e.target.closest('button[data-code]'); if (!b) return; try { $('browseD').hidden = true; await joinMatch(b.dataset.code); } catch (er) { G.browser.markDead(b.dataset.code); toast(er.message); } });
// ---- armory ----
let armTab = 'Uniforms', armGun = 'm4';
function renderArmory() {
  $('armBank').textContent = fmt$(bank());
  $('armTabs').innerHTML = ['Uniforms', 'Weapon finishes'].map((t) => `<button class="${t === armTab ? 'on' : ''}" data-t="${t}">${t}</button>`).join('');
  const items = [];
  if (armTab === 'Uniforms') {
    for (const [id, U] of Object.entries(UNIFORM)) { const own = !!prog.own.uni[id], eq = prog.equip.uni === id; items.push(`<div class="item ${own ? 'own' : ''} ${eq ? 'eq' : ''} ${!own && U.price > bank() ? 'cant' : ''}" data-u="${id}"><canvas class="sw" data-sw="${id}" width="200" height="28"></canvas><div class="nm">${esc(U.name)}</div><div class="ds">A full set: shirt, trousers, cap. Others see it on you.</div><div class="pr">${U.price ? fmt$(U.price) : 'Issued'}<i>${eq ? 'EQUIPPED' : own ? 'OWNED' : ''}</i></div></div>`); }
  } else {
    items.push(`<div style="grid-column:1/-1" class="row">Gun <select id="armGunSel">${Object.entries(GUNS).map(([id, g]) => `<option value="${id}" ${id === armGun ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select><span class="note">Finishes are per gun, like a real Cerakote job.</span></div>`);
    for (const [id, F] of Object.entries(FINISH)) { const key = armGun + ':' + id, own = id === 'black' || !!prog.own.fin[key], eq = (prog.equip.fin[armGun] || 'black') === id; items.push(`<div class="item ${own ? 'own' : ''} ${eq ? 'eq' : ''} ${!own && F.price > bank() ? 'cant' : ''}" data-f="${id}"><div class="sw" style="background:${TX.hex(F.color)}"></div><div class="nm">${esc(F.name)}</div><div class="ds">${F.pattern ? 'Pattern finish' : 'Solid ceramic coating'}</div><div class="pr">${F.price ? fmt$(F.price) : 'Factory'}<i>${eq ? 'EQUIPPED' : own ? 'OWNED' : ''}</i></div></div>`); }
  }
  $('armItems').innerHTML = items.join('');
  $('armItems').querySelectorAll('canvas[data-sw]').forEach((c) => { const t = TX.camo(UNIFORM[c.dataset.sw]).map.image; const g = c.getContext('2d'); g.fillStyle = g.createPattern(t, 'repeat'); g.fillRect(0, 0, c.width, c.height); });
  $('armGunSel')?.addEventListener('change', (e) => { armGun = e.target.value; renderArmory(); });
}
$('armTabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { armTab = b.dataset.t; renderArmory(); AU.ui(); } });
$('armItems').addEventListener('click', (e) => {
  const it = e.target.closest('.item'); if (!it) return;
  if (it.dataset.u) { const id = it.dataset.u, U = UNIFORM[id]; if (!prog.own.uni[id]) { if (bank() < U.price) { AU.ui('deny'); toast('Not enough in the bank'); return; } prog.spent += U.price; prog.own.uni[id] = true; AU.ui('buy'); } prog.equip.uni = id; }
  if (it.dataset.f) { const id = it.dataset.f, F = FINISH[id], key = armGun + ':' + id; if (id !== 'black' && !prog.own.fin[key]) { if (bank() < F.price) { AU.ui('deny'); toast('Not enough in the bank'); return; } prog.spent += F.price; prog.own.fin[key] = true; AU.ui('buy'); } prog.equip.fin[armGun] = id; }
  persist(); renderArmory(); showTitle(); menuScene();
});
// ---- settings ----
function fillSettings() {
  const map = { sSens: 'sens', sAds: 'ads', sFov: 'fov', sVol: 'vol', sGore: 'gore', sQual: 'quality', sAdsT: 'adsT', sCross: 'cross', sHitm: 'hitm', sInv: 'inv', sPads: 'pads', sPerf: 'perf' };
  for (const [id, k] of Object.entries(map)) { $(id).value = set[k]; const v = $(id + 'V'); if (v) v.textContent = k === 'vol' ? Math.round(set[k] * 100) + '%' : set[k]; }
}
for (const [id, k] of Object.entries({ sSens: 'sens', sAds: 'ads', sFov: 'fov', sVol: 'vol', sGore: 'gore', sQual: 'quality', sAdsT: 'adsT', sCross: 'cross', sHitm: 'hitm', sInv: 'inv', sPads: 'pads', sPerf: 'perf' })) {
  $(id).addEventListener('input', () => {
    const el = $(id); set[k] = el.type === 'range' ? +el.value : el.value;
    const v = $(id + 'V'); if (v) v.textContent = k === 'vol' ? Math.round(set[k] * 100) + '%' : set[k];
    if (k === 'vol') AU.setVolume(set.vol); if (k === 'gore') gore.level = set.gore / 100; if (k === 'quality') { applyQuality(); toast('Graphics: ' + set.quality + '. Anti-aliasing changes after a reload.', 2500); } if (k === 'pads') input.pads = set.pads === '1'; if (k === 'perf') perfEl.hidden = set.perf !== '1'; if (k === 'fov') { camera.fov = vfov(); camera.updateProjectionMatrix(); }
    store(SKEY, set);
  });
}
$('warnOk').onclick = () => { set.warned = true; store(SKEY, set); $('warn').hidden = true; AU.initAudio(); AU.setVolume(set.vol); showTitle(); };
$('warnLow').onclick = () => { set.gore = 0; gore.level = 0; $('warnOk').click(); };
// ---- pause ----
function pause(on) {
  if (G.state !== 'play') return;
  $('pause').hidden = !on;
  if (on) { input.unlock(); $('pCode').textContent = G.net?.offline ? 'Offline match' : 'Match code ' + G.net?.code + (G.cfg.pub ? ' · public' : ' · private'); $('pInvite').hidden = !!G.net?.offline; }
  else if (G.me?.alive) input.lock();
}
$('pResume').onclick = () => pause(false);
$('pBuy').onclick = () => { pause(false); openBuy(); };
$('pSettings').onclick = () => { fillSettings(); $('setD').hidden = false; };
$('pInvite').onclick = () => { const u = location.origin + location.pathname + '?join=' + G.net.code; navigator.clipboard?.writeText(u).then(() => toast('Invite link copied'), () => toast(u, 6000)); };
$('pLeave').onclick = () => leaveMatch(); $('eLeave').onclick = () => leaveMatch();
$('dDeploy').onclick = () => deploy(); $('dBuy').onclick = () => openBuy();
document.addEventListener('pointerlockchange', () => { if (!input.locked && G.state === 'play' && G.me?.alive && $('buy').hidden && $('setD').hidden && !TEST) pause(true); });
canvas.addEventListener('click', () => { if (G.state === 'play' && G.me?.alive && $('pause').hidden && $('buy').hidden) input.lock(); });
addEventListener('wheel', (e) => { if (G.state === 'play' && input.locked) input.wheel = Math.sign(e.deltaY); }, { passive: true });
addEventListener('keydown', (e) => {
  if (G.state === 'menu') return;
  if (e.code === 'Tab') { e.preventDefault(); $('board').innerHTML = boardHTML(); $('board').hidden = false; }
  if (e.code === 'KeyB' && G.state === 'play') { if ($('buy').hidden) openBuy(); else closeBuy(); }
  if (e.code === 'Escape' && !$('buy').hidden) closeBuy();
  if (e.code === 'Space' && G.me && !G.me.alive && $('buy').hidden) deploy();
});
addEventListener('keyup', (e) => { if (e.code === 'Tab') $('board').hidden = true; });

// ================= THE MENU BACKDROP =================
// a slow camera over the map, a soldier standing in your uniform
let menuSoldier = null;
function menuScene() {
  if (G.state !== 'menu') return;
  if (!G.W) { G.cfg = { mode: 'tdm', map: Math.random() < 0.5 ? 'hadra' : 'kessel' }; buildMatch(G.cfg); }
  if (menuSoldier) menuSoldier.dispose();
  menuSoldier = new Soldier({ uniform: prog.equip.uni, armor: 'iii', helmet: 'fast' });
  const gun = 'm4'; menuSoldier.setGun(gun, ['optic_holo', 'grip_vert', 'las_peq'], prog.equip.fin[gun] || 'black');
  scene.add(menuSoldier.group);
}

// ================= MAIN LOOP =================
let last = performance.now();
// ---------- performance readout: F3 (or Settings) ----------
const gpuName = (() => { try { const gl = renderer.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch { return '?'; } })();
const SOFTWARE = /swiftshader|llvmpipe|software|basic render|microsoft basic/i.test(gpuName);
const perfEl = document.createElement('div'); perfEl.id = 'perf'; perfEl.hidden = set.perf !== '1'; document.body.appendChild(perfEl);
const PF = { n: 0, acc: 0, worst: 0, t: 0, cpu: 0 };
function perfTick(raw, cpuMs) {
  PF.n++; PF.acc += raw; PF.worst = Math.max(PF.worst, raw); PF.cpu += cpuMs;
  if (PF.acc < 0.5) return;
  if (!perfEl.hidden) {
    const i = renderer.info.render, sz = renderer.getDrawingBufferSize(new THREE.Vector2());
    perfEl.textContent = `${Math.round(PF.n / PF.acc)} fps · ${(PF.acc / PF.n * 1000).toFixed(1)} ms (worst ${(PF.worst * 1000).toFixed(0)}) · game ${(PF.cpu / PF.n).toFixed(1)} ms · ${i.calls} draws · ${(i.triangles / 1000).toFixed(0)}k tris · ${sz.x}×${sz.y} (${Math.round(gov.scale * 100)}%) · ${set.quality} · ${gpuName}`;
  }
  PF.n = PF.acc = PF.worst = PF.cpu = 0;
}
addEventListener('keydown', (e) => { if (e.code === 'F3') { e.preventDefault(); set.perf = set.perf === '1' ? '0' : '1'; perfEl.hidden = set.perf !== '1'; store(SKEY, set); } });
function frame(t) {
  requestAnimationFrame(frame);
  const raw = Math.min(0.1, (t - last) / 1000); last = t;
  const dt = Math.min(raw, 1 / 20);
  gov.tick(raw);
  input.pollPad(dt);
  const c0 = performance.now();
  step(dt, true);
  perfTick(raw, performance.now() - c0);
  input.endFrame();
}
// the simulation; render = false when the tab is hidden (the host keeps the match running)
function step(dt, render) {
  if (G.state === 'menu') { menuTick(dt); if (render) draw(); return; }
  if (!G.W || !G.me || !G.net) { if (render) draw(); return; }
  const me = G.me, host = G.net.isHost, pad = input.pad;
  // controller menu buttons
  if (pad) {
    if (pad.viewHit) { $('board').innerHTML = boardHTML(); $('board').hidden = false; } else if (!pad.view && !$('board').hidden && !input.down('Tab')) $('board').hidden = true;
    if (pad.downB && G.state === 'play') { if ($('buy').hidden) openBuy(); else closeBuy(); }
    if (pad.pause) { if (!$('buy').hidden) closeBuy(); else pause($('pause').hidden); }
    if (!me.alive && pad.a && $('buy').hidden) deploy();
  }
  if (me.alive && G.state === 'play') updateMe(dt);
  else if (me.ws) WP.tick(me, dt, hooks);
  if (host) { if (!G.ended) updateBots(dt); hostTick(dt); }
  else G.timeLeft -= dt;
  // everyone else
  for (const e of G.ents.values()) {
    if (e !== me && !isMine(e)) interp(e);
    poseEnt(e, dt);
    if (e.body?.dead) e.body.updateRagdoll(dt, G.W);
  }
  for (const c of G.corpses) c.updateRagdoll(dt, G.W);
  // pools under the dead, once they've stopped moving; stumps that keep pumping for a few seconds
  for (let i = G.pools.length - 1; i >= 0; i--) { const p = G.pools[i]; p.t += dt; if ((p.b.resting || p.t > 3) && !p.made) { p.made = true; const c = p.b.center; gore.pool(V(c.x, groundAt(G.W, c.x, c.z, c.y + 0.3), c.z), 0.9 + Math.random() * 0.7, 0.1); G.pools.splice(i, 1); } }
  for (let i = G.bleeders.length - 1; i >= 0; i--) { const b = G.bleeders[i]; b.t -= dt; b.acc = (b.acc || 0) + dt; if (b.acc > 0.07) { b.acc = 0; gore.spray(b.b.joint(b.j), V((Math.random() - 0.5), 1, (Math.random() - 0.5)), 3, 1.5 * Math.max(0.2, b.t / 3), 0.5); } if (b.t <= 0) G.bleeders.splice(i, 1); }
  updateNades(dt);
  // send my state 20 times a second; the host sends everyone's
  const tnow = now();
  if (tnow - G.lastS > 0.05) {
    G.lastS = tnow;
    if (!host) { if (me.alive) G.net.send(myState()); }
    else if (!G.net.offline) post({ t: 'S', a: [...G.ents.values()].filter((e) => e.alive).map((e) => { const s = e === me ? myState() : e.bot ? botState(e) : null; if (!s) return [e.id, ...(e.buf.at(-1)?.p || [e.pos.x, e.pos.y, e.pos.z]), e.yaw, e.pitch, e.stance, e.lean, e.speed, (e.ads ? 1 : 0) | (e.sprint ? 2 : 0), e.gk, e.rl || 0, e.sw || 0]; return [e.id, ...s.p, s.y, s.x, s.st, s.l, s.sp, s.fl, s.g, s.r, s.w]; }) });
  }
  // flags
  G.flags.forEach((f, i) => { const m = G.flagMarks[i]; if (!m) return; const col = f.owner < 0 ? 0xdddddd : TEAM[f.owner].hex; m.userData.cloth.material.color.setHex(col); m.userData.ring.material.color.setHex(col); m.userData.cloth.position.y = 1 + Math.abs(f.p) * 3; m.userData.cloth.rotation.y = Math.sin(tnow * 2 + i) * 0.25; });
  // fx
  gore.update(dt, camera.position); fx.update(dt, camera);
  G.blood = Math.max(0, (G.blood || 0) - dt * 0.4); G.flash = Math.max(0, (G.flash || 0) - dt); G.suppress = Math.max(0, (G.suppress || 0) - dt * 0.5); G.shake = Math.max(0, (G.shake || 0) - dt * 2);
  if (G.state === 'end') { const left = Math.max(0, (G.endAt || 0) - now()); $('eNext').textContent = host ? `Next match in ${Math.ceil(left)}…` : 'Waiting for the host to start the next match…'; }
  if (render) { placeCamera(dt); updateHUD(); draw(); }
}
function botState(e) { return { p: [+e.pos.x.toFixed(2), +e.pos.y.toFixed(2), +e.pos.z.toFixed(2)], y: +e.yaw.toFixed(3), x: +e.pitch.toFixed(3), st: e.stance, l: 0, sp: +e.speed.toFixed(1), fl: (e.ads ? 1 : 0) | (e.sprint ? 2 : 0), g: e.gk, r: e.ws && e.ws.reloadT >= 0 ? +(e.ws.reloadT / e.ws.reloadDur).toFixed(2) : 0, w: 0 }; }
function placeCamera(dt) {
  const me = G.me, w = me.ws;
  if (me.alive) {
    const eyeH = EYE[me.stance];
    P.eyeH = P.eyeH === undefined ? eyeH : P.eyeH + (eyeH - P.eyeH) * Math.min(1, dt * 10);
    const right = V(Math.cos(me.yaw), 0, -Math.sin(me.yaw));
    camera.position.copy(me.pos).add(V(0, P.eyeH, 0)).addScaledVector(right, me.lean * 0.34);
    camera.position.y -= Math.abs(me.lean) * 0.06;
    // sway when aiming: breathing, worse scoped, worse hurt, better braced; hold breath with Shift
    P.swayT += dt;
    const zoom = VM.info?.zoom || 1, scoped = me.ads && VM.ads > 0.85;
    const holding = scoped && zoom >= 4 && (input.down('ShiftLeft') || input.down('ShiftRight') || input.pad?.run) && P.breath > 0;
    P.breath = holding ? Math.max(0, P.breath - dt / 5) : Math.min(1, P.breath + dt / 7);
    const A = (me.ads ? 0.0016 : 0.004) * (zoom >= 4 ? 1.5 : 1) * (me.armHurt ? 2 : 1) * (me.stance === 2 ? 0.35 : me.stance === 1 ? 0.7 : 1) * (w?.stats?.bipod && me.stance ? 0.3 : 1) * (holding ? 0.12 : 1) * (1 + P.fat * 1.5 + (G.suppress || 0) * 2) * (P.breath <= 0 ? 2.2 : 1);
    const sx = (Math.sin(P.swayT * 0.9) + Math.sin(P.swayT * 1.7) * 0.5) * A, sy = Math.sin(P.swayT * 1.3) * A * 0.8;
    P.flinch *= Math.exp(-dt * 6); P.shake *= Math.exp(-dt * 12);
    // a short punch per shot on top of the real recoil (visual only: it springs back), and a dip on landing
    for (let i = 0, n = Math.ceil(dt / 0.004), h = dt / n; i < n; i++) { P.punchV = (P.punchV || 0) + (-300 * (P.punch || 0) - 26 * P.punchV) * h; P.punch = (P.punch || 0) + P.punchV * h; }
    P.landY = (P.landY || 0) * Math.exp(-dt * 7) + (P.land || 0) * 0.08; P.land = 0; camera.position.y -= P.landY;
    const sh = (P.shake + (G.shake || 0) * 0.04) * 0.5;
    camera.rotation.set(me.pitch + sy + P.flinch * 0.03 + (P.punch || 0) * 0.012 + (Math.random() - 0.5) * sh * 0.02, me.yaw + sx + (Math.random() - 0.5) * sh * 0.02, -me.lean * 0.17 + (P.punch || 0) * (P.punchR || 0) * 0.02);
    // field of view: optics magnify
    const targetFov = scoped && zoom >= 4 ? vfov(zoom) : vfov(1 + VM.ads * (VM.info?.optic ? 0.25 : 0.12));
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * (scoped && zoom >= 4 ? 30 : 12));
    camera.updateProjectionMatrix();
    // the viewmodel
    const gk = me.gk;
    if (P.vmKey !== gk) { P.vmKey = gk; if (gk.startsWith('m:')) VM.setMelee(gk.slice(2)); else if (gk.startsWith('n:')) VM.setNade(gk.slice(2)); else if (gk) { const [id, att, fin] = gk.split('|'); VM.setGun(id, att ? att.split(',').filter(Boolean) : [], fin); } else VM.setEmpty(); }
    VM.update(dt, { ads: me.ads ? 1 : 0, adsTime: w?.stats?.adsTime, dx: input.dx, dy: input.dy, speed: me.speed, phase: me.phase, kick: P.kick || 0, reload: w && w.reloadT >= 0 ? w.reloadT / w.reloadDur : -1, reloadKind: w?.stats?.shell ? 'shell' : 'mag', cycle: w && w.cycleT >= 0 ? w.cycleT / w.cycleDur : -1, cycleKind: w?.cycleKind, sprint: me.sprint, swing: w && w.swingT >= 0 ? w.swingT : -1, throwT: w?.throwT >= 0 ? w.throwT : w?.nade ? 0.3 : 0, heal: w && w.healT >= 0 ? w.healT / UTIL[w.healItem].time : -1, switching: w && w.switchT > 0 ? w.switchT / (w.switchDur || 0.4) : 0, lean: me.lean,
      strafe: clamp((me.vel.x * Math.cos(me.yaw) - me.vel.z * Math.sin(me.yaw)) / 5, -1, 1), land: P.landKick || 0 });
    P.landKick = 0;
    P.kick = 0;
    // scope overlay
    const showScope = scoped && zoom >= 4 && VM.ads > 0.95;
    if ($('scope').hidden === showScope) { $('scope').hidden = !showScope; if (showScope) drawScope(VM.info); }
    VM.holder.visible = !showScope; VM.arms.visible = !showScope;
    // weapon light and laser
    const hasLight = !!VM.info?.lightAt; wlight.intensity = hasLight && P.light ? 60 : 0;
    if (VM.info?.laserAt && !me.sprint) { const d = V(0, 0, -1).applyQuaternion(camera.quaternion), h = raycast(G.W, camera.position, d, 150); let best = h ? h.t : 150; for (const { ent, body } of bodiesList()) { if (ent === me) continue; const bh = body.raycast(camera.position, d, best); if (bh) best = bh.t; } laserDot.visible = true; laserDot.position.copy(camera.position).addScaledVector(d, best - 0.02).add(V(0.02, -0.03, 0).applyQuaternion(camera.quaternion).multiplyScalar(Math.min(1, best / 10))); laserDot.scale.setScalar(Math.max(1, best / 8)); } else laserDot.visible = false;
  } else {
    // dead: the camera drifts up and back from your body, towards whoever did it
    $('scope').hidden = true; laserDot.visible = false; wlight.intensity = 0;
    const D = G.deathCam;
    if (D && me.body) {
      D.t += dt; const c = me.body.center, k = D.k?.alive && D.k.body ? D.k.body.center : null;
      const back = k ? c.clone().sub(k).setY(0).normalize() : V(0, 0, 1);
      const want = c.clone().addScaledVector(back, 2.6 + Math.min(1.5, D.t * 0.3)).add(V(0, 1.8 + Math.min(1, D.t * 0.2), 0));
      camera.position.lerp(want, Math.min(1, dt * 3));
      const look = k && D.t > 1.2 ? c.clone().lerp(k, 0.35) : c;
      camera.up.set(0, 1, 0); camera.lookAt(look);
    }
    camera.fov += (vfov() - camera.fov) * Math.min(1, dt * 5); camera.updateProjectionMatrix();
  }
  AU.setListener(camera.position, V(0, 0, -1).applyQuaternion(camera.quaternion));
  // the sky follows the camera
  pfx.follow(camera.position, performance.now() / 1000);
  // shadows cover the area around you
  const sd = V(...G.W.sun.dir).normalize();
  const c = camera.position.clone().setY(0); c.x = Math.round(c.x / 4) * 4; c.z = Math.round(c.z / 4) * 4;
  sun.target.position.copy(c); sun.position.copy(c).addScaledVector(sd, 200);
}
function drawScope(info) {
  const cv = $('scopeRet'), g = cv.getContext('2d'); g.clearRect(0, 0, 512, 512);
  const img = TX.reticle(info?.optic ? (ATTACH[info.optic].reticle) : 'mil').image;
  g.drawImage(img, 0, 0, 512, 512);
}
function draw() {
  if (isCheap()) { cheapen(scene, true); cheapen(VM.scene, true); }
  // the shadow map is redrawn every frame on High / Ultra, every other frame on Medium
  if (renderer.shadowMap.enabled && ++shadowN >= shadowEvery) { shadowN = 0; sun.shadow.needsUpdate = true; }
  const showVM = G.state !== 'menu' && !!G.me?.alive && VM.holder.visible;
  if (showVM) { VM.cam.fov = 58; VM.cam.updateProjectionMatrix(); }
  const lowHp = G.me?.alive ? clamp((60 - G.me.hp) / 60, 0, 1) : 0;
  pfx.render(showVM, { hurt: G.state === 'menu' ? 0 : Math.max(G.blood || 0, lowHp * 0.7), suppress: G.state === 'menu' ? 0 : clamp(G.suppress || 0, 0, 1), flash: 0 }, performance.now() / 1000);
}
let menuT = 0;
function menuTick(dt) {
  menuT += dt;
  if (!G.W) return;
  const r = 14, a = menuT * 0.05;
  const f = G.W.flags[1];
  camera.position.set(f.x + Math.cos(a) * r, 3.2 + Math.sin(menuT * 0.2) * 0.3, f.z + Math.sin(a) * r);
  camera.up.set(0, 1, 0); camera.lookAt(f.x, 1.4, f.z);
  camera.fov = 55; camera.updateProjectionMatrix();
  if (menuSoldier) {
    const p = V(f.x + Math.cos(a) * (r - 4.5), 0, f.z + Math.sin(a) * (r - 4.5));
    p.x += Math.cos(a + 1.57) * 1.4; p.z += Math.sin(a + 1.57) * 1.4;
    p.y = groundAt(G.W, p.x, p.z, 2);
    menuSoldier.pose({ pos: p, yaw: Math.atan2(-(camera.position.x - p.x), -(camera.position.z - p.z)) + 0.5, pitch: -0.25, stance: 0, lean: 0, speed: 0, phase: 0, hold: 'gun', ads: false });
  }
  pfx.follow(camera.position, performance.now() / 1000);
  const sd = V(...G.W.sun.dir).normalize(); sun.target.position.set(f.x, 0, f.z); sun.position.set(f.x, 0, f.z).addScaledVector(sd, 200);
}
// the host keeps simulating when its tab is in the background
setInterval(() => { if (document.hidden && G.net?.isHost && G.state !== 'menu') { input.pollPad(0.05); step(0.05, false); } }, 50);

// ================= SYNC (progress between devices) =================
if (window.GameSync) {
  try {
    GameSync.init({ game: 'coldbore', idle: () => G.state === 'menu', keys: [{ match: PKEY, mode: 'max', skip: ['name', 'equip'] }] });
    $('syncBtn').onclick = () => GameSync.open();
  } catch { $('syncBtn').hidden = true; }
} else $('syncBtn').hidden = true;

// ================= BOOT =================
if (set.warned) { $('warn').hidden = true; }
showTitle(); menuScene();
requestAnimationFrame(frame);
AU.setVolume(set.vol);
// warm-up while the title screen sits there: every gun model and uniform texture is built now, not mid-fight
(() => {
  const jobs = [...Object.keys(UNIFORM).map((u) => () => TX.camo(UNIFORM[u])), ...Object.keys(GUNS).map((g) => () => makeGun(g)), ...['optic_holo', 'optic_dot', 'grip_vert'].map((a) => () => makeGun('m4', { att: [a] }))];
  const idle = window.requestIdleCallback || ((f) => setTimeout(() => f({ timeRemaining: () => 8 }), 30));
  const next = (d) => { while (jobs.length && d.timeRemaining() > 4) { try { jobs.shift()(); } catch { /* skip */ } } if (jobs.length) idle(next); };
  idle(next);
})();
const joinParam = new URLSearchParams(location.search).get('join');
if (joinParam && set.warned) setTimeout(() => joinMatch(cleanCode(joinParam)).catch((e) => toast(e.message)), 500);

// test hooks
if (TEST) window.__s = { G, P, set, prog, buy, step, hostMatch, joinMatch, newMatchCfg, deploy, input, camera, applyHit, spawnEnt, updateBots, scene, renderer, VM, gore, fx, WP, leaveMatch, quickPlay, openBuy, closeBuy, menuScene,
  tp(x, z, yaw = 0, pitch = 0) { const me = G.me; me.pos.set(x, groundAt(G.W, x, z, 1), z); me.yaw = yaw; me.pitch = pitch; },
  get state() { return G.state; } };

// Loads the game, starts an offline match against bots, deploys, lets the bots fight for a while, shoots one,
// and screenshots along the way. Fails on any console error or failed check.
import { open, sleep } from './harness.mjs';
import { spawn } from 'child_process';
import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 8700 + Math.floor(Math.random() * 200);
const srv = spawn(process.execPath, ['serve.js'], { cwd: root, env: { ...process.env, PORT: port }, stdio: 'ignore' });
process.env.SH_URL = `http://localhost:${port}/`;
await sleep(600);
const { ev, shot, check, done } = await open(import.meta.url);
await sleep(6000);
await shot('0-warn');
await ev(`document.getElementById('warnOk').click()`); await sleep(1500);
await shot('1-title');
check(await ev(`return !document.getElementById('title').hidden`), 'title visible');
const map = process.env.MAP || 'hadra', mode = process.env.MODE || 'tdm';
await ev(`__s.hostMatch(__s.newMatchCfg({ mode: '${mode}', map: '${map}', bots: 10, pub: false }), true)`); await sleep(2500);
check(await ev(`return __s.state`) === 'play', 'in a match');
check(await ev(`return __s.G.ents.size`) === 10, 'ten players (me + 9 bots): ' + await ev(`return __s.G.ents.size`));
await shot('2-deploy-screen');
await ev(`__s.G.me.money = 20000; __s.buy(__s.G.me, 'hk416'); __s.buy(__s.G.me, 'optic_holo', 'hk416'); __s.buy(__s.G.me, 'iii'); __s.buy(__s.G.me, 'ach'); __s.buy(__s.G.me, 'frag'); __s.buy(__s.G.me, 'bandage')`);
await ev(`__s.deploy()`); await sleep(1500);
check(await ev(`return __s.G.me.alive`), 'deployed');
await shot('3-spawned');
// look around the map: aim at the middle
await ev(`const me = __s.G.me; me.yaw = Math.atan2(me.pos.x, me.pos.z); me.pitch = -0.02;`); await sleep(800);
await shot('4-looking');
// let the bots fight (time passes fast in a hidden-tab step loop? no: real time)
await ev(`window.__god = true`);
for (let i = 0; i < 12; i++) { await sleep(1500); await ev(`__s.G.me.hp = 100; __s.G.me.bleed = 0;`); }
const st = await ev(`const L = [...__s.G.ents.values()]; return { kills: L.reduce((s, e) => s + e.kills, 0), alive: L.filter((e) => e.alive).length, moved: L.filter((e) => e.bot && e.pos.length() > 0).length, corpses: __s.G.corpses.length, scores: __s.G.scores }`);
console.log('after 18 s:', JSON.stringify(st));
check(st.alive >= 5, 'bots are alive');
await shot('5-fight');
// put a bot right in front of me and shoot it in the head
await ev(map === 'kessel' ? `__s.tp(0, 14, Math.PI, 0)` : `__s.tp(-25, -4, Math.PI, 0)`); await sleep(500);
const r = await ev(`const me = __s.G.me, b = [...__s.G.ents.values()].find((e) => e.bot && e.alive && e.team !== me.team);
  if (!b) return 'no bot';
  b.frozen = true;
  b.pos.set(me.pos.x - Math.sin(me.yaw) * 8, me.pos.y, me.pos.z - Math.cos(me.yaw) * 8); b.vel.set(0,0,0); b.stance = 0; b.yaw = me.yaw + Math.PI;
  return b.id;`);
await sleep(300);
const res = await ev(`const me = __s.G.me, b = __s.G.ents.get('${r}');
  b.body.pose({ pos: b.pos, yaw: b.yaw, pitch: 0, stance: 0, lean: 0, speed: 0, phase: 0, hold: 'gun' });
  const h = b.body.headPos.clone().add(new (__s.camera.position.constructor)(0, 0.1, 0));
  const eye = __s.camera.position.clone(); const d = h.sub(eye);
  me.yaw = Math.atan2(-d.x, -d.z); me.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
  return { hp: b.hp, dist: d.length().toFixed(1) };`);
console.log('target', r, JSON.stringify(res));
console.log('line of sight', await ev(`const W = await import('./js/world.js'); const b = __s.G.ents.get('${r}'), o = __s.camera.position, t = b.body.headPos.clone().add(new o.constructor(0, 0.1, 0)); const d = t.clone().sub(o); const h = W.raycast(__s.G.W, o, d.clone().normalize(), d.length()); return h ? 'blocked by ' + h.mat + ' at ' + h.t.toFixed(2) + ' m, box ' + JSON.stringify(h.box && [h.box.min, h.box.max]) : 'clear';`));
await sleep(200);
await ev(`__s.input.rmb = true`); await sleep(900); await shot('5b-ads');
// up to three trigger pulls (software rendering is slow: a frame can take longer than a click)
for (let k = 0; k < 3 && await ev(`return __s.G.ents.get('${r}').alive`); k++) { await ev(`__s.input.lmbHit = true; __s.input.lmb = true;`); await sleep(700); await ev(`__s.input.lmb = false;`); await sleep(500); }
await ev(`__s.input.rmb = false;`);
await sleep(600);
const after = await ev(`const b = __s.G.ents.get('${r}'); return { alive: b.alive, hp: Math.round(b.hp), dead: b.body?.dead, myKills: __s.G.me.kills, money: __s.G.me.money }`);
console.log('after shot:', JSON.stringify(after));
check(!after.alive, 'the headshot killed the bot');
await shot('6-kill');
await sleep(1500);
await shot('7-ragdoll');
// look down at the body
await ev(`const me = __s.G.me, b = __s.G.ents.get('${r}'); const c = b.body.center.clone().sub(__s.camera.position); me.yaw = Math.atan2(-c.x, -c.z); me.pitch = Math.atan2(c.y, Math.hypot(c.x, c.z));`);
await sleep(1500); await shot('8-body');
// open the buy menu
await ev(`__s.G.me.spawnT = performance.now() / 1000; __s.openBuy()`); await sleep(500); await shot('9-buy');
await ev(`__s.closeBuy()`);
srv.kill(); await done();

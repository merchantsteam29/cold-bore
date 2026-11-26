// Gore paths: a .50 BMG headshot (head destroyed), a frag next to a bot (limbs), wounds and pools. Screenshots.
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
await ev(`document.getElementById('warnOk').click(); __s.set.gore = 100; __s.gore.level = 1;`); await sleep(500);
await ev(`__s.hostMatch(__s.newMatchCfg({ mode: 'tdm', map: 'hadra', bots: 4, pub: false }), true)`); await sleep(2500);
await ev(`__s.G.me.money = 50000; __s.buy(__s.G.me, 'm82'); __s.buy(__s.G.me, 'frag'); __s.buy(__s.G.me, 'frag'); __s.deploy();`); await sleep(1500);
await ev(`__s.tp(-25, -4, Math.PI, 0)`); await sleep(1500);
// two enemy bots in front, frozen
const ids = await ev(`const me = __s.G.me, L = [...__s.G.ents.values()].filter((e) => e.bot && e.team !== me.team).slice(0, 2);
  for (const b of L) { if (!b.alive) __s.spawnEnt(b); b.frozen = true; }
  L[0].pos.set(me.pos.x, 0, me.pos.z + 7); L[0].yaw = 0.3; L[1].pos.set(me.pos.x + 3, 0, me.pos.z + 12); L[1].yaw = 0;
  return L.map((b) => b.id);`);
await sleep(600);
const aimAt = (id, part) => ev(`const me = __s.G.me, b = __s.G.ents.get('${id}'); const t = ${part === 'head' ? `b.body.headPos.clone().add(new (__s.camera.position.constructor)(0, 0.1, 0))` : 'b.body.center.clone()'}; const d = t.sub(__s.camera.position); me.yaw = Math.atan2(-d.x, -d.z); me.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));`);
await aimAt(ids[0], 'head'); await ev(`__s.input.rmb = true`); await sleep(1200);
await aimAt(ids[0], 'head'); await sleep(300);
console.log(await ev(`const me = __s.G.me, b = __s.G.ents.get('${ids[0]}'); const c = __s.camera.position.clone(); const d = new c.constructor(0, 0, -1).applyQuaternion(__s.camera.quaternion); const r = b.body.raycast(c, d, 100); return JSON.stringify({ ids: ${JSON.stringify(ids)}, alive: b.alive, hit: r && r.part, ads: me.ads, bpos: b.pos, mpos: me.pos, team: [me.team, b.team] })`));
await ev(`__s.input.lmbHit = true; __s.input.lmb = true;`); await sleep(100); await ev(`__s.input.lmb = false; __s.input.rmb = false;`);
await sleep(250); await shot('1-50cal-impact');
check(await ev(`return !__s.G.ents.get('${ids[0]}').alive`), '.50 killed it');
check(await ev(`return __s.G.ents.get('${ids[0]}').body.lost.has('head')`), 'head destroyed at gore 100');
await sleep(2500);
await ev(`const me = __s.G.me, b = __s.G.ents.get('${ids[0]}'); const d = b.body.center.clone().sub(__s.camera.position); me.yaw = Math.atan2(-d.x, -d.z); me.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));`);
await sleep(800); await shot('2-50cal-body');
// a frag at the second bot's feet
await ev(`const b = __s.G.ents.get('${ids[1]}'); const p = b.pos.clone(); p.x += 0.6; p.y = 0.05; __s.G.nades.clear(); window.__boom = p;`);
await ev(`const p = window.__boom; const m = { t: 'nade', n: 'test#1', by: __s.G.me.id, k: 'frag', o: [p.x, p.y + 0.3, p.z], v: [0, 0, 0], f: 0.4 }; __s.G.net.onMessage(m, 'x');`);
await ev(`const b = __s.G.ents.get('${ids[1]}'); const d = b.body.center.clone().sub(__s.camera.position); __s.G.me.yaw = Math.atan2(-d.x, -d.z); __s.G.me.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));`);
await sleep(100);
// the nade from 'x' isn't ours, so the boom has to be posted the way the thrower would
await ev(`const p = window.__boom; __s.G.net.onMessage({ t: 'boom', n: 'test#1', k: 'frag', p: [p.x, p.y, p.z], by: __s.G.me.id }, 'x');`);
await sleep(150); await shot('3-frag');
console.log(await ev(`const b = __s.G.ents.get('${ids[1]}'), p = window.__boom; return JSON.stringify({ hp: b.hp, alive: b.alive, d: b.body.center.distanceTo(p), bp: b.pos, p, frozen: b.frozen, part: b.partDmg })`));
await sleep(2500); await shot('4-frag-after');
const r = await ev(`const b = __s.G.ents.get('${ids[1]}'); return { alive: b.alive, lost: [...b.body.lost], deadT: b.deadT, spawnT: b.spawnT, now: performance.now() / 1000, deaths: b.deaths }`);
console.log('frag victim:', JSON.stringify(r));
check(!r.alive, 'frag killed the second bot');
srv.kill(); await done();

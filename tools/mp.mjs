// Two browsers over the real PeerJS cloud: A hosts a private match with bots, B joins with the code. Checks that
// B gets the match, sees everyone move, that B's shot kills A's bot (hit routed to the host) and A's shot kills B
// (hit routed to the client), and that the kills show on both sides.
import { open, sleep } from './harness.mjs';
import { spawn } from 'child_process';
import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 8700 + Math.floor(Math.random() * 200);
const srv = spawn(process.execPath, ['serve.js'], { cwd: root, env: { ...process.env, PORT: port }, stdio: 'ignore' });
process.env.SH_URL = `http://localhost:${port}/`;
await sleep(600);
const A = await open(import.meta.url, { tag: '-host' });
const B = await open(import.meta.url, { tag: '-client' });
await sleep(6000);
for (const X of [A, B]) await X.ev(`document.getElementById('warnOk').click(); __s.prog.name = '${'X'}'`);
await A.ev(`__s.prog.name = 'Hostess'`); await B.ev(`__s.prog.name = 'Joiner'`);
await A.ev(`__s.hostMatch(__s.newMatchCfg({ mode: 'tdm', map: 'hadra', bots: 4, pub: false, ff: true }), false)`);
let code = null;
for (let i = 0; i < 40 && !code; i++) { await sleep(500); code = await A.ev(`return __s.G.net?.code && !__s.G.net.offline ? __s.G.net.code : null`); }
console.log('code', code, 'offline?', await A.ev(`return __s.G.net?.offline`));
A.check(!!code, 'host got a code');
await B.ev(`__s.joinMatch('${code}').catch((e) => window.__err = e.message)`);
let st = null;
for (let i = 0; i < 40; i++) { await sleep(500); st = await B.ev(`return __s.state`); if (st === 'play') break; }
console.log('client state', st, await B.ev(`return window.__err || ''`));
B.check(st === 'play', 'client in the match');
for (let i = 0; i < 6; i++) { await sleep(500); console.log('client', await B.ev(`return __s.state + ' ents=' + __s.G.ents.size + ' toast=' + document.getElementById('toast').textContent + ' net=' + !!__s.G.net`)); }
console.log('host errs', JSON.stringify(A.errs));
console.log('host ents', await A.ev(`return [...__s.G.ents.values()].map((e) => e.id + ':' + e.team).join(' ')`));
console.log('client ents', await B.ev(`return [...__s.G.ents.values()].map((e) => e.id + ':' + e.team).join(' ')`));
B.check(await B.ev(`return __s.G.ents.size`) === 4, 'client sees 4 players (2 humans + 2 bots)');
// both deploy
await A.ev(`__s.G.me.money = 9000; __s.buy(__s.G.me, 'm4'); __s.deploy()`); await B.ev(`__s.G.me.money = 9000; __s.buy(__s.G.me, 'm4'); __s.deploy()`);
await sleep(2500);
const bSees = await B.ev(`const h = __s.G.ents.get('h'); return { alive: h.alive, pos: h.pos, body: !!h.body }`);
console.log('client sees host:', JSON.stringify(bSees));
B.check(bSees.alive && bSees.body, 'client sees the host alive');
// put a frozen enemy bot in front of the client on the host, and let the client shoot it
const myTeam = await B.ev(`return __s.G.me.team`);
const botId = await A.ev(`const b = [...__s.G.ents.values()].find((e) => e.bot && e.team !== ${myTeam}); if (!b.alive) __s.spawnEnt(b); b.frozen = true; b.stance = 0; b.pos.set(-25, 0, 4); return b.id;`);
await B.ev(`__s.tp(-25, -4, Math.PI, 0)`);
await sleep(1500);
const aim = await B.ev(`const me = __s.G.me, b = __s.G.ents.get('${botId}'); if (!b?.body) return 'no body'; const t = b.body.center.clone(); const d = t.sub(__s.camera.position); me.yaw = Math.atan2(-d.x, -d.z); me.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); __s.input.rmb = true; return JSON.stringify(b.pos);`);
console.log('client aims at bot', botId, aim);
await sleep(1200);
for (let i = 0; i < 4; i++) { await B.ev(`const me = __s.G.me, b = __s.G.ents.get('${botId}'); const d = b.body.center.clone().sub(__s.camera.position); me.yaw = Math.atan2(-d.x, -d.z); me.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); __s.input.lmbHit = true; __s.input.lmb = true;`); await sleep(150); await B.ev(`__s.input.lmb = false`); await sleep(250); }
await B.ev(`__s.input.rmb = false`);
await sleep(1500);
const botAfter = await A.ev(`const b = __s.G.ents.get('${botId}'); return { alive: b.alive, hp: Math.round(b.hp), deaths: b.deaths }`);
console.log('bot on host after client fire:', JSON.stringify(botAfter));
A.check(!botAfter.alive, 'client killed the host bot');
const kills = await B.ev(`return { kills: __s.G.me.kills, money: __s.G.me.money }`);
console.log('client after kill', JSON.stringify(kills));
B.check(kills.kills === 1, 'client got the kill');
await B.shot('client-view');
// the host shoots the client
await A.ev(`__s.tp(-25, 12, 0, 0)`); await B.ev(`__s.tp(-25, 6, 0, 0); __s.G.me.stance = 0;`);
await sleep(1500);
for (let i = 0; i < 6; i++) { await A.ev(`const me = __s.G.me, b = __s.G.ents.get('${await B.ev('return __s.G.me.id')}'); if (!b.alive) return; const d = b.body.center.clone().sub(__s.camera.position); me.yaw = Math.atan2(-d.x, -d.z); me.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); __s.input.rmb = true; __s.input.lmbHit = true; __s.input.lmb = true;`); await sleep(150); await A.ev(`__s.input.lmb = false`); await sleep(350); }
await sleep(1500);
const cl = await B.ev(`return { alive: __s.G.me.alive, hp: Math.round(__s.G.me.hp), deaths: __s.G.me.deaths, death: !document.getElementById('death').hidden }`);
console.log('client after host fire:', JSON.stringify(cl));
B.check(!cl.alive, 'host killed the client (same team? then FF is off and this is expected)');
await B.shot('client-dead'); await A.shot('host-view');
srv.kill();
console.log('HOST errs', JSON.stringify(A.errs, null, 1).slice(0, 1500)); await A.close();
await B.done();

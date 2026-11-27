// First-person screenshots of the guns that use real models (hip and aimed), after the models have loaded.
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
await ev(`document.getElementById('warnOk').click(); const q = document.getElementById('sQual'); q.value = 'high'; q.dispatchEvent(new Event('input'));`);
for (let i = 0; i < 40 && !(await ev(`const M = await import('./js/models.js'); return ['service_pistol', 'bolt_action_rifle_7_62', 'ge_m4a1', 'ge_ak47', 'ge_shotgun', 'ge_sniper', 'ge_makarov', 'ge_luger', 'ge_grease', 'ge_suomi'].every((k) => M.ready.has(k));`)); i++) await sleep(500);
await ev(`__s.hostMatch(__s.newMatchCfg({ mode: 'tdm', map: 'hadra', bots: 2, pub: false }), true)`); await sleep(3000);
await ev(`for (const e of __s.G.ents.values()) if (e.bot) e.frozen = true;`);
const SIDE = ['p38', 'makarov', 'luger'];
for (const [gun, att] of (process.env.GUNS ? process.env.GUNS.split(' ').map((g) => [g, []]) : [['p38', []], ['r700', []], ['m4', []], ['m4', ['optic_holo', 'grip_vert']], ['ak47', []], ['r870', []], ['m700', []], ['makarov', []], ['luger', []], ['m3', []], ['suomi', []]])) {
  await ev(`const me = __s.G.me; me.money = 50000; __s.buy(me, '${gun}'); ${att.map((a) => `__s.buy(me, '${a}', '${gun}');`).join(' ')} if (!me.alive) __s.deploy(); else __s.WP.equip(me, '${SIDE.includes(gun) ? 'sidearm' : 'primary'}', true); __s.tp(-21, 1.5, -Math.PI / 2, -0.02);`);
  await ev('for (let k = 0; k < 40; k++) __s.step(0.05, false);'); await sleep(1500);
  const info = await ev(`return JSON.stringify({ model: !!__s.VM.info?.model, gun: __s.G.me.ws.id })`); console.log(gun, att.join(','), info);
  check(JSON.parse(info).model, gun + ' uses the real model');
  await shot(`${gun}${att.length ? '-' + att[0] : ''}-hip`);
  await ev(`__s.input.rmb = true; for (let k = 0; k < 30; k++) __s.step(0.05, false);`); await sleep(1500); await shot(`${gun}${att.length ? '-' + att[0] : ''}-ads`); await ev(`__s.input.rmb = false`); await sleep(600);
}
// melee
await ev(`const me = __s.G.me; __s.buy(me, 'machete'); __s.WP.equip(me, 'melee', true);`); await sleep(1500); await shot('machete');
srv.kill(); await done();

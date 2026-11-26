// Boots the published site and starts an offline match: checks the live copy works (CDN, paths, Pages).
import { open, sleep } from './harness.mjs';
process.env.SH_URL = process.env.SH_URL || 'https://merchantsteam29.github.io/cold-bore/';
const { ev, check, shot, done } = await open(import.meta.url);
await sleep(9000);
await ev(`document.getElementById('warnOk').click(); __s.hostMatch(__s.newMatchCfg({ mode: 'tdm', map: 'kessel', bots: 6, pub: false }), true)`); await sleep(4000);
await ev(`__s.deploy()`); await sleep(2500);
const r = await ev(`return { state: __s.state, alive: __s.G.me.alive, ents: __s.G.ents.size }`);
console.log(JSON.stringify(r)); check(r.state === 'play' && r.alive && r.ents === 6, 'live site plays');
await shot('live'); await done();

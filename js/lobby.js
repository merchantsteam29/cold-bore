// The public match list, over the free public MQTT relays (relay.js, from Trigger Happy). Hosts of public
// matches publish a small retained listing every 12 s; a last-will clears it if the tab dies. Quick Play reads
// the list for a moment and joins the busiest match with room, or hosts a new one (filled with bots) if there's none.
// Listings are public data: everything read back is validated and only ever shown as text.
import { Relay } from './relay.js';

const PREFIX = 'coldbore/v1/matches/';
const REFRESH_MS = 12000, SEEN_MS = 36000, RETAINED_MAX_AGE = 50000, DEAD_MS = 180000;
const CODE_RE = /^[A-Z0-9]{4}$/;
const str = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, n);
const int = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));

function clean(code, raw) {
  if (!CODE_RE.test(code) || !raw || typeof raw !== 'object' || raw.v !== 1) return null;
  return { code, name: str(raw.name, 32) || 'Match', mode: str(raw.mode, 4), map: str(raw.map, 12), players: int(raw.players, 0, 12), bots: int(raw.bots, 0, 12), max: int(raw.max, 2, 12), ver: int(raw.ver, 0, 9999), ts: Number(raw.ts) || 0 };
}

export class Browser {
  constructor() { this.list = new Map(); this.dead = new Map(); this.relay = null; this.onChange = () => {}; }
  get status() { return this.relay ? this.relay.status : 'idle'; }
  async start() {
    if (this.relay) return this.relay.start();
    this.relay = new Relay();
    this.relay.onStatus = () => this.onChange();
    this.relay.onMessage((topic, payload, packet) => {
      if (!topic.startsWith(PREFIX)) return;
      const code = topic.slice(PREFIX.length), text = payload ? payload.toString() : '';
      if (!text) { this.list.delete(code); this.onChange(); return; }
      let raw; try { raw = JSON.parse(text); } catch { return; }
      const s = clean(code, raw); if (!s) return;
      if (packet && packet.retain && Math.abs(Date.now() - s.ts) > RETAINED_MAX_AGE) return;
      if (Date.now() - (this.dead.get(code) || 0) < DEAD_MS) return;
      s.seen = Date.now(); this.list.set(code, s); this.onChange();
    });
    this.relay.subscribe(PREFIX + '+');
    return this.relay.start();
  }
  markDead(code) { this.dead.set(code, Date.now()); this.list.delete(code); this.onChange(); }
  matches(ver) { const t = Date.now(); return [...this.list.values()].filter((s) => t - s.seen < SEEN_MS && (!ver || s.ver === ver)).sort((a, b) => b.players - a.players); }
  stop() { this.relay?.end(); this.relay = null; }
}

export class Announcer {
  constructor() { this.relay = null; this.code = null; }
  async start(code, info) {
    this.stop(); this.code = code; this.info = info;
    const topic = PREFIX + code, relay = new Relay({ will: { topic, payload: '', retain: true, qos: 0 } });
    this.relay = relay; relay.onConnect = () => this.publish();
    const ok = await relay.start(); if (this.relay !== relay) return false;
    this.timer = setInterval(() => this.publish(), REFRESH_MS);
    return ok;
  }
  publish() { if (this.relay && this.code) this.relay.publish(PREFIX + this.code, JSON.stringify({ v: 1, ...this.info(), ts: Date.now() }), { retain: true }); }
  stop() { clearInterval(this.timer); if (this.relay) this.relay.end(this.code ? PREFIX + this.code : null, '', true); this.relay = null; this.code = null; }
}

// Turns the Prepared SFX Library's 96 kHz / 24-bit stereo takes into small game files: mono, 48 kHz, 16-bit,
// cut from just before the shot to the end of its echo, faded out and normalised.
// usage: node convert-sfx.mjs <library dir> <out dir>
import fs from 'fs'; import path from 'path';
const [src, out] = process.argv.slice(2);
// game key -> [file, seconds to keep, gain, near|far]
const MAP = {
  pistol: [['Walther PPQ/X_39P.wav', 1.4]], pistol_far: [['Walther PPQ/X_31P.wav', 1.8]],
  pistol45: [['1911/A_42P.wav', 1.5]], pistol45_far: [['1911/A_34P.wav', 1.1]],
  magnum: [['Smith & Wesson 642/V_27P.wav', 1.6]], magnum_far: [['Smith & Wesson 642/V_22P.wav', 2.0]],
  smg: [['Carl Gustav M45/G_31P.wav', 1.2]], smg_far: [['Carl Gustav M45/G_20P.wav', 1.7]],
  rifle: [['AR-15/D_32P.wav', 1.6]], rifle_far: [['AR-15/D_24P.wav', 2.2]],
  ak: [['AK-47/C_28P.wav', 1.6], ['SKS/U_14P.wav', 1.6]], ak_far: [['SKS/U_19P.wav', 2.2]],
  battle: [['Tikka/W_29P.wav', 1.9]], battle_far: [['Tikka/W_24P.wav', 2.4]],
  sniper: [['1917/B_24P.wav', 2.2], ['Mosin Nagant/M_21P.wav', 2.2]], sniper_far: [['1917/B_16P.wav', 2.6], ['Mosin Nagant/M_26P.wav', 2.6]],
  shotgun: [['CD/H_21P.wav', 1.8], ['Nova/O_21P.wav', 1.8], ['Model 12/K_22P.wav', 1.8]], shotgun_far: [['CD/H_16P.wav', 2.3], ['Nova/O_17P.wav', 2.3]],
};
function readWav(file) {
  const b = fs.readFileSync(file); let o = 12, f = {}, data = null;
  while (o < b.length - 8) { const id = b.toString('ascii', o, o + 4), sz = b.readUInt32LE(o + 4); if (id === 'fmt ') f = { ch: b.readUInt16LE(o + 10), rate: b.readUInt32LE(o + 12), bits: b.readUInt16LE(o + 22) }; if (id === 'data') data = b.subarray(o + 8, o + 8 + sz); o += 8 + sz + (sz & 1); }
  const bps = f.bits / 8, frames = Math.floor(data.length / (bps * f.ch)), mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) { let s = 0; for (let c = 0; c < f.ch; c++) { const p = (i * f.ch + c) * bps; s += f.bits === 24 ? data.readIntLE(p, 3) / 8388608 : f.bits === 16 ? data.readInt16LE(p) / 32768 : data.readInt32LE(p) / 2147483648; } mono[i] = s / f.ch; }
  return { rate: f.rate, x: mono };
}
function writeWav(file, x, rate) {
  const b = Buffer.alloc(44 + x.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(file, b);
}
fs.mkdirSync(out, { recursive: true });
const list = {}; let total = 0;
for (const [key, takes] of Object.entries(MAP)) {
  list[key] = [];
  takes.forEach(([rel, keep], n) => {
    let { rate, x } = readWav(path.join(src, rel));
    // 96 kHz -> 48 kHz: average pairs (a gentle low-pass) and take every other sample
    if (rate === 96000) { const y = new Float32Array(x.length >> 1); for (let i = 0; i < y.length; i++) y[i] = (x[2 * i] + x[2 * i + 1]) / 2; x = y; rate = 48000; }
    let peak = 0; for (const v of x) peak = Math.max(peak, Math.abs(v));
    let on = 0; while (on < x.length && Math.abs(x[on]) < peak * 0.25) on++;
    const start = Math.max(0, on - Math.round(rate * 0.004)), len = Math.min(x.length - start, Math.round(rate * keep));
    const y = x.slice(start, start + len), g = 0.92 / peak;
    for (let i = 0; i < y.length; i++) { const t = i / y.length, fade = t < 0.55 ? 1 : Math.pow(1 - (t - 0.55) / 0.45, 2); y[i] *= g * fade * Math.min(1, i / (rate * 0.0015)); }
    const name = `${key}${takes.length > 1 ? '_' + (n + 1) : ''}.wav`;
    writeWav(path.join(out, name), y, rate); list[key].push(name); total += 44 + y.length * 2;
    console.log(name.padEnd(18), rel.padEnd(32), (y.length / rate).toFixed(2) + ' s', 'onset ' + (on / rate).toFixed(2) + ' s');
  });
}
fs.writeFileSync(path.join(out, 'sounds.json'), JSON.stringify(list, null, 2) + '\n');
console.log('total', (total / 1048576).toFixed(2), 'MB');

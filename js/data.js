// Every gun, attachment, melee weapon, utility and cosmetic in COLD BORE, with its price.
// Prices are approximate US retail (new, before tax) as of 2025-26. Where a gun can't be bought
// by civilians in its military form (an M249, a select-fire M4) the price is the nearest civilian
// version (FN M249S, Colt 6920) or the published unit cost. NFA items (suppressors) include the
// $200 federal tax stamp. Grenades and claymores use the DoD unit cost.
//
// Ballistics are simplified but grounded: muzzle velocity in m/s, damage scales with energy,
// `pen` is the armour it defeats (see ARMOR), and damage falls off as the round slows down.

export const CAL = {
  '9x18':     { name: '9×18mm Makarov', dmg: 30, vel: 315, pen: 2, drop: 1.1, mist: 0.55 },
  '9mm':      { name: '9×19mm Parabellum', dmg: 34, vel: 370, pen: 2, drop: 1, mist: 0.6 },
  '.45':      { name: '.45 ACP', dmg: 42, vel: 260, pen: 2, drop: 1.5, mist: 0.7 },
  '5.7':      { name: '5.7×28mm', dmg: 28, vel: 715, pen: 3.2, drop: 0.7, mist: 0.5 },
  '.50AE':    { name: '.50 Action Express', dmg: 72, vel: 450, pen: 3, drop: 1.2, mist: 1.2 },
  '.500':     { name: '.500 S&W Magnum', dmg: 88, vel: 600, pen: 3.4, drop: 1.1, mist: 1.5 },
  '5.56':     { name: '5.56×45mm NATO', dmg: 40, vel: 940, pen: 4.2, drop: 0.5, mist: 1 },
  '5.45':     { name: '5.45×39mm', dmg: 38, vel: 880, pen: 4.1, drop: 0.55, mist: 1 },
  '7.62x39':  { name: '7.62×39mm', dmg: 47, vel: 715, pen: 4, drop: 0.8, mist: 1.2 },
  '7.62x51':  { name: '7.62×51mm NATO', dmg: 60, vel: 840, pen: 5, drop: 0.55, mist: 1.6 },
  '7.62x54R': { name: '7.62×54mmR', dmg: 62, vel: 865, pen: 5, drop: 0.55, mist: 1.6 },
  '6.8x51':   { name: '6.8×51mm (.277 Fury)', dmg: 64, vel: 914, pen: 6, drop: 0.45, mist: 1.7 },
  '.338':     { name: '.338 Lapua Magnum', dmg: 110, vel: 900, pen: 7, drop: 0.35, mist: 2.4 },
  '.50BMG':   { name: '.50 BMG', dmg: 190, vel: 890, pen: 9, drop: 0.3, mist: 3.5 },
  '12ga':     { name: '12 gauge 00 buckshot', dmg: 17, vel: 400, pen: 1.5, drop: 1.5, mist: 0.8, pellets: 9, spread: 0.035 },
};

// slot: primary | sidearm. type drives the model (viewmodel.js), action the handling.
// rpm = rounds per minute, mag = rounds per magazine, kg = loaded weight, recoil = kick per shot.
export const GUNS = {
  // ---------- sidearms ----------
  glock17: { name: 'Glock 17 Gen5', slot: 'sidearm', cls: 'Pistol', price: 550, cal: '9mm', mag: 17, rpm: 420, modes: ['semi'], kg: 0.9, recoil: 0.9, reload: [1.6, 2.0], model: 'pistol', issued: true, att: ['optic_rmr', 'muz_9', 'las_pistol', 'mag_glock33'], desc: 'The issued sidearm. Light, reliable, 17 rounds.' },
  p38:     { name: 'Walther P1 (P38)', slot: 'sidearm', cls: 'Pistol', price: 650, cal: '9mm', mag: 8, rpm: 380, modes: ['semi'], kg: 0.8, recoil: 0.85, reload: [1.7, 2.1], model: 'p38', att: [], desc: 'German service pistol, 1938 to 2004. Double action, 8 rounds, a classic.' },
  makarov: { name: 'Makarov PM', slot: 'sidearm', cls: 'Pistol', price: 450, cal: '9x18', mag: 8, rpm: 400, modes: ['semi'], kg: 0.73, recoil: 0.8, reload: [1.6, 2.0], model: 'gemakarov', att: [], desc: 'The Soviet service pistol. Small, simple, 9×18mm. Cheap Bulgarian surplus.' },
  luger:   { name: 'Luger P08', slot: 'sidearm', cls: 'Pistol', price: 2800, cal: '9mm', mag: 8, rpm: 380, modes: ['semi'], kg: 0.87, recoil: 0.75, reload: [1.8, 2.2], model: 'geluger', att: [], desc: 'The toggle-lock classic from 1908. A collector piece at collector prices.' },
  m17:     { name: 'SIG Sauer M17 (P320)', slot: 'sidearm', cls: 'Pistol', price: 680, cal: '9mm', mag: 17, rpm: 420, modes: ['semi'], kg: 0.95, recoil: 0.85, reload: [1.6, 2.0], model: 'pistol', tint: 0x8a7558, att: ['optic_rmr', 'muz_9', 'las_pistol'], desc: 'US Army sidearm since 2017. Slightly flatter than the Glock.' },
  m9:      { name: 'Beretta M9A4', slot: 'sidearm', cls: 'Pistol', price: 850, cal: '9mm', mag: 18, rpm: 400, modes: ['semi'], kg: 1.0, recoil: 0.8, reload: [1.7, 2.1], model: 'pistol', tint: 0x2a2c2a, long: 1.1, att: ['optic_rmr', 'muz_9', 'las_pistol'], desc: 'Open-slide classic. Heavy, soft shooting.' },
  usp45:   { name: 'H&K USP Tactical .45', slot: 'sidearm', cls: 'Pistol', price: 1150, cal: '.45', mag: 12, rpm: 360, modes: ['semi'], kg: 1.05, recoil: 1.15, reload: [1.7, 2.1], model: 'pistol', long: 1.15, att: ['muz_45', 'las_pistol'], desc: 'Big, slow .45. Threaded barrel from the factory.' },
  deagle:  { name: 'Desert Eagle Mark XIX .50 AE', slot: 'sidearm', cls: 'Pistol', price: 2050, cal: '.50AE', mag: 7, rpm: 180, modes: ['semi'], kg: 2.0, recoil: 2.6, reload: [2.0, 2.5], model: 'deagle', tint: 0x7c7f82, att: ['optic_rmr', 'las_pistol'], desc: 'Gas-operated hand cannon. Two to the chest, one to the head.' },
  sw500:   { name: 'S&W Model 500', slot: 'sidearm', cls: 'Revolver', price: 1650, cal: '.500', mag: 5, rpm: 120, modes: ['semi'], kg: 2.1, recoil: 3.2, reload: [3.2, 3.2], model: 'revolver', tint: 0xb9bcbf, att: [], desc: 'The most powerful production revolver. Five rounds, slow to reload.' },

  // ---------- submachine guns ----------
  mp5:     { name: 'H&K MP5A3 (SP5)', slot: 'primary', cls: 'SMG', price: 2900, cal: '9mm', mag: 30, rpm: 800, modes: ['auto', 'semi'], kg: 2.9, recoil: 0.55, reload: [2.3, 2.9], model: 'mp5', att: ['optic_dot', 'optic_holo', 'muz_9', 'grip_vert', 'las_light'], desc: 'Roller-delayed, accurate, soft. Close quarters king for 50 years.' },
  m3:      { name: 'M3A1 Grease Gun', slot: 'primary', cls: 'SMG', price: 24000, cal: '.45', mag: 30, rpm: 450, modes: ['auto'], kg: 4.1, recoil: 0.55, reload: [2.5, 3.1], model: 'gegrease', att: [], desc: 'WWII and Korea. Slow, steady .45 fire. A registered transferable machine gun (NFA): that is what one really costs.' },
  suomi:   { name: 'Suomi KP/-31', slot: 'primary', cls: 'SMG', price: 16000, cal: '9mm', mag: 71, rpm: 900, modes: ['auto'], kg: 7.0, recoil: 0.45, reload: [3.6, 4.4], model: 'gesuomi', att: [], desc: 'The Finnish Winter War SMG: a 71-round drum, very accurate, very heavy. Registered transferable (NFA) price.' },
  vector:  { name: 'KRISS Vector .45', slot: 'primary', cls: 'SMG', price: 1850, cal: '.45', mag: 25, rpm: 1100, modes: ['auto', 'semi'], kg: 2.9, recoil: 0.5, reload: [2.2, 2.7], model: 'vector', att: ['optic_dot', 'optic_holo', 'muz_45', 'las_light', 'mag_vector'], desc: 'Super V recoil system: very fast, very flat, eats magazines.' },
  apc9:    { name: 'B&T APC9 Pro', slot: 'primary', cls: 'SMG', price: 2450, cal: '9mm', mag: 30, rpm: 1080, modes: ['auto', 'semi'], kg: 2.6, recoil: 0.6, reload: [2.1, 2.6], model: 'apc', att: ['optic_dot', 'optic_holo', 'muz_9', 'grip_vert', 'grip_afg', 'las_light'], desc: 'Swiss SMG the US Army picked as its Sub Compact Weapon.' },
  uzi:     { name: 'IWI UZI Pro', slot: 'primary', cls: 'SMG', price: 1300, cal: '9mm', mag: 32, rpm: 600, modes: ['auto', 'semi'], kg: 2.0, recoil: 0.75, reload: [2.2, 2.7], model: 'uzi', att: ['optic_dot', 'muz_9', 'las_light'], desc: 'Cheap, compact and controllable at 600 rounds a minute.' },
  p90:     { name: 'FN P90 (PS90)', slot: 'primary', cls: 'PDW', price: 2050, cal: '5.7', mag: 50, rpm: 900, modes: ['auto', 'semi'], kg: 3.0, recoil: 0.45, reload: [2.9, 3.4], model: 'p90', att: ['optic_dot', 'optic_holo', 'muz_57', 'las_light'], desc: 'Bullpup PDW. 50 rounds of 5.7 that goes through soft armour.' },

  // ---------- assault rifles ----------
  m4:      { name: 'Colt M4 Carbine (6920)', slot: 'primary', cls: 'Rifle', price: 1150, cal: '5.56', mag: 30, rpm: 800, modes: ['auto', 'semi'], kg: 3.4, recoil: 0.85, reload: [2.4, 3.0], model: 'ar', att: ['optic_dot', 'optic_holo', 'optic_acog', 'optic_lpvo', 'muz_rifle', 'muz_brake', 'grip_vert', 'grip_afg', 'las_peq', 'las_light', 'mag_pmag40', 'mag_d60'], desc: 'The standard. Light, modular, 5.56.' },
  ak47:    { name: 'AKM (WASR-10)', slot: 'primary', cls: 'Rifle', price: 1050, cal: '7.62x39', mag: 30, rpm: 600, modes: ['auto', 'semi'], kg: 3.9, recoil: 1.15, reload: [2.7, 3.3], model: 'ak', tint: 0x6a4024, att: ['optic_dot', 'optic_holo', 'muz_rifle', 'muz_brake', 'grip_vert', 'las_light'], desc: 'Hits harder than 5.56 and kicks like it. Cheapest rifle here.' },
  ak74:    { name: 'AK-74M (SAM5)', slot: 'primary', cls: 'Rifle', price: 1600, cal: '5.45', mag: 30, rpm: 650, modes: ['auto', 'semi'], kg: 3.6, recoil: 0.7, reload: [2.7, 3.3], model: 'ak', tint: 0x1c1c1c, att: ['optic_dot', 'optic_holo', 'optic_acog', 'muz_rifle', 'grip_vert', 'grip_afg', 'las_peq', 'las_light'], desc: 'Polymer furniture and a big brake: the flattest AK.' },
  hk416:   { name: 'H&K HK416 (MR556A1)', slot: 'primary', cls: 'Rifle', price: 3450, cal: '5.56', mag: 30, rpm: 850, modes: ['auto', 'semi'], kg: 3.7, recoil: 0.7, reload: [2.4, 3.0], model: 'ar', variant: '416', tint: 0x3a3226, att: ['optic_dot', 'optic_holo', 'optic_acog', 'optic_lpvo', 'muz_rifle', 'muz_brake', 'grip_vert', 'grip_afg', 'las_peq', 'las_light', 'mag_pmag40', 'mag_d60'], desc: 'Piston-driven AR. Smoother and more accurate than the M4.' },
  scar17:  { name: 'FN SCAR 17S', slot: 'primary', cls: 'Battle rifle', price: 3800, cal: '7.62x51', mag: 20, rpm: 600, modes: ['auto', 'semi'], kg: 4.2, recoil: 1.35, reload: [2.6, 3.2], model: 'scar', tint: 0x9a8663, att: ['optic_dot', 'optic_holo', 'optic_acog', 'optic_lpvo', 'muz_rifle', 'muz_brake', 'grip_vert', 'grip_afg', 'las_peq', 'las_light'], desc: '7.62 NATO in a 3.6 kg rifle. Two torso hits on anything without plates.' },
  spear:   { name: 'SIG MCX SPEAR (XM7)', slot: 'primary', cls: 'Battle rifle', price: 8000, cal: '6.8x51', mag: 20, rpm: 750, modes: ['auto', 'semi'], kg: 4.6, recoil: 1.4, reload: [2.6, 3.2], model: 'mcx', tint: 0x8c7a5c, att: ['optic_dot', 'optic_holo', 'optic_acog', 'optic_lpvo', 'muz_rifle', 'grip_vert', 'grip_afg', 'las_peq', 'las_light'], desc: 'The Army\'s new rifle. 80,000 psi 6.8 that goes through Level III plates.' },

  // ---------- marksman / sniper ----------
  m1a:     { name: 'Springfield M1A (M14 EBR)', slot: 'primary', cls: 'Marksman', price: 2100, cal: '7.62x51', mag: 20, rpm: 500, modes: ['semi'], kg: 5.1, recoil: 1.5, reload: [2.8, 3.4], model: 'm14', tint: 0x2b2b2b, att: ['optic_acog', 'optic_lpvo', 'optic_sniper', 'muz_rifle', 'grip_bipod', 'las_peq'], desc: 'Semi-auto 7.62 with a 22-inch barrel. A designated marksman rifle.' },
  r700:    { name: 'Mosin–Nagant M91/30 PU', slot: 'primary', cls: 'Sniper', price: 900, cal: '7.62x54R', mag: 5, rpm: 40, modes: ['bolt'], kg: 4.1, recoil: 1.9, reload: [3.0, 3.6], model: 'mosin', tint: 0x3a3a30, att: ['muz_rifle', 'grip_bipod'], desc: 'The Soviet sniper rifle: a 91/30 with the 3.5× PU scope. 7.62×54R hits like a .30-06; deadly to the head at any range.' },
  m700:    { name: 'Remington 700 SPS Tactical + 3-9× scope', slot: 'primary', cls: 'Sniper', price: 1100, cal: '7.62x51', mag: 5, rpm: 45, modes: ['bolt'], kg: 4.3, recoil: 1.8, reload: [3.0, 3.6], model: 'gesniper', att: ['muz_rifle', 'grip_bipod'], desc: 'The .308 bolt action every sniper starts on, with a hunting scope. Aim to look through it.' },
  axmc:    { name: 'Accuracy International AXMC .338', slot: 'primary', cls: 'Sniper', price: 7500, cal: '.338', mag: 10, rpm: 40, modes: ['bolt'], kg: 6.8, recoil: 2.4, reload: [3.2, 3.8], model: 'bolt', variant: 'ax', tint: 0x5c5b3d, att: ['optic_lpvo', 'optic_sniper', 'muz_rifle', 'grip_bipod'], desc: '.338 Lapua Magnum. One hit to the torso kills through any plate except Level IV.' },
  m82:     { name: 'Barrett M82A1 .50 BMG', slot: 'primary', cls: 'Anti-materiel', price: 9500, cal: '.50BMG', mag: 10, rpm: 100, modes: ['semi'], kg: 14.8, recoil: 3.4, reload: [3.6, 4.2], model: 'barrett', att: ['optic_sniper', 'grip_bipod'], desc: 'Fourteen kilos. Goes through walls, armour and whoever is behind them.' },

  // ---------- shotguns ----------
  r870:    { name: 'Remington 870 Tactical', slot: 'primary', cls: 'Shotgun', price: 520, cal: '12ga', mag: 6, rpm: 70, modes: ['pump'], kg: 3.6, recoil: 2.0, reload: [0.5, 0.5], shell: true, model: 'pump', att: ['optic_dot', 'las_light'], desc: 'Pump action, six shells. Every door kicked in since 1950.' },
  m590:    { name: 'Mossberg 590A1', slot: 'primary', cls: 'Shotgun', price: 680, cal: '12ga', mag: 8, rpm: 75, modes: ['pump'], kg: 3.5, recoil: 1.9, reload: [0.48, 0.48], shell: true, model: 'pump', variant: '590', tint: 0x3e3b33, att: ['optic_dot', 'las_light'], desc: 'Mil-spec pump with an 8-round tube.' },
  m4super: { name: 'Benelli M4 (M1014)', slot: 'primary', cls: 'Shotgun', price: 2100, cal: '12ga', mag: 7, rpm: 240, modes: ['semi'], kg: 3.9, recoil: 1.8, reload: [0.45, 0.45], shell: true, model: 'benelli', att: ['optic_dot', 'optic_holo', 'las_light'], desc: 'Semi-auto Marine Corps shotgun. Seven as fast as you can pull.' },
  ks12:    { name: 'Kalashnikov USA KS-12', slot: 'primary', cls: 'Shotgun', price: 1150, cal: '12ga', mag: 10, rpm: 220, modes: ['semi'], kg: 3.8, recoil: 1.9, reload: [2.8, 3.4], model: 'ks12', att: ['optic_dot', 'optic_holo', 'las_light', 'mag_ks20'], desc: 'Saiga-style box-fed shotgun. Magazine reloads instead of shells.' },

  // ---------- machine gun ----------
  m249:    { name: 'FN M249S (SAW)', slot: 'primary', cls: 'LMG', price: 8600, cal: '5.56', mag: 100, rpm: 800, modes: ['auto'], kg: 8.4, recoil: 0.85, reload: [5.6, 6.4], model: 'm249', att: ['optic_dot', 'optic_holo', 'optic_acog', 'grip_bipod', 'las_peq'], desc: 'Belt-fed 100-round box. Heavy, slow to aim, devastating suppressing fire.' },
};

// slot: optic | muzzle | under | laser | mag. zoom = magnification when aiming.
export const ATTACH = {
  optic_rmr:    { name: 'Trijicon RMR Type 2', slot: 'optic', price: 550, zoom: 1, reticle: 'dot', desc: 'Pistol red dot. Faster sight picture.' },
  optic_dot:    { name: 'Aimpoint CompM5', slot: 'optic', price: 1050, zoom: 1, reticle: 'dot', desc: '2 MOA red dot. The Army\'s M68.' },
  optic_holo:   { name: 'EOTech EXPS3', slot: 'optic', price: 750, zoom: 1, reticle: 'holo', desc: 'Holographic ring-and-dot. Quickest on target.' },
  optic_acog:   { name: 'Trijicon ACOG TA31 4×32', slot: 'optic', price: 1450, zoom: 4, reticle: 'chevron', desc: 'Fixed 4× with a lit chevron. Mid range.' },
  optic_lpvo:   { name: 'Vortex Razor HD Gen III 1-10×', slot: 'optic', price: 2000, zoom: 6, reticle: 'lpvo', desc: 'Low-power variable, used at 6×.' },
  optic_sniper: { name: 'Nightforce ATACR 5-25×56', slot: 'optic', price: 3500, zoom: 10, reticle: 'mil', desc: 'Long-range scope, used at 10×. Hold breath to steady (Shift).' },
  muz_9:        { name: 'SilencerCo Omega 9K', slot: 'muzzle', price: 900, suppress: true, desc: 'Pistol / 9mm suppressor ($700 + $200 tax stamp). Hides you from the minimap and quiets shots.' },
  muz_45:       { name: 'SilencerCo Osprey 45', slot: 'muzzle', price: 1100, suppress: true, desc: '.45 suppressor ($900 + $200 tax stamp).' },
  muz_57:       { name: 'SilencerCo Switchback 5.7', slot: 'muzzle', price: 950, suppress: true, desc: '5.7×28 suppressor ($750 + $200 tax stamp).' },
  muz_rifle:    { name: 'SureFire SOCOM-RC2 suppressor', slot: 'muzzle', price: 1600, suppress: true, desc: 'Rifle suppressor ($1,400 + $200 tax stamp). Shots are still loud but hard to place.' },
  muz_brake:    { name: 'SureFire WarComp', slot: 'muzzle', price: 160, recoil: 0.85, desc: 'Flash hider / compensator: 15% less muzzle climb.' },
  grip_vert:    { name: 'BCM Vertical Grip Mod 3', slot: 'under', price: 45, recoil: 0.88, desc: 'Less horizontal recoil.' },
  grip_afg:     { name: 'Magpul AFG2 angled grip', slot: 'under', price: 35, ads: 0.9, recoil: 0.94, desc: 'Faster aiming, a little less kick.' },
  grip_bipod:   { name: 'Harris S-BRM bipod', slot: 'under', price: 130, bipod: true, desc: 'Almost no recoil while prone or crouched.' },
  las_peq:      { name: 'Steiner DBAL-A3 laser', slot: 'laser', price: 1150, hip: 0.6, desc: 'Visible laser: much tighter hip fire. Others can see the beam.' },
  las_light:    { name: 'SureFire M600 Scout light', slot: 'laser', price: 300, light: true, hip: 0.9, desc: '1000-lumen weapon light (T to toggle). Lights rooms, blinds close up.' },
  las_pistol:   { name: 'Crimson Trace Lightguard', slot: 'laser', price: 250, light: true, hip: 0.8, desc: 'Pistol light (T to toggle).' },
  mag_glock33:  { name: 'Glock 33-round magazine', slot: 'mag', price: 25, mag: 33, reloadMul: 1.1, desc: '33 rounds of 9mm.' },
  mag_pmag40:   { name: 'Magpul PMAG 40', slot: 'mag', price: 25, mag: 40, reloadMul: 1.05, desc: '40 rounds. Slightly slower to change.' },
  mag_d60:      { name: 'Magpul PMAG D-60 drum', slot: 'mag', price: 130, mag: 60, reloadMul: 1.35, ads: 1.15, desc: '60-round drum. Heavy and slow to reload.' },
  mag_vector:   { name: 'KRISS 30-round Glock magazine', slot: 'mag', price: 35, mag: 30, reloadMul: 1.05, desc: '30 rounds of .45.' },
  mag_ks20:     { name: 'KS-12 20-round drum', slot: 'mag', price: 110, mag: 20, reloadMul: 1.3, desc: '20 shells in a drum.' },
};

export const MELEE = {
  fists:   { name: 'Bare hands', price: 0, dmg: 18, range: 1.4, rate: 0.55, issued: true, model: 'fists', desc: 'Free. Better than nothing, barely.' },
  glockk:  { name: 'Glock FM78 field knife', price: 30, dmg: 50, range: 1.7, rate: 0.6, model: 'knife', len: 0.16, desc: 'Cheap and good. Two to the body, one from behind.' },
  kabar:   { name: 'KA-BAR USMC fighting knife', price: 95, dmg: 58, range: 1.75, rate: 0.62, model: 'knife', len: 0.18, desc: 'The Marine Corps knife since 1942.' },
  etool:   { name: 'Gerber E-Tool (folding shovel)', price: 40, dmg: 70, range: 2.0, rate: 0.95, model: 'shovel', desc: 'Slow, long reach, hits hard.' },
  hawk:    { name: 'Camp hatchet', price: 35, dmg: 72, range: 1.8, rate: 0.85, model: 'hatchet', desc: 'A hickory-handled hatchet. Short, heavy, brutal.' },
  machete: { name: 'Ontario 18" military machete', price: 40, dmg: 66, range: 2.0, rate: 0.8, model: 'machete', desc: 'Long blade, long swing.' },
};

// utilities: thrown, medical and armour. max = how many you can carry.
export const UTIL = {
  frag:  { name: 'M67 fragmentation grenade', kind: 'throw', price: 45, max: 2, fuse: 4.5, radius: 15, kill: 5, desc: '4-5 s fuse. Kills within 5 m, wounds out to 15 m. G to throw (hold to cook).' },
  flash: { name: 'M84 stun grenade', kind: 'throw', price: 45, max: 2, fuse: 1.5, desc: '170 dB, 7 million candela. Blinds and deafens anyone facing it. 4 to throw.' },
  smoke: { name: 'M18 smoke grenade', kind: 'throw', price: 40, max: 1, fuse: 1.6, desc: 'A thick cloud for ~45 s. Blocks sight, even for bots. 5 to throw.' },
  bandage: { name: 'Israeli emergency bandage', kind: 'med', price: 9, max: 4, heal: 0, stops: 1, time: 3.2, desc: 'Stops the worst bleed. H to use.' },
  cat:   { name: 'CAT tourniquet', kind: 'med', price: 30, max: 2, stops: 9, limb: true, time: 2.4, desc: 'Stops every limb bleed at once. H uses this first if a limb is bleeding.' },
  ifak:  { name: 'IFAK (individual first aid kit)', kind: 'med', price: 120, max: 1, heal: 45, stops: 9, time: 6, desc: 'Stops all bleeding and heals 45. Takes six seconds.' },
};

// armour: lvl = the highest `pen` it stops; dur = how many stopped hits before the plate cracks.
export const ARMOR = {
  none:   { name: 'No armour', price: 0, lvl: 0, kg: 0 },
  iiia:   { name: 'Level IIIA soft vest', price: 450, lvl: 3.2, dur: 6, kg: 2.0, desc: 'Stops handgun rounds (9mm, .45, .50 AE) but not rifles. Light.' },
  iii:    { name: 'Level III steel plates + carrier', price: 480, lvl: 5, dur: 4, kg: 7.5, desc: 'AR500 steel plates. Stops 5.56, 7.62×39 and 7.62×51 ball. Heavy.' },
  iv:     { name: 'Level IV ceramic plates + carrier', price: 1050, lvl: 6, dur: 2, kg: 5.4, desc: 'Ceramic SAPI plates. Stops nearly everything once or twice, then cracks.' },
};
export const HELMET = {
  none: { name: 'No helmet', price: 0, lvl: 0 },
  ach:  { name: 'ACH (Level IIIA)', price: 450, lvl: 3.2, dur: 2, desc: 'Stops handgun rounds and fragments. Rifle rounds go through.' },
  fast: { name: 'Ops-Core FAST SF (IIIA)', price: 1650, lvl: 3.4, dur: 3, desc: 'Lighter, better coverage, stops 5.7×28 too. Rifle rounds still go through.' },
};

// how much each part of the body takes, and what a hit there does
export const PARTS = {
  head: { mul: 4.0, label: 'Head' }, neck: { mul: 3.0, label: 'Neck' }, chest: { mul: 1.25, label: 'Thorax' },
  belly: { mul: 1.0, label: 'Stomach' }, armL: { mul: 0.6, label: 'Left arm', limb: true }, armR: { mul: 0.6, label: 'Right arm', limb: true },
  legL: { mul: 0.7, label: 'Left leg', limb: true }, legR: { mul: 0.7, label: 'Right leg', limb: true },
};

// match money. Kills pay well so real prices are reachable within a match.
export const ECON = { start: 1200, kill: 500, head: 250, melee: 500, assist: 150, capture: 200, hold: 10, win: 1500, lose: 500, max: 25000 };

// cosmetics, bought from the bank (every dollar you ever earned in matches). Real prices too:
// a professional Cerakote job, and a set of uniform in that pattern.
export const FINISH = {
  black:  { name: 'Factory black', price: 0, color: 0x1c1d1f },
  fde:    { name: 'Cerakote Flat Dark Earth', price: 180, color: 0x8b7353 },
  odg:    { name: 'Cerakote O.D. Green', price: 180, color: 0x4b5034 },
  tung:   { name: 'Cerakote Tungsten', price: 180, color: 0x5f6266 },
  grey:   { name: 'Cerakote Sniper Grey', price: 180, color: 0x7d8185 },
  burnt:  { name: 'Cerakote Burnt Bronze', price: 220, color: 0x7a5232 },
  white:  { name: 'Cerakote Stormtrooper White', price: 220, color: 0xd9dad6 },
  mcam:   { name: 'MultiCam hydro-dip', price: 450, color: 0x8a7a58, pattern: 'multicam' },
  tiger:  { name: 'Tiger stripe Cerakote', price: 550, color: 0x5b5a3b, pattern: 'tiger' },
};
export const UNIFORM = {
  multicam: { name: 'MultiCam (OCP)', price: 0, base: 0x8a7d5e, cols: [0x5d5a3a, 0x9c8c66, 0x4a3b28, 0xb7a988], kind: 'blob' },
  m81:      { name: 'M81 Woodland BDU', price: 90, base: 0x5c5f3c, cols: [0x2f2a1e, 0x6e5a3c, 0x23231d, 0x3d4a2c], kind: 'blob' },
  ucp:      { name: 'UCP (ACU)', price: 120, base: 0x8d9081, cols: [0x5d6156, 0xb0b1a5, 0x76786c], kind: 'pixel' },
  flecktarn:{ name: 'Flecktarn', price: 160, base: 0x6b6d4a, cols: [0x2b2a1f, 0x4f5a33, 0x7a6a45, 0x3b3424], kind: 'dots' },
  aor1:     { name: 'AOR1 (desert)', price: 250, base: 0xb9a37c, cols: [0x8c7451, 0xd3c29c, 0x6d5a40], kind: 'pixel' },
  black:    { name: 'Crye G3 black', price: 600, base: 0x202224, cols: [0x2b2d30, 0x18191b], kind: 'plain' },
  ranger:   { name: 'Ranger green', price: 300, base: 0x4c5040, cols: [0x43473a, 0x535846], kind: 'plain' },
  kryptek:  { name: 'Kryptek Highlander', price: 220, base: 0x7c7656, cols: [0x4d4632, 0x9a8f6c, 0x3a3526], kind: 'scale' },
};

export const MODES = {
  ffa: { name: 'Free-for-all', short: 'FFA', teams: false, limit: 30, time: 600, desc: 'Everyone for themselves. First to 30 kills.' },
  tdm: { name: 'Team Deathmatch', short: 'TDM', teams: true, limit: 75, time: 600, desc: 'Two teams. First to 75 kills.' },
  dom: { name: 'Domination', short: 'DOM', teams: true, limit: 200, time: 720, desc: 'Hold the three points A, B and C. Each held point scores 1 a second. First to 200.' },
};

export const TEAM = [{ name: 'BLUFOR', color: '#5aa0ff', hex: 0x3f7fd8 }, { name: 'OPFOR', color: '#ff5a4a', hex: 0xd8433f }];

export const fmt$ = (n) => '$' + Math.round(n).toLocaleString('en-US');
export const allItems = () => ({ ...GUNS, ...ATTACH, ...MELEE, ...UTIL });

# COLD BORE

A realistic multiplayer FPS for the browser. Plain HTML + ES modules + Three.js 0.160 (CDN import map), PeerJS for
matches (the host's browser is the server), the public MQTT relays for the match list. No build step.

    node serve.js        # then open http://localhost:8080

- **Modes**: Free-for-all (30 kills), Team Deathmatch (75), Domination (200, points A/B/C). 10–12 minutes.
- **Online**: Quick Play joins the busiest public match with room, or hosts one. Bots fill a match up to the chosen
  size and leave as people join. Server browser, 4-letter codes / invite links, offline vs bots.
- **Money**: every match starts at $1,200. Kill $500, headshot +$250, melee +$500, assist $150, capture $200. Guns and
  attachments are kept for the match; armour, grenades and first aid are used up. Prices are approximate US retail
  (js/data.js). Everything you earn also goes into your **bank**, which buys uniforms and gun finishes (Armory).
- **Realism**: bullet drop and travel time, penetration (walls by material and thickness, bodies), armour levels,
  helmets, hit locations, bleeding and first aid, limping / arm wounds, sway and breath holding, tactical reloads,
  bolt and pump actions, cooking grenades, flashbangs that deafen, smoke that blinds bots, sound that arrives late.
- **Gore**: wounds on the body, mist, spray, wall splatter, pools, and (above 50) heads destroyed by heavy rounds and
  (above 70) limbs taken off by explosives and .50 BMG. Slider in Settings; 0 turns all blood off.

Phones: touch controls (left stick wherever your thumb lands, right side to look), aim assist, fullscreen landscape.
Performance: guns are cached and cloned, soldiers share skinned geometry, shaders are compiled at match load (tools/shaderlog.mjs), Low has no shadows. tools/prof.mjs and tools/calls.mjs measure.

Files: `js/data.js` (guns, prices), `js/world.js` (maps, collision, rays, bot nav), `js/combat.js` (ballistics,
wounds), `js/weapons.js` (weapon state), `js/soldier.js` (bodies, ragdolls, hitboxes), `js/bots.js` (AI),
`js/main.js` (everything else). Tests: `tools/*.mjs` drive headless Chrome (`node tools/smoke.mjs`).

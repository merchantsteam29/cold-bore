# Recorded sounds

Put recordings (.ogg, .mp3 or .wav) in this folder and list them in `sounds.json`. Anything listed replaces the
synthesized sound; anything not listed keeps the synth. Several files per key are picked at random.

Keys: pistol, smg, magnum, rifle, ak, battle, sniper, fifty, shotgun, suppressed_pistol, suppressed_rifle,
mag_out, mag_in, bolt, pump, slide, shell_load, explosion, casing, casing_shotgun, dryfire,
impact_flesh, impact_stone, impact_metal, impact_wood.

A missing gun key borrows a neighbour's recording, re-pitched (battle -> rifle, sniper -> battle, fifty -> sniper,
ak -> rifle, magnum/smg -> pistol, shotgun -> battle).

Only use sounds you're allowed to redistribute: this folder is published with the game. CC0 / public domain is
simplest (no credit needed). Note each file's source and license in CREDITS.md.

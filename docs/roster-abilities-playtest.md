# Character Worlds — character-specific route pass

Historical evidence for the preceding build. Peach, Yoshi, DK, Falco and Falcon
were subsequently revised in the [terrain pass](terrain-pass-playtest.md).

Local build only. The original Melee disc is unchanged. The approved Doc, Mario,
Luigi and Bowser archives are unchanged; DK keeps its route and receives finished
moving-platform artwork. Twenty-one other courses receive authored encounter
changes. The gameplay executable and character physics are unchanged.

Peach's two bridge-underside targets invite a sustained low float, followed by a
landing on the eastern terrace. The rose gondola now serves only the lower
fountain ravine. Yoshi's western high ledge is the jump-off point for an aerial egg over
the solid hanging block; a separate underside pocket and a low moving target
ask for different throw lengths and double-jump returns.

The remaining courses keep their own topology and moving-target mix. Falcon
chains a fast low circuit into reversed aerials. Falco works between solid roofs
and original Melee bumpers; Fox has long firing lanes and opposing lifts. Marth
uses outside sword arcs around the castle, while Roy's targets invite closer
approaches on the siege ascent. Samus has firing lanes interrupted by real solid
ceilings. Mewtwo, Zelda and Sheik have distinct teleport/recovery approaches.
Kirby and Jigglypuff can shorten the route by budgeting several aerial jumps.

All proposed moves are optional approaches. No target checks which move hit it,
and no special move, hitbox, float duration or jump velocity is modified. Full
human clears are still needed to judge difficulty and route quality.

## Artwork

Thirty moving objects use complete alpha-textured props instead of rectangular
crops of background architecture. Walking rows are measured in source pixels
and aligned with the native collision joint. Gates have solid shutter silhouettes,
matching their solid collision. Original Melee bumper meshes replace the remaining
hand-drawn bumper proxies. The LCD Game & Watch stage retains its authentic ink
geometry.

Source atlases and exact built-in imagegen prompts:

- [Nature props](../assets/custom-stages/mechanisms/nature.png)
- [Technology props](../assets/custom-stages/mechanisms/technology-v2.png)
- [Castle props](../assets/custom-stages/mechanisms/castle.png)
- [Prompt set](../assets/custom-stages/mechanisms/PROMPTS.md)

Encoded RGBA8 sprites and `props.json` live with each world's existing assets.
The runtime builder uses only the standard Python library. Pillow and numpy are
used by the authoring encoder, not required on the player's PC.

## Validation

The builder now checks the entire target cycle against the illustrated play area
for every painted course. Several older high/outside encounters have been moved
back inside that area. Collision clearance is checked at native target size,
including interpolation between motion keys. Structural access checks remain
conservative geometric checks, not a Melee physics simulation.

Automated tests: 28 Python stage tests and 4 custom-stage integration tests pass.
Native Dolphin evidence, input scripts and screenshots are stored separately in
`build/custom-stage/roster-abilities/`. Probes use a private emulator profile and
memory card; temporary spawn changes are never installed into the player's disc.

Native movement references used for focused probes:
[Peach float](https://github.com/doldecomp/melee/blob/master/src/melee/ft/kinds/ftPeach/ftpeachfloat.c),
[Yoshi Egg Throw](https://github.com/doldecomp/melee/blob/master/src/melee/ft/kinds/ftYoshi/ftyoshispecialhi.c),
[egg gravity/lifetime](https://github.com/doldecomp/melee/blob/master/src/melee/it/kinds/ityoshieggthrow.c).
Parameters are read from the user's USA 1.02 fighter archives: Peach float 150
frames; Yoshi egg gravity 0.08, terminal fall speed 2.5, flight lifetime 54 frames and native item throw-speed multiplier 0.6.
The source describes how these parameters are used; automated isolated probes
check the chosen encounters in the actual game.

All 22 changed courses pass ordinary native starts with ten targets, advancing
timers, correct character/stage IDs and zero spawn damage. Across 603 moving
platform/shutter samples, native collision and visible-joint positions agree
within one frame of motion (the remote memory snapshot is not atomic).

The deterministic private controller probe clears both Peach bridge targets in
one native float, then lands on the eastern terrace with zero damage. Inputs
are supplied to the normal fighter input routine; no position, velocity, float
timer, attack, target or result is written. The private input hook is excluded
from the installed game. A build with Python site packages disabled also
produces byte-identical archives for all 26 courses.

The Yoshi probe jumps from the western high ledge, throws diagonally over the
solid block and destroys the intended eastern target (target 6), then lands on
the roof. The roof target was moved aside after the first native test showed it
intercepted the egg. The final test confirms target 6 is removed and the separate
roof target remains. Fox also breaks the intended low hangar target with native
Blaster shots. All three focused input probes finish with zero damage.

The revised Peach gondola carries its rider through its full 17-unit travel with
stable footing and zero damage. The validation disc and its Gecko configuration
are restored afterward. Source/assets were installed as 74 hash-verified files,
with prior versions backed up in `.local/manual-backups/roster-abilities-20260930-001213`.

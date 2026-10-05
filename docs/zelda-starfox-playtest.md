# Falcon return boost, Ganon, Fox, Falco, Link and Young Link

Local Character Worlds iteration, 2026-09-30. The original Melee ISO is read-only.
Only `GrTCa`, `GrTGn`, `GrTFx`, `GrTFc`, `GrTLk` and `GrTCl` change relative to the
installed boost/vine build. The other 20 archives are byte-identical. This is not
an online challenge reset or a published release.

## Courses

- **Falcon:** the existing lower right boost remains; a second textured arrow on
  the upper east overpass pushes left. Both are independently rearmed and cause
  zero damage. Direction is a signed native impulse, with ordinary control,
  friction and jumping preserved.
- **Ganon:** the sword/crushing seal stays. A textured Ocarina of Time hand drops
  onto the eastern approach in place of the invented orb. Eight redundant ledges
  were removed from the citadel painting. An undercroft ferry passes below the
  solid bastion; a separate throne lift serves the high route. The low exterior
  target requires a committed drop and return. Steep facade seams are walls,
  not invisible walkable slopes; only the three actual solid upper rims grab.
- **Fox:** two real bottomless floor cuts, a cut upper bridge, opposing lifts,
  Wolfen interceptions and an Arwing background launch. The low target is close
  enough to the port rim for shine → jump → Fire Fox. The bridge target can be
  broken during Fox Illusion. Friendly Arwings create neither damage nor floors.
- **Falco:** separated rooftops and a diagonal cargo lift, a Wolfen pass confined
  to the open space between towers, a long laser lane and outside aerial detours.
  The Wolfen does not fly through the solid eastern tower.
- **Link:** an Octorok with original textured stone shots, a falling dungeon hand,
  and a solid Beamos firing two timed laser sweeps. The original Beamos beam mesh
  and texture use additive light; its original head pieces are posed open around
  the iris. Bomb and Spin Attack target pockets complement the boomerang lanes.
- **Young Link:** the repetitive branch ladder is reduced to six soft landings,
  with a central solid trunk, two real floor gaps and long basket lifts. A rooted
  Deku Baba guards a high branch; an Octorok fires across the lower eastern route.
  The summit chest is solid. The trunk permits native wall jumps.

## Validation

36 Python stage tests, four Node custom-stage tests, signed/rearmed boost CPU
checks and 60 contact callback CPU cases pass. The standard and `python3 -S`
portable builds produce identical bytes for all 26 archives and matching course
metadata. Every archive remains under the native helper's existing 4 MiB limit.
The additional regression checks cover source texture integrity, collision-free
Arwing scenery and the floor/ceiling orientation of a left-facing laser.

Native tests use an isolated Dolphin profile and frame-exact controller inputs.
Some cases move the initial spawn in that private disc to focus on an encounter.
No test writes fighter velocity, damage, target results or a completed score.
The private input hook is never installed into the player's Dolphin.

| Native input case | Observed result |
| --- | --- |
| Ca-boost | Crosses the lower gap rightward; lands at X=176.44, 0% damage. |
| Ca-left | Crosses the upper gap leftward; lands at X=-164.64, 0% damage. |
| Gn-hand | Falling hand changes damage from 0% to 18%. |
| Gn-smash | Sword contact changes damage from 0% to 18%. |
| Gn-return | Up air breaks the low outside target; Dark Dive returns to the actual foundation rim, 0% damage. |
| Gn-ferry | Breaks the underside target from the ferry and jumps onto the eastern foundation. |
| Gn-lift | Rides the lift and reaches the throne landing at native Y=187.43. |
| Fx-shine | Shine breaks the pit target; Fire Fox returns to the left floor and breaks a second target, 0% damage. |
| Fx-illusion | Breaks the bridge target and lands across the gap, 0% damage. |
| Fx-fleet | Wolfen contact changes damage from 0% to 12%. |
| Fc-shot | A native Blaster shot breaks the moving target from the western roof, 0% damage. |
| Cl-ascent | Rides the basket and jumps onto the high branch at native Y=251.27, 0% damage. |
| Cl-wall | Enters actual WallJump state 203; the tested return hits the Deku Baba for 12%, demonstrating the guarded landing. |
| Lk-bomb | Pulls and throws a native bomb; a target breaks, 0% damage. |
| Lk-spin | Native grounded Spin Attack breaks the exterior step target, 0% damage. |
| Lk-return | Breaks the outside target with an aerial and returns alive to the lower exterior step. |
| Lk-beam | Timed beam contact changes damage from 0% to 12%; the nearby outer tip is avoidable. |

These are focused native encounter tests, not complete human ten-target clears.
Timing, shortcuts and difficulty still need the intended character-by-character
play sessions. Full route coordinates are in [the route sheet](character-worlds-routes.md).

Evidence, input programs, native samples and screenshots are saved under
`build/custom-stage/zelda-starfox/native/`; the consolidated report is
`build/custom-stage/zelda-starfox/native-validation.json`.

## Assets

The nine original game models/effects, source links, hashes and import details
are in [Zelda/Star Fox provenance](../assets/custom-stages/retail-actors/ZELDA-STARFOX.md).
Motion is authored for Melee; original enemy AI is not ported. In particular the
stones are stage contacts, not reflectable/destroyable items. Beamos uses a timed
sweep rather than tracking the player. No fighter physics or move hitboxes change.

The two edited paintings are [Fox](../assets/custom-stages/worlds/Fx/painted.png)
and [Young Link](../assets/custom-stages/worlds/Cl/painted.png). They use the
built-in image_gen tool; exact prompts are in
[ZELDA-STARFOX-PROMPTS.json](../assets/custom-stages/mechanisms/ZELDA-STARFOX-PROMPTS.json).
Ganon's painting and sword use the same built-in tool, with prompts in
[FALCON-GANON-PROMPTS.json](../assets/custom-stages/mechanisms/FALCON-GANON-PROMPTS.json).
Collision tracing is tied to the saved painting hashes. Open gaps are part of
the paintings, never pasted/stretched background masks.

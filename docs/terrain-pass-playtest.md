# Character Worlds — terrain reduction pass

Local custom ISO iteration, 30 September 2026. Five archives change: Peach,
Yoshi, Donkey Kong, Falco and Captain Falcon. The other 21 archives and the DOL
are byte-identical to the preceding build. No character physics, attack hitboxes
or target-breaking logic is changed.

## Terrain and encounter changes

| Course | Authored static surfaces, before → after | Route change |
| --- | --- | --- |
| Peach | 12 → 6 | No central fountain island or intermediate terrace ladder. A precise double jump reaches the western balcony; a float crosses the open ravine beneath the solid bridge. The eastern island and tiny low gondola are the return options. |
| Yoshi | 12 → 6 | Two soft ledges among four solid blocks/cliffs. The high western ledge needs the large double jump; the hanging block separates the aerial egg shot from the underside and low sea-return targets. |
| DK | 14 → 7 | Four soft logs remain around solid docks and a full-height stump. Climb via the western freight lift, leave the trunk for the eastern ferry, and descend outside the eastern high log. |
| Falco | 15 → 9 | Fewer exterior steps, a broken bottom bridge and a diagonal cargo shuttle between rooftops. The west facade has a mounted piston; the upper tower and outside targets require separate aerial approaches. |
| Falcon | 8 → 6 | No tiny side steps. Two painted death drops break the low circuit; the shuttle gives access to the overpasses. A textured barrier guards the first broken track edge. |

The cuts remove 27 authored surfaces. Splitting existing floors at visible holes
adds separate collision segments; those are not extra stepping platforms.
Revised artwork is traced again in source pixels and bound to its SHA-256 hash.
The low Yoshi nest and remaining DK log are registered at their actual new
painted heights, rather than the originally requested image coordinates.

The eight generic bumpers across these courses become four distinct textured
contact obstacles: a thorn pod on Yoshi's cliff, an impact barrel at DK's lift
exit, a steel piston on Falco's facade and an impact barrier on Falcon's track.
All retain native collision/contact damage. The pod/barrel stand fully on their
painted ledges. The piston is mirrored toward the climbing lane, with its plate
attached to the solid facade. Doc's approved mounted chemical hazards remain
unchanged.

Source images and exact generation/edit prompts are retained under
`assets/custom-stages/mechanisms/`. `TERRAIN-PROMPTS.json` records the prompts;
`encode_world_hazards.py` only crops existing alpha and encodes GX RGBA8.
It does not manufacture a background mask or flatten the sprite to a colored
polygon. Runtime building still requires only the Python standard library.

## Focused validation

The structural audit includes sampled ferry positions for routes that depend on
moving landings. This is a reachability screen, not a proof of timing. Peach's
animation-driven double jump is bounded by a measured native 62.59-unit rise,
not the misleading single air-jump attribute. Descending jump arcs account for
the lower destination while retaining the same maximum apex.

Native input probes use a separate Dolphin profile/card and temporary spawn
points. They supply controller inputs only; they never set fighter position,
velocity, float duration, target state or successful results during play.
These temporary spawn points and input codes are excluded from the installed
ISO/configuration.

Verified in native Melee:

- Peach rises from the 36.91-unit lower balcony to the 97.18-unit upper balcony,
  landing normally with zero damage. The measured apex is 99.50.
- Peach breaks both bridge-underside targets during one jump/float crossing,
  then lands on the eastern island at native `(154.80, 4.38)`, zero damage.
- Yoshi double-jumps from native height 77.51 to the high ledge at 156.13,
  with an apex of 163.96 and a normal zero-damage landing.
- Yoshi's aerial egg clears the solid block and breaks the eastern target;
  the fighter returns to the block roof without damage.
- DK reaches the first remaining log from the dock with a normal double jump.
- DK's ferry and Falco's diagonal shuttle carry their riders with stable ground
  state and zero damage throughout the sampled movement.
- Falcon jumps from the moving shuttle at native height 28.32 to the western
  overpass at 85.78; DK jumps from the lift landing at 125.72 onto the solid
  stump at 174.74. Both finish grounded, with zero damage.
- Walking into the new Peach ravine and Falcon track opening produces native
  death, with all ten targets still intact.
- Each of the four new textured obstacles produces native damage and knockback
  on contact (at least 10%).

Machine-readable results and screenshots are collected in
`build/custom-stage/terrain-pass/`. Full human clears and subjective difficulty
assessment are still pending; the focused probes do not claim those clears.

All five changed courses pass ordinary native starts with the correct character
and stage, ten targets, advancing timers and no spawn damage. Across 132 sampled
moving-platform positions, collision and model joints agree within one frame
of movement (remote reads are not atomic).

Automated checks: 29 Python stage tests and 4 custom-stage integration tests
pass. A standard-library-only build produces byte-identical archives for all
26 characters.

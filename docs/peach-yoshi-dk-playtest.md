# Peach, Yoshi and Donkey Kong — local playtest

This records the first trio build. The subsequent [roster ability pass](roster-abilities-playtest.md) updates Peach/Yoshi encounters and moving prop artwork.

Only `GrTPe.dat`, `GrTYs.dat` and `GrTDk.dat` change from the previous local build.
The original disc is untouched. This is a local iteration, not a public release.

Peach has three separate floating marble islands, a solid fountain and an overhead
stone bridge. The route mixes low float approaches under balconies, an outside
bridge ascent and a low target in the eastern fountain ravine. One rose gondola
provides a moving approach; two targets move on different tracks.

Yoshi has two solid craft cliffs, a thick suspended ceiling, thin soft platforms
and an open lower crossing. Egg arcs can reach beneath shelves; the double jump
helps with the ceiling detour and the outside descending target. A narrow moving
ledge allows a lower return. Two original Melee bumper models have different
sizes and placements; the red one rests on the eastern lower ledge. Three targets
move; the other seven are fixed.

DK has broken loading docks separated by a large solid tree stump. The route
climbs around its sides before reaching the upper canopy. A vertical freight lift
and a diagonal eastern ferry give different crossing choices. One original Melee
bumper guards the lift's upper exit; one target patrols above the eastern canopy.
Targets below logs and outside the eastern landing require an aerial return.

The final artwork is authored with the built-in image generation tool, then
traced in source-image pixels. Strong top lips identify collision surfaces;
background buildings and distant tree trunks remain scenery. The ceiling, stump,
cliffs and island undersides have native closed collision contours. Thin ledges
are pass-through. Moving ledges reuse the painting's actual surface textures.
No background rectangles are pasted over the holes.

Artwork and exact prompts:

- [Peach painting](../assets/custom-stages/worlds/Pe/painted.png) · [prompts](../assets/custom-stages/worlds/Pe/ARTWORK.md)
- [Yoshi painting](../assets/custom-stages/worlds/Ys/painted.png) · [prompts](../assets/custom-stages/worlds/Ys/ARTWORK.md)
- [DK painting](../assets/custom-stages/worlds/Dk/painted.png) · [prompts](../assets/custom-stages/worlds/Dk/ARTWORK.md)

Validation artifacts are in `build/custom-stage/peach-yoshi-dk/`. The structural
route check is conservative and does not simulate a complete Melee clear. A full
human clear and difficulty feedback are still needed for each course.

Automated checks: 26 stage tests pass. All three ordinary starts boot in native
Dolphin with ten targets, advancing timers and no starting damage. Moving-platform
probes retain a constant rider offset: Peach travels 121 world units, Yoshi 71.5,
and DK rises 62.16 before the bumper contact. The tests use a separate emulator
profile and memory card; temporary probe spawn positions are never installed in
the player's build. Archive comparison confirms that only the three named stages
change and the executable DOL is identical to the previous build.

All three pit probes end with native failure result 4. Both Yoshi bumpers and
the DK bumper produce native contact damage (10, or 20 after a repeated hit).
The red Yoshi bumper is tested by moving the isolated probe fighter across its
side beneath the overhead soft platform; no damage/result values are injected.
Its knockback also ends that probe run with a fall. Private disc spawn edits
are restored after the probes.

Installation: desktop TTRC source/assets copied with SHA-256 verification (28
files), with prior files backed up in
`.local/manual-backups/peach-yoshi-dk-20260929-230442`. The installed native disc
is the normal build, with original spawn positions.

Final installed-disc verification: all 26 archive hashes and the DOL match the
build manifest; course hashes match. All four adapter ports and the memory-card
path are preserved. The temporary Peach selection code is removed from disk
after launch; Peach playtest is open, waiting for Start.

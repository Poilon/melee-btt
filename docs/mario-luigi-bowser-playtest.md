# Mario, Luigi and Bowser — local playtest

Only `GrTMr.dat`, `GrTLg.dat` and `GrTKp.dat` change from the approved Mario build.
Doc and the other 22 stages and the executable DOL are unchanged.

Mario keeps its painting, platforms and target layout. The thin lower pipe
collars are solid but cannot be grabbed. Two textured Super Mario Galaxy Piranha Plant hazards
emerge and retract on different cycles, with the original pipe pixels occluding
the hidden parts. These are stage contact hazards, not attackable enemy AI.

Luigi retains the detailed mansion. Four floors and the foundation have visible
breaks matching their collision gaps. Floors, furniture and surviving wooden
boards remain pass-through; the basement opening leads to a fatal fall. A small
board provides a take-off across the entrance gap. The dumbwaiter and room-changing
targets remain, joined by textured Super Mario Galaxy Boos near the piano and
library stairs. They retain the original geometry, UVs and skin weights, with
new arm, tongue and tail animation. The body keeps the source's proportions.

Bowser has three separate basalt keeps above native damaging lava, with solid
ceilings and a central wall. The left ceiling uses a detour via the centre, and
an upper ledge links the right ceiling. A ferry, lowering chain bridge and two
rising lava bubbles create timing windows. The bubbles now use the textured
New Super Mario Bros. Wii Podoboo model with constant gravity: one vertical
flight and one shallow arc, different launch times and submerged cooldowns.
They slow on ascent and accelerate on descent, with no hold at the apex.
Their original peak heights remain unchanged; the fall continues below Y=-450
and the cooldown stays off-screen. The original Podoboo mesh now has a detailed
512 × 512 TTRC flame material (`retail-actors/fireball/TEXTURE.md`).
The previous upward/return-to-lava trajectory was compared frame for frame;
every original position is preserved. Native probes observe cooldown positions
at Y=-454.738 and -450.5, peaks still at 77 and 112, and 16/32 damage on contact.
The detailed texture uses spherical UVs; the original heat-ramp UVs would stretch
the image into vertical bands. The final material was inspected in Dolphin.
Ten new encounters include low aerials,
ceiling detours, an outside recovery and one moving target. Lava damage is 40;
lava bubble damage is 16. Falling into the lava can kill the run.

Artwork prompts and tracing:
- `assets/custom-stages/worlds/Mr/ARTWORK.md`
- `assets/custom-stages/manor/RENOVATION.md`
- `assets/custom-stages/worlds/Kp/ARTWORK.md`
- `assets/custom-stages/retail-actors/README.md` (original models, credits, conversion)

Validation outputs: `build/custom-stage/mario-luigi-bowser/`.
26 stage tests and 4 custom-stage integration tests pass. All three stages boot
in native Dolphin with ten targets and advancing timers. Private contact probes
are run with separate memory cards and temporary spawn locations. Later probes
use a transient Start press inside the private emulator's controller buffer,
without requiring Windows keyboard focus. The player's profile uses their real
controller and the ordinary spawn; no probe changes are installed.

A full human clear remains pending for the revised courses. This build is for
local iteration; no public release is published.

Final native checks (2026-09-29): Mario plant contacts produced 10 then 20 damage;
Luigi ghost contact produced 10 damage and the basement fall ended with failure
result 4. Bowser lava produced 40 damage and the edge probe ended with failure
result 4; lava bubbles produced 16 then 32 damage. The replacement textured models
were rebuilt and checked in Dolphin, including pipe occlusion and native pose
animation. Both ballistic bubbles produced 16 then 32 damage in separate contact
probes. Native position samples match the authored gravity trajectory with zero
frame offset and mean asynchronous read errors of 0.074 / 0.141 world units.
Private probe
spawn edits were restored afterwards.

Installed locally in the desktop TTRC copy with backups. All 26 installed stage
archive hashes and the DOL match the normal build manifest. Only Mario, Luigi
and Bowser differ from the previous baseline. All four controller ports remain
on device 12; the temporary Luigi selection code was removed from disk after
launch. The latest playtest opens Bowser for the fireball physics check.

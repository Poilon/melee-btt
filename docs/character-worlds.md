# Character Worlds — painted roster

Open **Custom stages → Character Worlds → Play** in TTRC Companion, then choose
any character in Melee's Target Test screen. This local pack replaces all 26
courses, including Sheik's, with ten targets each. Local pack v5 adds
individually authored mechanisms, hazards and target trajectories. There is no
shared quota of fixed, moving or teleporting targets.
For Sheik's Shadow Shrine, select Zelda and keep **A held while pressing Start
and until the course loads**. Starting normally opens Zelda's Temple of Light.

Twenty-five courses have their own painted scenes: a cutaway mansion, forest village,
orbital hangar, suburban street, cathedral, electrical workshop,
and more. The backgrounds use native HSD textures; players and targets remain
normal Melee objects. Moving surfaces, shutters and the swinging vine use complete, alpha-textured props
matched to each world; their visible walking rims meet their native collision.
The latest local pass adds [Falcon’s speed boost and DK’s grabbable vine](boost-vine-playtest.md).
See the [terrain pass](terrain-pass-playtest.md) for the preceding terrain reductions,
textured contact obstacles and focused native tests. Decorative flames in the background remain scenery; the new grates
with a visible contact ledge inflict damage. Their metal/stone faces reuse the stage painting instead of flat spikes. Bowser also has a native lava lake aligned with the painted molten surface, with 40 damage and escalating knockback per contact.

This is local free play, using a separate memory card with no online challenge
submissions or replay recording. Controller settings, music, rumble and UCF
follow the companion preferences. The authored courses use a following camera.
The public application release number is independent of this local pack version.

## Courses

| Character | Course |
| --- | --- |
| Mario | Mushroom Mile |
| Luigi | The Crooked Manor |
| Dr. Mario | Capsule Clinic |
| Bowser | Lava Keep |
| Peach | Royal Gardens |
| Yoshi | Eggshell Hills |
| Donkey Kong | Jungle Boardwalk |
| Captain Falcon | Mute City Circuit |
| Fox | Orbital Hangar |
| Falco | Corneria Rooftops |
| Ness | Onett After School |
| Ice Climbers | Summit Steps |
| Kirby | Dream Garden |
| Samus | Zebes Depths |
| Link | Forest Sanctuary |
| Young Link | Kokiri Canopy |
| Zelda | Temple of Light |
| Sheik | Shadow Shrine |
| Ganondorf | Dark Citadel |
| Pikachu | Power Plant |
| Pichu | Battery Workshop |
| Jigglypuff | Moonlight Recital |
| Mewtwo | Psychic Containment |
| Mr. Game & Watch | Fire Rescue |
| Marth | Altean Ramparts |
| Roy | Ember Bastion |

## Course size and technical approaches

The 26 courses now have individually chosen physical dimensions. Geometry,
paintings, animated collision islands and target anchor positions share the
same uniform scale. Fighter physics, hitbox dimensions and target size remain
unchanged. Small courses therefore have tighter spacing, not smaller fighters.
The authoring manifest records the scale and the target span in native units.

Captain Falcon's target span is about 965 units wide; Ness's is about 835.
Mewtwo's compact containment room spans about 289. Luigi's target route rises
about 527 units while the compact electrical workshop rises about 131. These
measurements describe the initial target envelope, not the shortest route.

Each route has two to four newly authored technical approaches: outside-wall
recoveries, targets beneath landings, high double-jump detours, or attacks from
the far side of a ledge. The builder checks the full-size target's clearance
against the resized geometry, including every animation path. Mario's closest
starting target is over 40 native units from spawn.

Twelve original USA 1.02 target archives were inspected for their collision
shapes and initial target markers, including Fox, Ness, Marth, Yoshi and Falco.
Their outside recoveries and side-entry pockets informed these placements;
their geometry was not substituted for the custom artwork. The local inspection
sheet is `build/custom-stage/retail-reference.png`; dynamic original objects
are not fully represented by that static sheet.

The original Doc, Pichu and Mewtwo archives were also inspected directly from the
USA 1.02 ISO (`build/custom-stage/retail-technical-reference.json/.png`). Their
collision outlines and initial target markers show compact routes with deep
undersides, narrow pockets and separated landings. The sheet is a static
geometry inspection, not a native playthrough or a complete animation model.

Ganondorf's **Dark Citadel** replaces the sandstone pyramid entirely. Two ruined
islands flank a void; thin moonlit balconies are pass-through floors, while the
central suspended bastion is solid. Ten encounters include a western underside,
a high throne detour, an eastern outside recovery and two timed apparitions.
The former flat portcullis is removed. The new painting, collision tracing and
[image-generation prompt](../assets/custom-stages/worlds/Gn/ARTWORK.md) are tracked together.

Game & Watch is rebuilt as **Fire Rescue**, with printed LCD building/windows,
a fire escape and an ambulance, inspired by [Nintendo's Fire](https://www.nintendo.com/en-gb/Games/Virtual-Console-Nintendo-3DS-/Game-Watch-Gallery-275616.html).
The factory and simulated console casing are gone. Native geometry draws the
scene; its black ledges are the exact physical floor edges. Two firefighter
teams carry animated trampolines while three targets follow aerial arcs.

## Stage mechanisms (local pack v5)

Courses use different mechanics, not a common set with reskinned platforms.
Falco has three bumpers and no moving floors; Jigglypuff has seven airborne
pursuits and no added lift. Mario, Ice Climbers and Marth keep all
ten targets fixed, with timing challenges on the terrain instead. Luigi has
five targets changing rooms around a multi-storey dumbwaiter. Mewtwo has six
teleporting targets, two of them visiting three positions. Marth and Roy have
hinged bridges; Link and Marth have textured rising stone gates. Ganondorf has a drifting bridge fragment beneath a suspended bastion.
Ice Climbers' three moving floes use Melee's ice collision material.

Pichu, Sheik, Samus and Zelda use disappearing ledges. The visual joint and
its collision island are disabled together by native visibility animation.
Zelda has three sequential light platforms; Sheik has two independent shadow
steps. Fire/electric grates are confined to the volcanic and electrical worlds,
with different contact schedules. A hidden grate has no active contact surface.

Link's two bridge openings are painted into the actual scene, with source-pixel
registered edges. Ganondorf has two separately authored foundation islands and
an abyss between them; Fire Rescue cuts its native LCD floor. Other foundations
remain intact pending character-by-character playtests. The rejected prototype
that stretched a background fragment over the floor has been removed globally;
there are no hidden holes beneath a visibly continuous painted floor.


Falco and Captain Falcon have octagonal bumpers. Their four contact descriptors are **byte-identical to the retail Falco
Target Test descriptors**: 10 damage, electric element, 100 growth, 150 weight-set
knockback, and angles 90/270/0/180 according to the side touched. Other stages
use contact grates (fire/electric); Fire Rescue uses zero-damage trampolines. These use normal stage damage,
hit reaction and the native per-fighter contact cooldown, including Nana.

The moving floors and visible surfaces are children of the same HSD JObj.
AObj/FObj tracks move that joint; native collision links bind the corresponding
collision island to it. Melee then updates collisions and carries riders. The
archive root is inside a runtime wrapper: collision indices include that root,
while the ten target anchors precede the mechanism joints.

Target trajectories include patrols, elliptical loops, arcs, and two- or
three-position teleports with independently authored dwell times. Counts vary
from zero to seven moving targets and zero to seven teleporting targets. These
are authored encounters, not an extra random roll. Native target items read
their animated anchor joints, so visible targets and hit detection move together.
Restarting reinitializes the tracks; no companion timer, RNG, or RAM writer
drives gameplay. Existing online challenge generation is unchanged.

`scripts/world_gameplay.py` contains every world's authored profile;
`scripts/world_challenge.py` sets dimensions and technical approaches;
`scripts/world_mechanics.py` encodes the native tracks and collision groups.
`scripts/native/world-contact.s` documents the 124-byte descriptor selector,
installed inside the existing Fox callback's 172-byte body. Its compiled words
ship in the Python builder; playing/building does not need an assembler. Texture
buffers are shared between the backdrop and moving copies, preserving the
4 MiB archive limit.

## Targets and movement

All 260 targets are now placed as individual encounters, rather than one target
above each successive platform. Some landings stay empty, some have two targets,
and others have a target underneath or beyond an edge. Fox has paired standing
laser lanes, Kirby and Jigglypuff have aerial detours, Samus has targets below
cave shelves, and the mansion uses its furniture and stairwells.

Character attacks remain optional shortcuts. `scripts/target_encounters.py`
contains the explicit support, horizontal position and vertical offset of every
target; the builder rejects obstructed or overlapping encounters instead of
silently moving them back above a platform.

`movement.json` audits the original disc's jump, gravity and air-speed attributes,
plus bone-local hitbox radii/offsets for 449 normal attacks. Jump apex estimates
and aerial hitbox sizes inform target spacing. Bone-local offsets are **not**
full animated world-space reach; projectile travel and multi-jump special tables
are not simulated. Suggested shortcuts still need hands-on balancing.

The build manifest contains every target's coordinates, suggested move and
placement intent. See [the route notes](character-worlds-routes.md).

## Collision

The finished paintings are the source of the floor coordinates. Each scene's
`collisionTracing` records source-image pixel positions, the image hash, all
floor endpoints and the solid outlines. Roof copings include their overhang and
inset side walls. Thin upper platforms have only an upward floor line: they can
be crossed from below and dropped through. Background scenery has no collision.

The artwork is rendered at z=0, on the same plane as the collision coordinates.
A custom HSD pixel-engine descriptor disables depth writes while keeping the
opaque stage pass, so the painting does not cut through fighters or drift
relative to their feet as the camera follows them. Texture filtering and the
painted edge's antialiasing can still soften its visible boundary.

Luigi's 14 native ledge sprites already share their exact coordinates with their
one-way floors. His foundation, four storeys, mantel, piano and mattress are now
also registered to the painting's pixels. The 21 original one-way surfaces remain, with a new dumbwaiter and an open
shaft cut into the foundation.

Marth has six additional exterior marble steps, three beside each tower. Their
native quads sample an existing marble ledge from the same painting; the visible
top and the one-way collision use the same coordinates. From the initial position,
three ordinary jumps reach these steps, then a double jump reaches the tower roof.

The access audit splits floors at solid walls, then checks bounded jump arcs
between their exposed segments. This catches the original Marth trap: the base
floor beneath the tower is no longer treated as a walkable connection through
that tower. This structural audit is not a full Melee movement simulation.

To inspect the foreground against the artwork, run
`python3 scripts/review_stage_collisions.py` and open
`build/custom-stage/foreground-review.html`. Solid outlines, one-way floors and
targets can be toggled independently. This is an offline authoring tool.

## Build

```sh
python3 scripts/build_character_worlds.py \
  --iso 'Super Smash Bros. Melee (USA) (En,Ja) (v1.02).iso' \
  --output 'build/custom-stage/Character Worlds.iso'
```

The original ISO is read only. `--no-preview` uses standard-library Python,
including the portable Windows runtime. Pillow is needed for previews only.
To encode changed artwork, run `python3 scripts/encode_world_art.py`; that
separate authoring step also needs NumPy. All game textures are pre-encoded in
the repository. [Artwork provenance and prompts](../assets/custom-stages/worlds/ARTWORK.md).

The builder emits 26 native archives and a patched disc. Each original stage
keeps its ID, archive filename and StageParam row; its callbacks use Fox's
three-group animation/collision format, with a patched contact-descriptor selector. Keeping the original StageParam is required for
native stage initialization. The helper checks all archive hashes and the DOL
hash before accepting a disc. All scenes stay under its 4 MiB per-archive limit.

The cache fingerprint includes geometry, target routes, movement data and encoded
textures. Relaunching from the companion rebuilds stale local copies. A running
Dolphin retains its current course until closed.

Format references: [doldecomp/melee](https://github.com/doldecomp/melee) and
[Ploaj/HSDLib](https://github.com/Ploaj/HSDLib), researched from local checkouts.

## Validation scope

Automated checks cover ten distinct clear targets per course, spawn support,
surface connectivity, target support, native drop-through flags, relocation and
point-group integrity, texture descriptors, tile checksums, and whole-disc
archive/executable hashes. These structural checks do not prove full human
completion or optimal routes. Full clears of all 26 characters are still needed
for gameplay balancing.

### Native checks for local pack version 4 (29 September 2026)

All 26 stages loaded in an isolated Windows Dolphin profile with ten targets
and an advancing timer after pixel registration and the rendering change. Marth's exterior ascent was tested
with actual directional/jump inputs: landings at y=35.489, 70.489, 105.489, then
the tower roof at y=142.563, with the fighter grounded. Player positions and
target counters were not written to RAM. Captures and read-only telemetry are
in the ignored `build/custom-stage/native-v4/` folder.

The embedded Windows Python produces the same 26 archive hashes and executable
hash as the authoring build.

Nine Python tests cover target clearance, source-pixel registration after native
f32 serialization, polygon linkage, drop-through floors, texture state and the
Marth dead-end regression. Four custom-stage integration tests also pass. Full
human clears of every revised route remain a gameplay-balancing check.

A private inspection disc also started Kirby just above the left middle platform
and Ness just above the school roof. Gravity placed both on their traced floors
(y=109.368 and y=104.580 respectively), with native grounded state and less than
0.001 world unit discrepancy. These inspection spawns are **not** in the installed
pack. Captures live in `build/custom-stage/native-surfaces-v4/`.

### Native mechanism checks for local pack version 5 (29 September 2026)

The contact probes below exercised the first v5 mechanism prototype, before the
per-world composition was diversified. They verify the underlying mechanism
implementations, not completion of the final authored courses.

Private inspection copies change spawn points only; they are never installed.
Read-only samples in `build/custom-stage/contacts-v5/` verify:

- Fox rides the service lift from y=22 to y=128 with zero damage and native grounded state.
- Marth stays on the hinged bridge as it changes angle and elevation, without damage.
- Falco receives the retail electric contact and is launched into the air by the bumper.
- Bowser receives repeated ten-percent hits on a fire grate, separated by the native cooldown.
- Peach falls through the open garden shaft past y=-105 and reaches the native failure result.

Target item positions also follow the patrol and alternate between the two
teleport endpoints. The authoring and embedded Windows Python builds produce
identical hashes for all 26 archives and the patched executable.

Eighteen Python regression tests cover static registration, route checks,
collision-island partitioning, wrapper-joint indices, target paths and track
encoding; four Node integration tests cover local launching and profile isolation.
The emitted callback passes 60 PowerPC CPU cases (all four sides, safe islands,
invalid lines/groups, stack and nonvolatile-register preservation).

The old access audit is recorded as `baseRoute`: it is not presented as a proof
of the moving course. These probes verify mechanisms, not full human clears of
all courses or competitive balance.

### Painted-pit correction and manual playtest handoff

The stretched-background prototype was removed from every painted course. Only
Link's two image-edited bridge openings and Game & Watch's native LCD gap retain
foundation cuts; Ganondorf has a separate authored island topology. The builder
rejects painted-course pit collisions without matching `paintedPits` metadata.
A regression check prevents painted courses from emitting a masking overlay.
The final correction passes 18 Python and four Node checks; Link and Dr. Mario
are boot-checked in the private native profile before the Doc playtest handoff.
Balancing now proceeds one character at a time from the player's feedback.

### Dr. Mario playtest revision: machinery chambers

Doc now combines a solid receiving dock/cabinet, a tall process column and a
partially enclosed test chamber, with narrow perches and wider catwalks between
them. The backdrop is sharply illustrated without depth-of-field blur. Three
surface-mounted chemical hazards have distinct shapes and behaviour: a mixing
trough beneath the high catwalk target, a cabinet leak across the first climb,
and a ceiling dosing press. The cabinet and column
use orange frames to distinguish their solid silhouettes from the background.
[Current design and validation](doc-playtest.md).
The former all-tray revision is superseded. Other characters remain unchanged.

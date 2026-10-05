# Character Worlds artwork

The 25 `<stage suffix>/painted.png` images were generated with Codex's built-in
imagegen tool. Luigi's separate artwork lives in `../manor/`.

The full prompts are saved in [prompts.json](prompts.json). Each request used
the corresponding authored stage blockout as an image reference; the stage
geometry was already defined before painting. Art direction and world-space
image bounds are recorded in [art-direction.json](art-direction.json).

These images are static scene textures, with native Melee characters, targets
and collisions in front. They are not screenshots or extracted Nintendo art.
Decorative lava, lights, cables and vehicles have no gameplay behavior.

`scripts/encode_world_art.py` resamples and splits each source into 1024×1024
GameCube CMPR tiles. This is a format conversion, not another image generator.
Each `scene.json` records the source digest, tile digests and exact image-to-world
coordinates. Normal portable builds read these encoded files without Pillow,
NumPy, network access or image generation.

Some scenes have `textureBounds` calibrating their painted floors and upper
ledges to the native floors. This adjusts the textured mesh coordinates, not the source
image or collision. Course previews apply the same mapping.

`movement.json` is a separate audit of movement attributes and bone-local
hitbox data from the user's original disc. It informs target design; it is
not a simulation or guarantee of animated world-space attack reach.

## Foreground registration (local pack v4)

`art-direction.json` and each encoded `scene.json` contain `collisionTracing`:
source-image dimensions/hash, [left, right, top] pixel anchors in original layout
order, and closed foreground-solid outlines. `painted_surfaces.py` maps those
pixels through the exact texture bounds; it does not regenerate or edit the
paintings. Surface tracing and encoded textures are part of the course cache
fingerprint. Changed artwork must be traced again before encoding.

Marth's `platformCopies` add exterior access steps using UV rectangles from his
existing marble ledge. The native sprite top and its collision use one shared
`surface` tuple; the source image remains unchanged. The manor has a separate
`paintedFloors` tracing for its furniture and storeys; the fourteen native carved
ledge sprites already share their collision coordinates.

Textures use an opaque HSD MOBJ and a custom PEDesc with depth writes disabled,
so they can sit on the z=0 collision plane without clipping the character.
Format reference: [HSD_SetupPEMode](https://github.com/doldecomp/melee/blob/master/src/sysdolphin/baselib/state.c).


## Fire Rescue replacement (local pack v5)

The previous `Gw/painted.png` factory illustration is retained as an authoring
archive, but is no longer rendered by the game. `scripts/character_fire.py`
draws the Fire-inspired LCD facade, escape landings, ambulance and moving
firefighter teams as native unlit geometry. The floor surfaces and their art
share exact coordinates. This replacement does not use a generated bitmap.
Reference: [Nintendo Game & Watch Gallery — Fire](https://www.nintendo.com/en-gb/Games/Virtual-Console-Nintendo-3DS-/Game-Watch-Gallery-275616.html).

## Ganondorf — Dark Citadel revision

The desert pyramid has been replaced with a dark ruined castle. Generated with the built-in image tool from an authored geometry guide; [prompt and provenance](Gn/ARTWORK.md). The eighteen walkable top edges and three solid masonry contours are traced in the encoded scene metadata.

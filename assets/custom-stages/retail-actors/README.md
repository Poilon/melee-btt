# Original textured Mario actors — local playtest assets

These replace the untextured procedural models. Geometry, UV coordinates,
textures and skin weights come from the original Nintendo game models:

- Piranha Plant, **Super Mario Galaxy**:
  https://models.spriters-resource.com/wii/supermariogalaxy/asset/351250/
- Boo, **Super Mario Galaxy**:
  https://models.spriters-resource.com/wii/supermariogalaxy/asset/283810/
- Lava Bubble / Podoboo, **New Super Mario Bros. Wii**:
  https://models.spriters-resource.com/wii/newsupermariobroswii/asset/285313/
  Ripped by **John2k4**, exported by **A.J. Nitro**, per the supplied Credits.txt.

Original models and textures: **Nintendo**. This is a local prototype; these
files have not been published as a release. Do not describe these as Melee
Piranha Plants or as original TTRC art. The Melee Boo trophy was inspected, but
the Galaxy model was chosen for its existing arm, tongue and tail skeleton.
The Galaxy extracts were submitted by **Peardian** on The Models Resource.

`scripts/import_retail_actors.py` converts the source Collada meshes, retains
triangle topology and UVs, skins the original vertices, and encodes the supplied
PNG textures as native GX RGBA8. Each model manifest records source-model and
original-texture hashes, plus every runtime asset hash. The authoring step
requires pycollada, numpy and Pillow; portable builds do not.

The idle animation is newly authored on the original skeleton: opening jaws
and leaf movement for Piranha Plant, arm/tongue/tail movement for Boo. These are
not extracted original animation clips. Thirty-two skinned poses loop over 128
native frames. Positions and collision move continuously at Melee's frame rate.
Models share immutable buffers between instances; independent native animation
trees drive their display. The original Wii Podoboo keeps its mesh and
separate dark eye material. Its body now uses a detailed 512 × 512 TTRC flame
texture; see `fireball/TEXTURE.md` for the built-in imagegen prompt and provenance.

The lava-bubble paths now use constant gravity: one vertical flight reaches
125 units after 64 frames, the second reaches 160 units after 72 frames while
travelling 32 units sideways before returning to launch height. Launches are staggered and
have different cooldowns. Native tracks contain the exact ballistic position
at every game frame. Peak height, ascent, and initial descent are unchanged.
After crossing launch height, the same gravity continues the fall to below
Y=-450, far beyond the stage's lower camera limit. The model and contact shape
stay parked there through the cooldown instead of sitting at the visible lava
surface. Resetting to the launch point is hidden; there is no pause at the apex.
This is authored projectile motion, not
a port of the source game's enemy AI or terrain-bounce behaviour.

These remain stage contact hazards, not attackable enemy AI. Cosmetic pose
children are excluded from collision anchors; later Ground joint indices are
adjusted for the complete native hierarchy.

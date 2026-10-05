# Mario — Mushroom Kingdom waterworks

Built-in image generation / edit mode. The previous Mario painting is the style
reference; the new foreground follows an authored geometry guide. The bright
sky, checker hills, mushroom cottages, distant castle, orange bricks, grass rims
and emerald pipes are retained. The original Adventure stage `GrNKr.dat` was
inspected for gameplay inspiration, without replacing this painted art style.

The final asset is `painted.png`. Native `scene-*.cmpr` textures and `scene.json`
are derived from it. Collision anchors were retraced after the final edit.

## Main prompt

Use case: precise-object-edit. Asset: finished flat side-view Mario Target Test stage painting, 2000x1000 landscape.
Image 1 is the EDIT TARGET and definitive art style reference. Keep its gorgeous bright blue sky, fluffy clouds, green and blue checker-pattern hills with eyes, tiny mushroom houses, distant Peach castle, river, warm richly textured orange brick and limestone, thick glossy emerald grass rims and green pipes. User specifically LOVES these graphics. Retain that quality and recognisable scenery; do not simplify or blur.
Image 2 is a precise FOREGROUND GEOMETRY GUIDE. Replace only the repetitive uninterrupted aqueduct/columns of image 1 with the arrangement and silhouettes of image 2. Render the new foreground with the exact same rich detailed materials as image 1. At every rectangle in the guide keep the left/right boundaries and horizontal top at the indicated pixel location. No numbers, guides, characters, targets, HUD, text.
Left area: a stepped grass-topped brick riverbank, with a narrow tall brick pillar supporting a grass-topped lintel and a short hanging brick support at its right end. Keep the open cavity under the lintel and its right-side entrance EMPTY, showing background through it. Two tiny floating wooden scaffold planks outside its left side.
Middle: three small isolated wooden pontoons at the guide positions; empty air and deep water underneath. NO bridge or floor connecting the land masses. No posts or ropes above the walking edge. Wooden struts may hang immediately underneath these thin planks, but not span gaps.
Right: one tall solid grass-topped orange-brick waterworks tower rising from bottom of frame, with three small separate wooden maintenance steps on its left. A glossy green horizontal warp pipe joins tower to vertical green pipe at right, matching the guide, forming a large bent pipe with clearly legible hard silhouette. One small wooden ledge beneath its horizontal span. A separate final grass-topped brick bank at far right, three tiny wooden steps above it.
Grass surface top must coincide with the guide top; ALL decoration hangs down below it, never raise the visual walking edge. Front-facing orthographic gameplay plane, no wide receding top surfaces or fake back shelves. Solid bricks and pipes strong contrast, outlined by natural shadows; pass-through wood planks visibly thin and free floating. Fine leaf clusters on rims, crisp mortar, individual wood grain, reflective pipe highlights. Background castle, hills and sky remain beautiful and detailed but clearly behind foreground. Visible water is far BELOW the small pontoons, at very bottom of frame. No foreground strip spanning the gaps. Exact flat left-to-right 2D collision geometry with rich painted rendering, no perspective tilt, no depth of field blur.

## Follow-up prompt

Use case: precise-object-edit. Keep this finished Mario stage image pixel-identical everywhere except ONE small wooden platform: the plank immediately underneath the large horizontal green pipe, currently around pixels x1396..1478 y476..490 in this 1944x809 image. Move this one plank DOWN by 72 pixels to y548..562, maintaining its x position, exact width and appearance. Restore the removed plank's previous location with the uninterrupted distant scenery. Keep all other platforms, tower, pipe, grass, brickwork, castle, sky and hills unchanged. Do not move the pipe or any other plank. This provides headroom for the player to stand underneath the pipe. Output same image dimensions.

The generated ledge moved less than requested; its actual final top at source
pixel y=508 is used for collision. Geometry follows the delivered artwork.
A small additional lower landing reuses this painting’s wooden plank texture
through `platformCopies`; this leaves a return route under the pipe mouth.

## Pipe plants and collar correction

The approved painting and target layout remain unchanged. Lower pipe collars
retain their solid contour but do not advertise grabbable ledges. Two native
shaded 3-D plants emerge from the upper and lower openings on independent cycles.
They use geometry in `scripts/stage_entities.py`, not generated bitmap sprites.
The pipe's original texture coordinates are drawn over the retracted portions,
so the mask has the same size, placement and pixels as the existing pipe.

# Bowser — Molten Keep

Built-in image editing. The previous castle painting supplied the art style and
background; an authored geometry diagram supplied the new foreground. The final
image is `painted.png`, encoded as `scene-*.cmpr`. Collision coordinates are
traced on the final pixels and bound to its SHA256 in `scene.json`.

## Initial edit prompt

Use case: precise-object-edit. Image 1 is the existing Bowser castle painting and definitive ART STYLE / BACKGROUND reference. Preserve the spectacular giant Bowser sculpture, massive volcanic fortress, red Bowser banners, lava waterfalls, chains, torches and highly detailed basalt masonry with warm molten light. Image 2 is the PRECISE new foreground layout. Replace only image 1's repetitive foreground platforms and continuous bottom bridge with the exact foreground silhouettes and ledge coordinates of image 2. Render at the guide's wide 1860x1020 aspect. Dark large rectangles become fully solid stone towers/islands or overhead basalt ceiling slabs; pale thin rectangles become narrow black iron/gold-edged pass-through platforms. The three large bottom islands must be separated by real wide open chasms reaching the lava. No connecting floor, bridge, hidden wall or foreground filler across chasms. Lava level follows guide's orange horizontal line, near lower 15% of image. All platform top edges stay exactly at guide coordinates, with fine golden bevels ONLY BELOW top. No spikes or flame decoration on walkable edges, no misleading roofs behind foreground platforms; decorate undersides with rivets, stone blocks and downward brackets. Centre island has a narrow tall solid pillar with ledges on either side; left area has a high overhead slab to climb around; right raised island has an overhead ceiling and a final tiny high ledge. Keep ALL narrow ledges, with their distinct widths/positions. Very clear solid wall silhouettes against the detailed distant architecture. Orthographic side-view 2D gameplay plane, no receding top surfaces. Preserve the beautiful painted detail and light, no blur. No characters, targets, HUD, text, numbers or drawing-guide lines.

## Access correction prompt

Edit this finished Bowser stage painting very precisely. Keep EVERYTHING unchanged except these two small iron platforms. (1) Move the short iron ledge currently at pixels x219..319, top y352, to x492..592, top y338. Erase its old position by restoring distant castle background. This puts it OUTSIDE the right end of the big upper-left ceiling slab, allowing the player to climb around the slab instead of getting trapped under it. (2) Add ONE matching small iron ledge at x1220..1280, top y294, thickness about 28 pixels, using the same detailed black iron and gold-bevel style. It lies just LEFT of the big upper-right ceiling slab and makes that slab reachable around its outer corner. No spikes above the new top edges. All other ledges, solid blocks, paintings, flames, lava level, dimensions, background and texture detail must remain pixel-identical. No labels or numbers. Input dimensions 1691x930; output identical framing.

The delivered ledges differ from the requested positions. Their actual final
coordinates are used for collision. The left ceiling is reached by the central
detour; the new upper-right ledge connects the high balcony to the ceiling.

Lava bubbles use native shaded 3-D geometry from `scripts/stage_entities.py`.
The native contact surface follows the painted lava line at source y=775.

# Solid wall readability

The 24 painted worlds with solid terrain now shade the exposed edges of the
final collision contours. Kirby has no solid walls; Game & Watch already draws
its collision in black. Pass-through platforms keep their open underside.

`scripts/solid_readability.py` splits touching edges and clips all bevel shading
inside the solid polygon. Internal seams are omitted. Cool factory metal and
warm stone/wood use different tints; Doc, Mario and Ness receive a lighter pass.
The generated native mesh uses vertex alpha and does not write depth, so fighter
and target rendering remains in front. There is no collision or actor change.

Pikachu also has a detailed armored generator housing. Only the housing region
is sampled from the generated source and mapped to the exact existing solid
rectangle. The original full-stage painting is unchanged. The runtime texture
is a 512 × 1024 CMPR asset (256 KiB), compiled from the source rectangle.

Asset: `assets/custom-stages/worlds/Pk/solid-housing/painted.png`.
Generator: built-in image_gen, edit of the existing Pikachu painting.

## Validation

Local checks and captures are in `build/custom-stage/wall-readability/`.
The before/after manifests retain all 26 courses' collision contours, platforms,
targets, spawns, pits, actors and movement paths. The executable is identical.
The 52 Python stage tests and four Node custom-stage tests pass.
The standard-library-only builder matches the normal builder's DAT hashes.

## Image prompt

Use case: precise-object-edit. Edit target: attached 1555x1011 painted game stage. This is an existing detailed side-view platform game texture with exact gameplay collision coordinates. Preserve the complete camera, full image framing, all platforms and their pixel positions, the two bottom pits, background industrial art and lighting, original sharp detailed painting style. Change ONLY the central yellow generator to make its LOWER SECTION obviously a physically solid foreground block. The exact collision rectangle in the input's 1555x1011 pixel coordinate system has left x654, right x901, flat top y292, bottom y802. Build a chunky opaque steel foreground housing in this rectangle, with clear straight structural side rails, a flat horizontal metal cap precisely at y292, rich bolted steel panels, dark inset panel shadows, metal bevels with bright edge reflections, and a smaller inset reinforced amber observation window showing the existing yellow energy coil. It must read like an armored machine you cannot pass through, not like a transparent background tank. No outer protrusions beyond that exact rectangle. Keep the decorative generator upper section ABOVE y292 as recessed background machinery, with lower contrast than the solid housing. Do not extend the solid housing upwards to the large platform at y171. Preserve that existing upper platform. The housing should fit seamlessly into existing beautiful factory art; no debug lines, no simple flat color rectangles, no neon outlines, no text, no characters. Preserve all other platform edges and both pits exactly. Return the entire edited scene with the same aspect ratio, no crop.

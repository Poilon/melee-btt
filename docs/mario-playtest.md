# Mario — Mushroom Kingdom waterworks

Local character-worlds playtest, 29 September 2026. This iteration changes only
`GrTMr.dat`; Doc and the other 24 archives, plus the DOL, retain their previous
hashes. No public release was made.

The previous bright Mario art direction is retained. Adventure's first Mushroom
Kingdom course informed the masonry opening, water crossing and bent pipe.
The original aqueduct's continuous foundation is replaced with separate banks
and a tall solid tower. Wooden ledges are pass-through; brick and pipe walls are
solid. The pipe collar's contour is traced separately from its narrower shaft.

Ten targets include an alcove behind a brick pillar, a roof detour, a low aerial
under the river landing, a vertically moving river target, the tower approach,
the pipe underside, and a final outward jump. A textured ferry crosses the river
on a 330-frame cycle. A low wooden landing below the pipe's mouth allows a route
back into its underside without passing through the solid pipe.

Artwork and generation prompts: `assets/custom-stages/worlds/Mr/ARTWORK.md`.
Collision tracing is bound to the final painting SHA in `scene.json`.

Validation:
- 21 stage tests and 4 custom-stage integration tests pass.
- Static wall-clear access graph reaches all 22 landings.
- Native Dolphin boots Mario on stage 40 with ten targets and a running timer.
- Native observations confirm ferry geometry/collision movement and moving target.
- Private probe confirms a grounded Mario is carried at a constant local offset.
- Private pipe probe confirms Mario stands on the underside ledge with headroom.
- Human completion and difficulty tuning remain the purpose of this playtest.

Native snapshots and screenshots: `build/custom-stage/mario-adventure-v2/`.
Private probe spawns are never installed into the player's course.

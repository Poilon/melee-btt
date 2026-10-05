# Fox, Falco, Link and Young Link playtest

Fox now has five fixed landing surfaces: a starting dock, a small step, a tall pylon, a boarding ledge and an isolated right dock. The central space is open. The actual Corneria aircraft are scaled to 65% through the native model/collision parameter; flight, lasers and scheduling remain the original routines. Several targets are positioned above this gap. Falco keeps his terrain and aircraft size, with brighter metal wall corners and quieter background scenery.

Link's central Hylian-crest alcove contains target 8 at (0, 18), intended for a returning boomerang. The stone walls have stronger bevels, shadows and foreground contrast. Young Link's central timber pillar has clearer edges; the upper log slab now has a solid underside matching the painting, with a visible gap underneath.

Young Link's chest uses the textured original chest mesh. Its original lid triangles rotate about the back hinge. The first hit opens the chest without consuming a target. The target rises out over 24 frames and becomes breakable after a short grace period. A subsequent hit uses Melee's ordinary target counter. The chest resets on a new attempt. Other targets and stages retain their ordinary behavior.

## Validation

- Native Dolphin chest probe: first hit at frame 156 leaves 10 targets; opening completes; second hit at frame 216 leaves 9. No player, target-counter or collision-memory writes are used to simulate this result.
- 45 Python stage checks and 4 custom-stage service checks pass; the portable Python build reproduces all 26 archives. Only Fox, Falco, Link and Young Link archive hashes differ from the preceding version.
- Falco boots with 10 targets and the original aircraft subsystem spawns and moves its collision proxies.
- PPC callback execution checks the opening/reveal, grace period, native counter delegation, unrelated targets/stages and register preservation.
- Link: from the narrow left edge of the central foundation, throw left with a slight upward angle, then jump to let the returning boomerang pass. Native probe frame 218 breaks the crest target at (0, 16.56 native coordinates); the other nine remain. This validates the reverse route with normal controller input.
- Fox's initial dock-to-step jump was executed with controller input and landed on the step.
- The access audit uses observations of the actual Corneria collision proxies, not invented platform motion. It is a reachability estimate, not a full-route clear or timing proof.
- This iteration has not been cleared end-to-end by a human. Fox's aircraft timing and the full-course difficulty still need human playtesting.

## Artwork

Tool: built-in imagegen, edit mode, one existing stage image supplied per edit. Final assets and collision metadata:

- `assets/custom-stages/worlds/Fx/painted.png` and `scene.json`
- `assets/custom-stages/worlds/Fc/painted.png` and `scene.json`
- `assets/custom-stages/worlds/Lk/painted.png` and `scene.json`
- `assets/custom-stages/worlds/Cl/painted.png` and `scene.json`

Actual output silhouettes were traced after generation; prompts are direction, not collision coordinates. GameCube CMPR tiles were regenerated through the project's encoder. Exact edit prompts are recorded in `assets/custom-stages/worlds/readability-prompts.json`.

# TTRC Stage Editor

Open `/editor` on the website or at `http://localhost:4317/editor` in the running companion. The companion's Custom stages section also links to it. The interface is in English.

## Editing and playtesting

Choose one of the 26 authored worlds. Select a target, spawn, collision polygon, one-way platform or authored object from the canvas or object list. Drag it or enter exact coordinates. Solid corners are individually draggable. Space + drag pans; the wheel zooms. Snap spacing is adjustable. Undo/redo retains the last 100 project states.

Targets can be static, moving or teleporting with editable closed-loop keyframes. The timeline previews target and authored mechanism motion. Existing models, hazards, damage callbacks, chest behavior, native enemy AI and character-specific features remain attached to their original objects. Moving a chest also moves its hidden target. Explicit native animation tracks can be offset and retimed; the editor does not replace them with generic motion.

Add a moving platform textured from the current stage or an original Melee bumper. Native mechanism groups are limited to ten per stage. Topi, Polar Bear and ReDead spawn anchors can be moved, duplicated and removed. The Onett traffic lane can be translated as a whole. Their original AI runs in Dolphin. G&W's black LCD terrain is editable too.

Drafts save per character in this browser. Export `.ttrc.json` files to keep or share them; Open project imports them. Older revisions and replaced imported drafts are backed up in browser storage and can be exported. Clearing browser storage removes drafts: export files for durable backups.

On the website, Test in Dolphin opens a project-bearing URL in the local companion. Nothing is uploaded, and opening that URL never starts a program. Click Test in Dolphin again in the companion to compile and launch. The ISO must already be selected in TTRC Dolphin. This requires the updated companion with `/editor` support; older releases will not recognize the link.

Playtests use `.local/custom-stages/stage-editor`, a derived ISO and a separate Dolphin profile/card. The source ISO and challenge profile are retained. Controls are copied from the player's profile. The requested character is preselected; press Start (hold A for Sheik). On a multi-monitor PC, editor launches use the secondary display. Close that custom-stage Dolphin before rebuilding. These free-play tests do not submit challenge records.

## Current limits

Each world now separates its continuous distant background from its foreground pieces. Moving, resizing, duplicating or removing a solid or a one-way platform changes both its artwork and its collision. The library contains the existing stage pieces, such as Onett Elementary School and the Kokiri and jungle trees. Original positions are retained on reset. Foreground pieces sample the original paintings; these are textured 2D terrain pieces, while native enemies and props use exported 3D models. Widening terrain repeats its authored texture horizontally, clipping the final repeat at the polygon edge. Vertical resizing stretches the height. Complete furniture sprites retain their proportions. No replacement illustration is generated on resize.

Native mechanisms retain their original behavior when cloned from the library. Chest/target links and Corneria flight controllers remain special cases: the chest cannot be duplicated, and Arwing routes are still controlled by the original native AI. Native enemy previews show their original bind poses; the browser does not simulate their AI.

The web preview is an editing aid, not a Melee physics emulator. It does not prove a stage is completable and does not reproduce attacks, collision responses or native AI. Test reachability, restart behavior and routes in Dolphin. Generated geometry must be tested visually after changes.

## Implementation and validation

`scripts/export_stage_editor.py` exports allowlisted metadata and original painted PNGs into `web/editor/data`. No ISO bytes are included. `editor_model_assets.py` exports textured mechanism geometry and poses; `export_editor_actors.py` exports the original common/stage actor models for the browser. Re-export after changing the authored stages; project revisions prevent silently applying old drafts to different stage definitions.

`web/editor/model.js` validates project structure, bounds, motion, chest links and group limits. The local endpoint requires a same-origin request, a launch header and a bounded body. `scripts/stage_project.py` independently validates and applies only allowlisted edits, preserving native callbacks and original wall ledge flags. `build_character_worlds.py --editor-project FILE` rebuilds the selected stage and keeps the other 25 authored stages intact.

Tests: `node --test test/stage-editor.test.mjs test/custom-stages.test.mjs`, `python3 -m unittest discover -s test -p 'test_stage_*.py'`, `npx playwright test e2e/editor.spec.mjs`. Native playtest evidence is stored under `build/editor` locally, outside the public website.

## Validation on 2026-10-01

98 Node tests, 57 Python stage tests and 26 browser tests passed. Production `/editor` loaded all 26 stage options without JavaScript errors. A project moving Pikachu target 1 by four units and adding a textured moving platform compiled through the installed Windows companion endpoint. Only `GrTPk.dat` changed among the 26 stage hashes. The exact generated ISO booted on the secondary screen in a private keyboard test profile: Pikachu, stage 57, ten remaining targets, and advancing frame/timer counters. The test profile was restored afterward. This is a boot/playtest smoke check, not a full completion proof for user-authored routes.

## Platform tools and bottom-floor revision

Randomize redistributes **targets only**, translating their existing motion paths with them. It preserves platforms, walls, all mechanisms, boosts and the spawn. Candidates remain within the illustration, clear of solid walls and away from the spawn and other target anchors. Chest-linked targets remain fixed so neither the chest nor its behavior is altered. Undo restores all target positions and paths. This is not a completion proof.

Select a target to choose Static, Moving or Teleporting. The inspector edits loop length and frame/X/Y stops, with Add stop and Remove stop controls. Changing between Moving and Teleporting preserves the edited route. Moving uses native linear HSD tracks; Teleporting uses native constant tracks. Start and end points stay attached to the target's X/Y anchor. These controls no longer appear on platforms. Previous exported platform-motion drafts remain readable, with an explicit Restore original platform motion action.

Boost → and Boost ← add the original Falcon arrow texture and damage-free signed impulse to any unlocked world. Direction and speed (1–12) are editable, including on existing Falcon boosts. The compiler mirrors the left arrow and retains independent activation latches. Boost zones are stationary; eight boost zones and ten total mechanism groups are the native limits. A stage with a native wind descriptor cannot share that descriptor slot with boosts.

The generic bottom-floor cutouts have been withdrawn from Ice Climbers, Marth, Mewtwo, Ness, Pichu, Jigglypuff, Samus, Zelda and Roy. They removed painted scenery and exposed flat-colour rectangles. These nine worlds now retain their original painted foundations and matching collisions. This temporarily restores their broad safety floors; future holes need individually authored art and terrain. Earlier authored openings, including Pikachu and Sheik, remain intact. Regenerated editor revisions prevent cutout-era drafts from silently replacing the restored terrain.
Validation of this extension: 13 Node editor/custom-stage tests, 62 Python stage tests and 9 browser editor tests passed. Opposite independent boost impulses passed the actual PowerPC callback test. The installed companion built and launched a Mewtwo editor project with a teleporting platform and two boosts. Native collision sampling across 254 frames produced exactly the two expected platform positions: (-87.749, 18.047) and (-43.109, 49.727), matching authored stops at the stage's 0.72 scale. Production randomize/undo, left boost and editable teleport stops were checked in a browser. Standard Character Worlds was rebuilt in the installed Windows bundle as well.

The standard Mewtwo course was also booted and walked off its starting island: native result 4 (failure), ten targets still remaining. Exactly the nine intended standard stage DAT hashes changed. Private validation profile restored after the checks.

Target correction validation: nine browser tests and nine Node editor tests passed, including target-only randomization on all 26 worlds, chest links, exact terrain/mechanism preservation and saved target destinations. All 26 randomized projects passed the Python compiler application checks without changing terrain or mechanisms.


## Onett traffic correction

The Onett car import now includes the original `ALDYakuAll` attack scripts, which the native stage loader binds to car item states 2–5. Previously only the models, animation and driver callbacks were imported, leaving those states without their car hitboxes. Traffic speed is now 4–6 units/frame instead of 16–18. Native Dolphin validation recorded 30% damage to an idle Ness on three runs, including two Start + Z restarts. Each retry reset to 0% before the next hit. Evidence: `build/editor/onett-fix/native/traffic.json`. The installed Windows course has identical stage and DOL hashes to the tested build. 62 Python tests, 13 Node tests and nine editor browser tests passed. The production editor serves the restored terrain for all nine worlds.

Pichu was also booted from the installed ISO: stage 56, character 24, ten targets and advancing timer/frame counters; screenshot `build/editor/onett-fix/native/Pc.png` confirms the intact foundation. Two initial probes failed to locate RAM; the subsequent native boot/read and render check passed. Private test settings were restored afterward.

## Modular scenery pass (2026-10-01)

All 26 stages now have a piece catalog, paired collision/texture references and matching native geometry. Twenty-five continuous backgrounds were made with the built-in image-generation tool; G&W retains its native LCD printing. Assets and exact generation prompts are in `assets/custom-stages/modular/{stage}/background.png` and `prompt.txt`. `encode_modular_backgrounds.py` converts these into the game texture format. The generated backgrounds extend below and above the playfield without a foreground safety floor. Existing terrain is initially placed at its authored coordinates.

The native compiler samples the immutable original foreground texture into each current polygon. It does not conceal deleted terrain with pasted background patches. Onett traffic retains its original attacks and 4–6 unit/frame speed. The original Topi, Polar Bear and ReDead models, spawn routines and AI are retained. The editor previews their actual textured geometry, and lets the user position their native spawns (up to 16). New boosts cannot share a native descriptor with Onett, Icicle or ReDead actors.

Private validation Dolphin profiles are muted (`Volume=0`, `SlippiJukeboxVolume=0`). Player audio settings are not involved in automated testing.

Modular pass validation: 70 Python tests, 13 Node editor/custom-stage tests and 11 browser tests passed. Production library/model loading was checked for Ness, Luigi, DK, Ice Climbers, Sheik and G&W; the automated browser suite loads all 26. The installed Windows compiler rebuilt the standard disc, and G&W, Luigi, Ness and Ice Climbers passed native boot/timer/target checks. Ness received 30% car damage on three runs, including two Start + Z retries. A modified Ice Climbers project moved a platform and added a third Topi: only GrTIc.dat changed; native memory confirmed both moved platform vertices within 0.001 units, and three Topi remained after Start + Z. The private test profile was restored, with sound left muted.

The course verifier now allows stage archives up to 8 MiB (still verifies every expected SHA-256 and the DOL), as the larger modular Doc/Pikachu/Samus archives exceed the previous 4 MiB bound. A regression test accepts a correctly signed 5 MiB archive and rejects a claimed 9 MiB archive. No source ISO or player save was changed. Evidence is under `build/editor/modular`, deployment `dpl_4G2U9HwjxtjxVfiAKxve2Ed4UtHe`.

## Clickable target routes

Select a target, choose Moving or Teleporting, then use **Place stops on map**. Each click appends a destination before the return to the target's anchor. Stops are numbered on the canvas and can be dragged independently; snap, zoom and Space-drag panning remain available. **Done** or Escape exits placement without deselecting the target. **Clear stops** removes destinations while retaining the closed loop. Adding by click evenly distributes the stops over the current loop duration; dragging retains their times. Numeric frame/X/Y editing is still available, and every addition, drag or clear supports undo/redo and browser persistence. Native limits remain 65 keyframes including the two anchor frames. The generated project uses the existing target keyframe format and compiler.

Clickable-route validation: 10 editor Node tests passed, the existing 11 browser cases passed, and both added canvas-route cases passed after correcting their test selector. The tests cover Moving/Teleporting placement order, automatic frame spacing, independent stop dragging, unchanged targets/terrain, undo/redo, reload persistence, Space-panning and exiting with Escape/Done. The live deployment's JS/CSS match the local files; a production browser check verified clicked teleport destinations and saved numbered routes. Deployment: `dpl_EcEK3eWEK24ktFLrLUQUgjnjmeeh`. The four editor files were also installed in the Windows companion; no native code or ISO changes were needed for this UI extension.

## Added-object model previews

The generic “+ Moving platform” now displays its actual native textured mesh in the editor, including existing saved additions. Preview exports call the same `added_mechanism` factory and `moving_mesh` code as the native compiler. Width changes scale both axes for proportional deck sprites; the mansion's fixed-height ledge keeps its height, matching the game. Added original Fox bumpers and directional boosts also have model previews. `export_editor_additions.py` writes a separate additions catalog, so this display fix does not change stage revisions or invalidate existing drafts. The local server allowlists the added model files.

Validation: the 70 existing Python tests passed, as did a new native-versus-preview geometry/UV/texture comparison at two widths for Pikachu, Luigi and Ness (9 modular tests total). Fourteen Node tests and fourteen browser tests passed, including a new canvas-render check for added-platform display, resize, motion and reload. No Dolphin audio was played for this change.


## Object routes, scenery framing and texture repetition

Moving platforms and authored enemies such as Zapdos and Boo now have Original motion / Static / Moving / Teleporting controls. Moving and teleporting modes share the target route tools: click to add stops, drag numbered stops, retime the loop, undo/redo, and reload saved drafts. Original native AI actors such as Topi, traffic and Corneria aircraft retain their native AI. Chest/target links remain protected.

Horizontal terrain resizing repeats the original source region at its authored width. The native compiler clips convex triangle fragments at each repeat boundary and uses a shared vertical mapping; the browser clips equivalent image draws to the same polygon. This avoids widening decorative motifs when users reshape walls into ramps. The collision outline remains the user's polygon.

Background framing preserves source aspect ratios with modest margins. Luigi now has a square four-room backdrop and complete transparent piano, fireplace and bed sprites, with their original one-way collision tops. Bowser's vista renders at distant depth with perspective parallax so the castle relief stays visible rather than functioning as an oversized wall behind the fighter. The original ISO is not modified. Furniture console textures use 256-pixel widths and the manor background uses a 1024² native texture to fit Melee's stage allocation; browser source artwork remains full resolution.

Bowser's fireballs retain their ballistic position, speed and height. Their visual models rotate about their centres through a smooth half-turn around the apex, resetting while hidden below the level. Damage/collision anchors retain the existing trajectory. Both native animation and the editor apply the same rotation keys.

The DK stale-catalog error was a Windows/Linux libm rounding difference in the vine's trigonometric track. Authored-data comparison now allows an absolute 1e-9 numeric tolerance, while retaining exact structure and rejecting real course changes. Appearance-only catalog refreshes preserve compatible project revisions and browser drafts.

Artwork generated using the built-in imagegen tool. Final files: `assets/custom-stages/modular/Lg/background.png`, `assets/custom-stages/modular/Lg/furniture-atlas.png`; encoded/extracted furniture files are in the same folder. Prompt provenance is in `assets/custom-stages/modular/Lg/scenery-prompts.txt`.

Validation for this pass: 76 Python stage tests, 15 Node editor/custom-stage tests and 19 browser tests passed. All 26 installed Windows stage catalogs validate, including DK's sine-based vine. Native muted tests booted Bowser, Luigi and Pikachu with advancing timers and ten targets. RAM samples confirm continuous custom platform movement and exact two-position Zapdos teleports before and after Start+Z; native collision follows the model (one asynchronous sample crossed a frame boundary). Both Bowser fireball pivots span 0 to -pi with intermediate angles across 150 samples. These checks do not prove user-edited route reachability. The private validation profile was restored. Production deployment: `dpl_8TVnFcagfhY7eWjArc6Z7XB33btf`.

## Edited pipe occlusion and Fox bumpers

Piranha Plant occlusion now uses the current foreground collision polygons and their texture assets, including moved, duplicated and resized pipes. It no longer paints an occluding rectangle at the original pipe coordinates. The final native pass restores foreground depth over the hidden plant geometry; the editor clips plant models against the current solids. Removing a piece removes its mask.

The editor exposes separate Yellow bumper and Red bumper buttons, both backed by the original Fox Target Test meshes. An explicit `variant` survives resizing, duplication, save/reload and compilation; an inspector selector can change it. Older projects without the field retain their previous width-based appearance. Invalid variants are rejected by both validators.

Validation: 78 Python tests, 15 Node tests and 20 browser tests passed. A private copy of the actual edited Mario project, with both bumper colors added, booted muted on the secondary screen. Captures show the cloned plant hidden inside the relocated pipe and visible above its rim through its cycle; Mario and the two native bumper models render correctly. No user draft or original ISO was changed; the private test profile was restored.

## Solid side resize handles

Selected blocks now show round handles at the midpoint of each sufficiently long edge. Dragging a side moves its two endpoints together on the perpendicular dominant axis; square corner handles still reshape individual vertices. Handles remain available with the collision overlay hidden. Grid snapping, undo/redo and saved drafts retain the resized geometry and artwork. Rectangle sides stop at two units to prevent inversion.

Validation: 16 Node tests and 21 browser cases passed, including all four side drags, off-axis movement, corner editing, hidden collision overlays, undo/redo and reload.

## Continuous horizontal terrain textures

Widened blocks now extend their interior with mirrored UV strips instead of restarting the full image at every repetition. The outer 15% end caps occur once; neighboring strips sample exactly the same source coordinate at their shared boundary. Partial extensions use paired reflections, preserving horizontal texel density at arbitrary widths and keeping the original vertical mapping across sloped polygons. Unresized pieces keep their original artwork. This is a UV mapping change, with no extra texture allocation or project revision change. Both canvas drawing and compiled foreground meshes (including plant occlusion) use the same strips.

Validation: 79 Python stage tests, 16 Node tests and 21 browser tests passed. Pixel tests cover both integer and fractional zoom/offset, continuous color and opacity at joins; native geometry tests cover sloped repeated pieces and arbitrary widths. All 26 stage archives compile.

Native validation: a private Bowser course with a widened castle block booted muted on the secondary monitor with ten targets and an advancing timer. The captured wall has continuous texture across its interior reflections. The validation profile was restored; player drafts and the original ISO were not changed.

## Short target animation loops

A saved Falcon draft used a 50-frame teleport cycle. The editor accepted the input but its generic validation rejected every period below 60. Target loops now support 2–3600 whole frames in the inspector, JavaScript validator and native compiler validator. Target-specific errors identify the invalid duration, keyframes or loop endpoints. Existing keyframes and saved drafts are unchanged; native object motion retains its existing limits.

Validation: 17 Node tests, 81 Python stage tests and 22 browser cases passed. The actual saved Falcon draft validates unchanged and compiles with all 26 stage archives. Native muted testing confirmed the two teleport positions before and after Start + Z; the private keyboard mapping and profile were restored. The local companion and production site serve the updated validation.

## DK rolling cargo barrel

The cargo barrel now rotates around its visual centre by horizontal travel divided by radius, reverses on its return, and stays still during holds or teleports. Its collision anchor stays unrotated; two visual children have matching animation nodes and are counted in subsequent native collision indices. Editor previews derive the same roll from edited motion, including custom paths. Existing DK draft revisions and coordinates are preserved.

The floor-mounted cargo barrel now deals a moderate 6-damage outward/upward hit instead of the retail bumper’s 10 damage and fixed 150 knockback, and its underside no longer spikes down into the support. Other bumper profiles remain unchanged. This addresses the obvious downward-launch hazard; the reported exact teleport was not reproduced.

Validation: 83 Python tests, 17 Node tests and 23 browser tests passed; all 26 archives compile. Native muted probes on a private copy of the edited DK terrain observed 10-damage original contacts, then 6-damage new contacts without a large position discontinuity. The rolling child ranged from 0 to -7.166 radians while its collision anchor stayed at zero rotation. An edge approach probe did not contact the barrel. The private profile was restored, and no player draft was modified.


## Wolfen encounter and Fox bumper follow-up

Falco now selects Corneria's original Wolfen (native model group 10 / aircraft group 4), including its original textured geometry, animation rig, native flight paths and muzzle joints. No reconstructed ship or imported Star Fox 64 3D mesh is used. Native passes keep their horizontal shots; the Wolfen adds three original aimed laser articles in a two-second cycle, directed below, through and above the player's position. The initial 90 animation frames are a firing windup. The original banking and muzzle-flash animations remain in place.

The native laser damage callback checks Falco's hosted-stage configuration, positive damage dealt and the actual fighter victim at Item+0xCF4. It invokes Melee's death routine on a real hit. Shield contacts, reflection, missed shots, Fox and ordinary Corneria/Versus are excluded. The original callback still handles the laser's impact effect and destruction. The native constructor reads its own callback table; patching only the copied BTT table would not activate the new salvos.

Fox/Falco editor-added collision islands now relocate their archive-local joint bindings by eight, matching the imported Corneria collision islands. The contact callback maps those islands back to their authored damage descriptors. Previously this left added bumpers unbound or without the right contact damage. Added red/yellow bumper previews load their shared original mesh directly, even with an older additions catalog. The purple selection fill is omitted over real models. Size is beside the color control, and the right-side round handle resizes both model and collision, with undo and saved drafts.

The stationary DK impact barrel has an upper metal spike made from its own barrel-hoop texture. Its collision follows the spike. At the user's request, the rolling cargo barrel now hits strongly sideways: 10 damage and retail fixed 150 knockback at 25/155 degrees; top and underside retain the gentler six-damage upward hit. Native probes confirmed 10 damage on side contact. Catalog appearance refreshes keep existing DK project revisions and coordinates.

Validation: 85 Python stage tests, 17 Node tests, 24 browser tests, 480 executed PowerPC contact cases and dedicated PowerPC Wolfen guard/salvo tests passed. The browser test exercises an older Fox palette, opaque red/yellow pixels, mouse resizing, undo and reload. A muted private Dolphin probe observed both native laser states 2 and 3 and immediate death on every sampled damaging hit (first hit at frame 1030, 12 damage, death state 0). These are focused encounter tests, not a proof that every user-edited layout is beatable.


## Ice Mountain actor previews

Topi and polar bear editor meshes now follow HSD's rigid-envelope rule: a fully weighted vertex under a skeleton root uses the bone pose directly, while blended vertices retain the weighted inverse-bind transforms. Triangle strip/fan rows are copied before preview rotation, shading and world scaling, so shared corners are not transformed repeatedly. This removes detached parts and stretched triangular shards. The original textured actors face sideways in the editor with soft baked lighting; native in-game actors and their animations are unchanged. The exporter accepts `--stages Ic` for a scoped preview refresh.

Validation: regression tests cover rigid versus blended envelopes and repeated triangle-strip corners. Both actual exported models were rendered through the editor's native WebGL preview and visually inspected. Existing Ness and Sheik preview assets remain unchanged.

Final checks: 88 Python stage tests passed. A second muted native Falco probe reset the live stage with Start + Z at frame 142, then observed a fresh Wolfen pass, textured ship rendering and immediate death on a 10-damage laser hit.

## Shared terrain, rectangular bumpers, and native aircraft previews

Every character palette now includes Brick block (solid) and Wood platform (one-way). These are additional assets; existing terrain and saved project revisions stay unchanged. Horizontal resizing repeats the texture using the existing continuous UV strips. The simple wooden ledge keeps an eight-unit visual thickness. Both pieces also compile into Game & Watch's otherwise untextured stage.

Added red and yellow Fox bumpers accept independent Width and Height (4–160). Right and bottom handles resize the two axes separately. Older square drafts without height retain their original dimensions until edited. The same axis scaling applies to native vertices, the eight-sided contact outline, editor preview, hit selection and saved drafts.

Fox's Arwing and Falco's Wolfen use original Corneria model previews in the canvas and object list; selecting one opens a larger view. The displayed position is explicitly an illustrative preview, not a simulated native flight path or editable spawn. Native flight remains owned by Melee.

The earlier lethal Wolfen/spread experiment is superseded: Falco's ship is now 55% of its former size, its extra aimed salvos and callback-table replacement are removed, and the original Corneria firing parameters and shot patterns are retained. A guarded real-hit callback adds 15 percentage points through Fighter_TakeDamage; it does not call the death routine. Original knockback, shield contacts, reflections, Fox and ordinary Corneria remain unchanged.

Luigi's fireplace and bed use isolated complete sprites, with no neighboring atlas fragments. Their original aspect ratios and walkable positions are preserved. Ordinary manor platforms use a separate walnut/brass beam texture instead of sampling wallpaper and carpet beneath the painted floor.

Validation: 90 Python stage tests, 26 browser tests, 13 editor model tests and 4 custom-stage server tests passed. Executed PowerPC tests confirm +15 damage, real-victim guards and ABI preservation. All 26 archives compiled; each stage's native mesh was also built with both shared pieces. Production and installed companion asset bytes match, and live browser checks cover palettes, aircraft selection and saved rectangular dimensions. Generated artwork and prompts are recorded in assets/custom-stages/basic/PROMPTS.md.

Muted private Dolphin checks rendered the shared wooden platform and rectangular original Fox bumper correctly; native Wolfen projectiles stayed in their original state 2, with no injected aimed salvos. Stationary probes did not take a laser hit, so the damage increment was validated by executing the actual PowerPC callback under the CPU harness, not by claiming an observed playtest hit. Private profiles were restored.

### Platform artwork audit and Wolfen heading (2026-10-02)

Inspected the editor render of all 227 authored platform pieces across the 26
worlds, plus the moving-platform previews. Removed scenery contamination from
13 fascia samples in Mario, Dr. Mario, Falco, Mewtwo and Roy. The repaired source
samples repeat at their own width. Kirby, Peach and Jigglypuff now use the existing
complete transparent balcony sprites (16 pieces), with the visible walking row
aligned to the unchanged collision height. Mario's moving ferry and Luigi's
moving dumbwaiter use their clean foreground artwork, including added instances.
All 26 saved base projects and revisions remain byte-for-byte equivalent as JSON.

The hosted Wolfen's near passes previously inherited Corneria's fixed left-facing
orientation even while moving right. Two guarded native hooks now select yaw
from the actual horizontal displacement before the native matrix/collision and
muzzle updates, and pass the same direction to the native laser article. Original
meshes, flight animations, firing cadence and collision proxies remain in use;
stock Corneria and Fox are excluded. Far/background passes retain their native rig.

Validation: 92 Python stage tests, 26 editor browser tests, 17 Node editor/custom
stage tests and the PPC adapter tests passed. All 26 stage archives built. A muted
private Dolphin run on the right monitor recorded 529 moving near-flight samples
(299 rightward, 230 leftward) with matching heading and no mismatches, across
flight types 2, 4 and 6; native lasers remained active. This is not a claim that
all 26 courses were completed by playing them. Visual audit sheets and native
probe captures are in `build/editor/platform-audit` and
`build/editor/falco-wolfen/native/*heading*`.

### Lossless background textures (2026-10-03)

Custom-stage preparation installs 49 PNG texture replacements covering the 25
painted worlds (Game & Watch uses its native graphic treatment). The pack is
exported from the approved original background images; composition, collision
geometry and ISO textures are unchanged. It bypasses CMPR color/block artifacts.
It is not a claim of newly generated 4K detail: most sources remain around
1774x887; Luigi's 1254x1254 source now avoids reduction to the native 1024 texture.
The Fox image-generation experiment returned the same source dimensions and was
kept as a comparison under build/editor/hd-backgrounds, not installed as a new
background.

`export_background_textures.py` is authoring-only (Pillow and system xxhash).
`background_textures.py` uses only the standard library in portable releases.
It verifies the entire manifest before changing a profile, requires the custom
stage marker, touches only its own TTRC-Backgrounds folder, enables HiresTextures,
and disables eager preloading of all backgrounds. Existing unrelated graphics
settings and texture packs are retained. Installation runs for Character Worlds
and editor playtests whenever their isolated Dolphin profile is prepared.

Validation: 3 pack/installer tests and 4 custom-stage Node tests passed. The private
muted Fox playtest loaded the PNG replacements; screenshots before/after are
`build/editor/falco-wolfen/native/pass-fox-lower-80.png` and
`pass-fox-hd-80.png`. Tests verify XXH64 names against the actual encoded stage
textures, source coverage, dimensions, corruption handling and idempotence.
The pack and installer are installed in local TTRC and included by the existing
release asset packaging. No new GitHub release was published for this change.

## Fox detail master and original bumper animation

Fox now has a separate 4096×2048 `modular/Fx/background-hd.png` master. Eight
overlapping regions of the existing background were regenerated with finer
ship/space detail, registered and feathered together. The 1774×887 source and
native CMPR tiles remain intact. Both the editor export and Dolphin replacement
pack prefer this master. The two replacement tiles are 2048×2048; native UVs,
course geometry and all 26 editor project revisions are unchanged.

The original GrTFx bumper uses two meshes, alternating through native joint
visibility tracks every game frame. The builder now preserves both branches
and loops their original 600-frame tracks. Their child joints are included in
collision binding indices. The editor has one Fox bumper button and animates
both poses; legacy red/yellow draft fields remain accepted.

The reported right bumper started at X=160, slightly inside its supporting wall
at X=159.583. Wall contact therefore occurred before bumper contact. Generic
Fox bumpers now have a one-unit collision skin, preserving their placed model
and the retail 10-damage directional hit. This is a small placement tolerance,
not a mechanism for hitting through deeply overlapping walls.

Muted private Dolphin probes reproduced 0 damage before the fix and 10 damage
with leftward knockback afterward. Runtime joint flags confirmed alternating
red/yellow visibility on both user-placed rectangular bumpers after Start+Z.
The HD texture pack was also verified in-game. Evidence is under
`build/editor/fox-bumper` and `build/editor/fox-background-detail`, with native
captures in `build/editor/falco-wolfen/native/pass-fox-hd-detail-80.png`.
User drafts and their last playtest project were not modified.


All-level packs (2026-10-03): Export all levels saves a versioned TTRC_STAGE_PACK containing all 26 projects from this browser, using the catalog only for untouched stages. Build all in Dolphin validates every draft, builds one authored ISO and prepares a separate portable profile in .local/custom-stages/stage-editor-all/Dolphin. It leaves character selection unrestricted. Open project accepts packs, validates them before importing, and backs up replaced drafts; web-to-companion transfer does not auto-launch. The local protected endpoint is POST /api/editor/build-all. Python validates complete packs before writing archives. Verification: 96 Python tests, 20 Node tests, 28 browser tests; a complete ISO had all 26 stage hashes and its executable verified, preserving targets edited across Fox, Mario and Dr. Mario. Evidence: build/editor/all-levels/. The installed companion was restarted to load the new endpoint and current bumper validation.

## Native Warp Star

Every character's palette includes **Warp Star**, exported from Melee's original common-item archive (item kind 29). It is saved in `nativeActors`, so placement, duplication, deletion and pack export use the same path as other native actors. In Dolphin, the original item factory supplies its model, animation, pickup, ascent, steerable descent and landing. It falls onto the level's terrain; Start + Z creates a fresh item. The published Kirby level places one near the right edge of the starting platform.

`world_items.py` extends only archives containing this item with an optional descriptor after the eleven existing yakumono slots. The host occupies the retired Bowser target-stage module at `0x80221648`; Kirby's retired module remains reserved for the wind callback. `build_world_items.py` rebuilds the shipped PPC binary. The exact reviewed optional-host executable is mapped to the previous course engine identity; the real executable hash is still checked when opening the ISO, and altered stage/rules hashes still create distinct records.

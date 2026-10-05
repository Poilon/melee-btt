# Native Corneria aircraft in BTT

The earlier adaptation with authored flight keys, mirrored routes and timed laser bursts has been removed. Fox and Falco now load the original Corneria flight drivers and complete animated aircraft from the player's original USA 1.02 disc. There are no replacement aircraft models, flight curves or shot timers.

The hosting adapter initializes the original aircraft subsystem and delegates updates to `grCorneria_801DCE1C`. Native constructors, banking, depth transitions, collision visibility, projectile selection and firing decisions run in the original Melee routines. This includes the original aircraft selection and spawn delays; aircraft do not wait permanently at a boarding point.

Original model IDs 0–2 map to 19–21 because BTT owns the first three slots. Empty reference objects supply the origins expected for Great Fox and the background region; their scenery and cannon callbacks are not loaded. The eight native collision islands retain their IDs, and the authored terrain uses island 8. The original kind-234 laser article is registered beside the BTT targets.

A regression compares the entire retail Corneria machine-code range against the original ISO: the only changed instruction is the factory model-loader call into the ID adapter. Imported archive blocks retain their original bytes except relocated pointers and resolved absent external references. The host preserves the ordinary ID mapping when playing stock Corneria.

## Validation

- 40 stage tests and 4 custom-stage service tests pass.
- PPC execution checks initialization, native scheduler delegation, eight collision islands, 114 ID mappings, stock-stage handling and register preservation.
- A portable Python build without site packages reproduces all 26 archive hashes.
- In the isolated Fox BTT, native aircraft appeared, banked, fired real kind-234 lasers, and departed normally. A native laser caused 12 damage and knockback.
- Native wing contact was recorded on floor 0 at frames 1188–1198: with neutral movement input, Fox moved 7.699 units left and 4.434 down. His displacement matches the native collision vertices on every sample. Evidence: `build/custom-stage/corneria-return/native-ride-validation.json`.
- Falco's BTT also boots with its targets and terrain intact. Runtime aircraft observations are retained in the private Falco input probe.

These checks validate the native integration, not a human clear of every target route. Private probe inputs, probe spawn positions and deterministic RNG controls are absent from the playable build. The original disc is unchanged; the authored ISO is a separate output.

## Fox lower and earlier passes — 2026-10-02

Fox's hosted native aircraft dispatch after 60 frames instead of 600. Pauses
between passes are 180–300 frames instead of 960–1800. Falco keeps its existing
120–180 frame intervals. Native near-pass positions are lowered by 60 game
units immediately before the retail hierarchy and collision-proxy updates; the
offset is applied to the freshly computed position, so it cannot accumulate.
The original models, animation tracks, firing logic and collision geometry are
retained. The existing Wolfen direction fix remains isolated to Falco.

PPC tests check the vertical offset, stage guards and unchanged Wolfen heading;
the Corneria archive tests verify both stages' independent scheduler parameters.
All 26 stage archives build successfully.

Muted private Dolphin verification: aircraft active by sampled frame 101. Of 227 live near-pass samples, 224 had identical aircraft/collision-proxy XY; three differed by less than 1.5 units during non-atomic live reads, consistent with crossing a simulation frame. The collision proxy follows the lowered aircraft rather than retaining the former 60-unit-higher position. Installed in local TTRC build tooling; rebuild via Test in Dolphin.

## Fox alternating passes (2026-10-03)

Corneria's scheduler can select group 4 (Wolfen) as well as group 1 (Arwing).
The Fox host previously left that random choice intact. Its controller factory
now selects group 1 before initialization, while Falco still selects group 4.

Fox uses the original close-flight animation 4, played at 1.6× its native rate.
The complete textured model, banking animations, laser article and collision
proxy remain retail. Successive passes mirror X and select vertical offsets
of -60, 0, +60, 0 native units. Heading and both original muzzle branches follow
the resulting direction. A per-course counter resets to -1 during stage init,
so Start+Z begins again with the lower leftward pass. This state is not saved
in the player's memory card. The model and collision scale changed from .65
of retail to .48, about 26% smaller. Dispatch waits are 30 frames initially and
45–60 frames after each completed native flight.

The adapter occupies 816 bytes in the retired Link/Luigi target modules, both
unreferenced by the custom StageData callbacks. Guarded patches redirect five
calls/instructions inside Corneria; stock Corneria/Venom behavior and Falco's
flight selection/rate remain unchanged. The current-patch regression test
compares the patched executable against the original ISO, rather than testing
an old cached build.

Validation: 93 Python stage tests, 17 Node editor/custom-stage tests and the
PowerPC adapter harness passed. A muted isolated Dolphin probe recorded 1,140
samples over 3,959 frames before a real Start+Z and 1,406 afterward: all four
pass phases, only group-1 Arwings, no Wolfen GObj, scale .24 in the native rig,
yaw alternating ±pi/2, and native laser horizontal velocities of -4 and +4.
The stationary Fox remained alive. Separate visual checks with a temporary
central observation platform confirmed both leftward and rightward rendered
models (`pass-fox-hd-close-80.png` and `pass-fox-hd-close-240.png`). Temporary
observation geometry only exists in the isolated validation build.

Evidence: `build/editor/fox-shuttle/verification.json`, `cpu.log`,
`python-final.log`, and `build/editor/falco-wolfen/native/Fc-fox-hd-shuttle.json`.


Fox high/low alternation (2026-10-03): native path offsets now repeat -60, +100, -60, +100. The first flight is high, the return is 160 native units lower. A muted private Dolphin run recorded 1,140 samples: phase sequence 0,1,2,3,0,1, high Y 192.6–271.4, low Y 32.6–111.4; Start+Z restarted with phase 0 then 1. No Wolfen instance appeared. PPC execution checks and the five Corneria integration tests passed. Evidence: build/editor/fox-high-low/verification.json. Installed with backups; editor description published.

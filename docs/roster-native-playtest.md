# Character Worlds — remaining roster and chest retries

Local playtest revision, 30 September 2026. Thirteen courses change. Doc, Mario,
Luigi, Bowser, Peach, Yoshi, DK, Falcon, Ganondorf, Fox, Falco, Link and Young Link
retain byte-identical stage archives. Young Link receives an executable fix for
chest retries; the original disc and character physics are unchanged.

## Chest

Young Link's stage initialization now resets the cached CHST state and lid angle
on every entry, including **Start → Z**. Previously the archive could survive a
retry with its opened state while the new target started inside the box.

Three attempts in one native Dolphin process were exercised with real Start then
Z controller key presses between attempts. Each starts with state 0 and ten
targets; the opening strike leaves ten; the later hit on the revealed target
leaves nine. The tests issue controller inputs, not writes to completion state.
Evidence: `build/custom-stage/roster-native/chest-retry-evidence.json` and the
three `roster-abilities/inputs/Cl-retry/retry-*.json` traces.

## Courses

| Fighter | Encounter |
| --- | --- |
| Ice Climbers | Three narrow drifting floes and a summit Topi patrol; outside hammer targets on both sides of the peak. |
| Kirby | Whispy Woods blows across the lower cloud route. Alternate wind-assisted crossings and returns during the rest; jumps refill on the moving clouds. |
| Marth | Drawbridge crosses the actual west-roof gap, followed by a timed portcullis. One target hangs above the bridge; the low return uses sword reach. |
| Mewtwo | Two opposing containment shutters divide the laboratory; five targets orbit or teleport between positions. Mew crosses the containment area. |
| Ness | The original Onett car traverses the narrow street, guarding a low target. The lift leads to a separate rooftop and PK Thunder return route. |
| Pichu | Electrode rolls across the eastern battery casing and its target lane; a short intermittent ledge requires a precise landing. |
| Pikachu | Zapdos crosses over the generator crown. Climb around the central solid core, time Thunder, then angle Quick Attack around the outer coils. |
| Jigglypuff | Two original Clefairy models offer tiny moving head landings outside the moon spiral. The detours reward managing and replenishing aerial jumps. |
| Samus | Two Metroids patrol separate cave corridors. Targets sit along missile lanes interrupted by solid ceilings and opposite entrances. |
| Sheik | Two ReDeads guard alternating temple ledges. Needles, disappearing shadow steps and Vanish offer different routes past them. |
| Zelda | Three light bridges follow a shared sequence with a dark interval. The original Ocarina marks the central altar; long shots and Farore's Wind can shorten the crossing. |
| Game & Watch | Two independently timed rescue teams and an original Flat Zone falling tool. Cross the tool shaft between drops. |
| Roy | The original Binding Blade sweeps across the inner staircase, above two flame windows and a faster siege bridge. Close sword hits require committing during its withdrawal. |

Original meshes, UVs and texture bytes come from the user's Melee USA 1.02 disc.
The Onett car comes from its stage model; the Flat Zone tool comes from its
Tools article (item kind 0xe6), not the stage's animated background people; the other models
come from Melee's original trophy archives, without trophy bases. Their movement,
contacts and gameplay are authored for these courses: these are **not transplanted
enemy AIs**. The existing Corneria aircraft retain their previous native logic.
Trophy-scene lighting is baked into vertex colours; the Metroid shell retains
transparency and samples its original reflection texture. Source archive names,
hashes and selected mesh IDs are recorded in
`assets/custom-stages/native-props/*/model.json` and in the course manifest.

## Artwork

Only the Mewtwo containment shutter needs a new bitmap. Built-in imagegen,
transparent-background generation; no external API key or CLI fallback.

- Source: `assets/custom-stages/worlds/Mt/containment-gate-source.png`
- Game sprite: `assets/custom-stages/worlds/Mt/prop-gate.png`
- Encoded texture: `assets/custom-stages/worlds/Mt/prop-gate.rgba8`

Prompt:

> Create a game texture asset: one isolated tall narrow vertical laboratory containment shutter, front view orthographic, height approximately 3.75 times width. Transparent background. This is a solid moving wall for Mewtwo's purple/cyan laboratory in a richly painted Super Smash Bros. Melee custom level. Dark brushed metal central panels, crisp substantial purple illuminated bevel on all four edges, tiny green indicator lights, elegant bolts and inset engineering detail. Perfectly rectangular outer silhouette with FLAT straight top bottom and sides, no protrusions, no ground, no scene, no text, no characters. Sharp hand-painted game art with readable solid form, not blurred; detailed but readable when scaled down. Single sprite centered with minimal transparent margin.

The source is cropped to the measured metal rectangle and resized/encoded to GX
RGBA8. The full solid rectangle coincides with the gate's collision rectangle.

## Verification scope

48 Python stage tests, four custom-stage integration tests, PowerPC execution of
chest, aircraft, boost and gust callbacks. A standard-library-only build produces
identical hashes for all 26 archives. Native Dolphin smoke tests and focused
contact/visual probes are saved under `build/custom-stage/roster-native/`.

These checks do not establish a full ten-target human clear on each new course.
Route difficulty, shortcuts and enemy placement still need player feedback.

The native neutral-controller gust probe moves Kirby from x=27.5 to x=61.68541
with no self-velocity input, no damage and ten targets remaining. Car, Topi,
Zapdos, Metroid and blade contacts were observed in the focused traces.

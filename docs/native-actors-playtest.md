# Native actors and terrain pass — 2026-10-01

This pass changes Ness, Ice Climbers, Kirby, Pikachu, Samus and Sheik only.
The original Melee disc and all other character archives are preserved.

## Stage changes

- **Ness:** complete Onett car group, including its original four car variants,
  models, animation records, item contacts and damage callbacks. The original
  right-to-left state machine runs from x=726 to x=-642, outside both ends of
  the authored course. Native speed parameters are 16–18 units/frame instead
  of 3–5; the reverse lane is disabled. These are not rebuilt car meshes or
  custom bumper approximations. Three redundant upper supports/the lift are
  replaced by one isolated high island. The foreground wall edges now stand
  out from the backdrop. Roof targets invite guided PK Thunder and recovery.
- **Ice Climbers:** two native Topis (item 0x2e, ItCo.usd) and a native polar
  bear (0xd9, GrIm.dat), with their complete animations, hurtboxes, AI and
  defeat logic. The old Topi trophy prop is removed.
- **Sheik:** two native adventure ReDeads (0x2c, ItCo.usd), replacing trophy
  props. Two painted gaps cut through the foundation; there is no invisible
  floor in either opening.
- **Kirby:** Whispy and wind removed. Four fixed platforms and two moving
  clouds remain; the broad bottom foundation is entirely gone. Kirby starts
  on the lower left floating platform. Target locations and the reach audit
  account for the new route and multiple aerial jumps.
- **Samus:** flame grate removed. Metroids fly faster on curved, vertically
  varying paths (190/250 frames), with clearance above the solid blocks.
  These remain authored moving hazards, not imported Metroid AI.
- **Pikachu:** two open foundation shafts. Zapdos uses the original Poké Ball
  model/skeleton and wing animation from ItCo.usd instead of a frozen trophy.
  Its flight path and electrical contact remain stage-authored; both passes
  clear the central solid generator.

## Implementation

`scripts/native_encounters.py` reads the owner's USA 1.02 disc. It relocates
complete pointer-reachable HSD records without rebuilding their geometry or
textures. `world-retail.s` only hosts the native actors after normal BTT init.
The Onett, Topi, ReDead and polar-bear machine code is unchanged. The adapter
uses the retired Peach target module; the Onett callback table uses retired
Pichu space. Existing custom courses no longer call either retired module.

## Validation

- 52 Python stage tests and four Node custom-stage tests passed.
- PPC execution test checks native call arguments, register/stack preservation,
  one-way traffic setup, failed factory handling and repeated initialization.
- Resource tests compare all relocated Onett/polar-bear data against the disc.
  Native actor code is compared byte-for-byte against the original executable.
- Native Dolphin launches passed for all six changed stages. A live Zapdos
  skeleton probe records 40 changing bone rotations across 178 game frames,
  including the native animation loop; the flight anchor moves independently.
- Three actual Start + Z retries each for Ness, Ice Climbers and Sheik retain
  ten fresh targets and exactly four car items / two Topis plus one bear /
  two ReDeads. No duplicated or stale enemies. The isolated Sheik retry test
  presets Sheik at character selection to avoid keyboard timing ambiguity;
  it does not alter actor AI, target state, fighter physics or retry logic.
- Real controller input breaks Ness's under-island target with PK Thunder
  (10 → 9 targets), with no completion-state writes. A Kirby input probe
  reaches 78.84 native units above its starting ledge with four aerial jumps;
  the structural audit uses a smaller bound and the actual cloud orbits.
- The standard-library-only builder produces identical DAT files to the
  normal builder. Private spawn/input probes are not installed in the player
  profile. Full human clears and difficulty tuning remain playtest work.

Local evidence: `build/custom-stage/ness-onett/` and
`build/custom-stage/roster-abilities/inputs/{Ic-native,Ns-thunder,Kb-flight,Pk-wing}`.

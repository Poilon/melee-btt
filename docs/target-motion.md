# Seeded target motion

This is a shared challenge rule (`rules.moving: true`), not a local gameplay preference. For a ten-target course, the generator independently draws a static count from **6–10**, then splits the remainder between moving and teleporting targets. Both dynamic counts can be zero and neither exceeds four. Counts always sum to ten. Every stage receives its own draw. The draw, target selection and motion parameters all depend on the seed.

- Moving targets follow horizontal, vertical or diagonal segments and return along the same segment. Each leg takes 2–4 seconds.
- Teleporting targets alternate between two positions, spending 3–5 seconds at each. They stay visible and hittable at the selected position.
- Each target has a seeded initial delay (0–2 seconds). All targets start at their generated anchor.
- Position is calculated from Melee's elapsed game timer, not a wall clock, global random calls, player actions or accumulated velocity. Restarting resets the schedule. Pausing freezes the timer; paused runs remain ineligible for submission.

## Placement

The existing BTT generator still supplies stage geometry, shuffled character assignments, spawn points and anchors. Motion challenges add an eight-unit spacing rule between anchors. Paths are checked against bounds, stage exclusions, optional spawn exclusions, exceptions, and the assigned fighter's mismatch exclusions. The segment is split at all exclusion boundaries and each resulting interval is checked, so narrow forbidden regions cannot be skipped by sparse sampling. Paths keep six units of separation from other targets and their entire paths, including teleport endpoints.

These are the upstream generator's modeled reachable regions, not a proof that every character can complete every generated course. Every dynamic target regularly returns to its original anchor. The generator fails rather than silently relaxing the limits if it cannot fit the selected mix.

## Game hook

`src/gecko/target-motion.s` injects at **802D85D8**, the epilogue of [`itMato_UnkMotion0_Phys`](https://github.com/doldecomp/melee/blob/master/src/melee/it/kinds/itmato.c) in Melee USA 1.02. Vanilla first restores each target's anchor from its stage joint. The injection finds that anchor in a generated table for the internal stage, computes its absolute-time position, and writes the item's X/Y position before the normal engine updates rendering and collision. Unlisted targets retain their original behavior. No fighter state or global RNG is modified.

The elapsed timer is read from `8046B6C8` (seconds) and `8046B6CC` (fractional frames). The routine uses caller-saved registers and balanced stack space, preserves the nonvolatile item register, and executes the displaced instruction. It uses a Slippi-compatible `C2` injection and a final zero reserved for the bootloader's return branch. The routine is 288 bytes plus seed-specific data. The complete challenge code is bounded to 8 KiB; Slippi's bootloader allocates the codeset on its heap.

Static challenges retain their original version and identity. Motion challenges use `ttrc-btt3-motion-v1`; the motion payload is included in the challenge hash. Its manifest contains the complete target plans. Slippi records the enabled Gecko payload, so playback does not depend on current companion preferences. A BTT seed alone describes only the upstream portion; distribute the full TTRC Gecko code or release.

## Build and validation

Generate a challenge:

```sh
npm run generate -- --seed 20260990 --moving --out build/motion-challenge
```

The compiled routine is checked in as `src/gecko/target-motion.json`; playing and generating do not require an assembler. To rebuild it with GNU PowerPC binutils:

```sh
node scripts/build_motion.mjs
```

`PPC_AS` and `PPC_OBJCOPY` can select a local toolchain. Tests check the assembly source hash against the compiled payload. CPU validation executes the actual emitted instructions, including the inline table, rather than a rewritten implementation:

```sh
python -m pip install unicorn==2.1.4
python scripts/test_motion_cpu.py build/motion-challenge
```

The 20260990 challenge passes 1,840 PowerPC executions across 25 stages, covering static targets, initial delays, turnaround boundaries, teleport transitions and a one-hour game timer. Checks also cover register/stack preservation and unintended item-memory writes. Node tests cover determinism, identity isolation, the range of mixes over multiple seeds, thin exclusions, inter-target spacing and reset/seek behavior. Browser tests verify that the companion and course cards explain the seeded mix.

Windows Slippi Playback integration was checked with private diagnostic copies, preserving the originals and never submitting diagnostic files. RAM reads tracked target item positions and rendered joint positions against the generated schedule. Runs were replayed both with and without Slippi resync. This checks real engine behavior on the tested course; it does not claim a full human playthrough of all 25 courses.

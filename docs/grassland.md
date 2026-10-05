# Grassland 1

A standalone Fox Target Test course with an original, procedurally built landscape inspired by the visual style of Super Mario Bros. 3: pastel hills, clouds, outlined blocks, green pipes and two routes through ten fixed targets. Question blocks and pipes are solid scenery, without Mario item or warp behaviour.

## Build

Requires Python 3 and Pillow (used for the overview PNG).

```sh
python3 scripts/build_grassland.py \
  --iso 'Super Smash Bros. Melee (USA) (En,Ja) (v1.02).iso' \
  --output 'build/custom-stage/Grassland 1.iso'
```

The builder verifies the game revision and original Fox archive hash, preserves the source ISO, replaces only `GrTFx.dat`, and repacks the disc file table with 32-byte aligned files. The disc title is changed to identify the course. It also writes a DAT, layout JSON and overview PNG. `--stage-only` skips disc rebuilding.

The mesh uses unlit vertex colours. Visible solid platforms and collision rectangles come from the same geometry declarations. The new stage includes spawn points, camera bounds, blast zones and ten target anchors. Native Melee target spawning, attacks and completion logic are retained; stage animation tables are removed. Other characters keep their vanilla stages.

File structure references: [HSDLib stage types](https://github.com/Ploaj/HSDLib/tree/master/HSDRaw/Melee/Gr), [Melee Fox Target Test implementation](https://github.com/doldecomp/melee/blob/master/src/melee/gr/grtfox.c), and [HSD polygon format](https://github.com/doldecomp/melee/blob/master/src/sysdolphin/baselib/pobj.h).

## Companion integration

Open **Custom stages** below the companion's play settings, then **Play** on Grassland 1. No sign-in is required. First launch verifies the player's original ISO, builds a private patched copy, and prepares an isolated native TTRC Dolphin under `.local/custom-stages/grassland-1`. Later launches reuse the course unless its builder or source ISO changed. The embedded Python uses `--no-preview`; the gallery includes the generated overview PNG.

Application files are hard-linked (copied if necessary) into the course's Dolphin directory. Player data is never linked. A small standalone native helper accepts only the expected course ISO and verifies the Fox archive hash. It does not start challenge telemetry, authentication or submission services. The normal native helper continues to require a vanilla ISO for challenges.

The course gets its own User directory and memory card. Only controller and selected emulation settings are copied; external game-library, boot ROM, NAND and save paths are excluded. Music, rumble, UCF and other compatible gameplay preferences apply; the authored course keeps its following camera. Recordings are disabled. Its process has a distinct executable/profile path and is not captured as a challenge attempt. App updates wait while a custom-course Dolphin is running.

The earlier standalone prototype remains in `Desktop/TTRC Grassland 1`, with its `Grassland 1` desktop shortcut. The integrated companion builds and manages its own copy; it does not depend on that folder or a separate Slippi installation.

## Validation

Booted the repacked ISO in Windows Slippi Dolphin 3.6.4. Confirmed Fox loads the modified stage with all ten targets, visible geometry and stable 60 FPS. Tested a normal jump/attack that destroyed the first target and returned Fox to the ground; also observed the first block stopping horizontal movement. A complete unassisted run has not been validated. Subsequent polish only reduces the decorative title size to avoid the HUD.

Companion API/profile tests cover local launch authorization, update blocking, course hash validation, credential exclusion and card preservation. The gallery browser test covers launch progress, errors and mobile layout.

On a fresh course card, Melee asks to create Game Data: choose **Yes**, then select Fox. The integrated native launch was checked on Windows: the correct TTRC executable booted Melee at 60 FPS, and the main challenge capture remained waiting.

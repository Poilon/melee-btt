# Companion gameplay options

Sources retrieved on 2026-09-27:

- [BTT additional Gecko codes](https://docs.google.com/spreadsheets/d/1Zz93mr8iqHYhHtod6tJgF7dHU7fGhU8iQ3rayQNXVxA/edit?gid=1983385300): Luigi misfires (`00142AFB 00000001`), both Ice Climbers (`043BCE40 0A0B0000`, credited to PKFreeZZy), UCF Fix v0.73 and improved dashback.
- [Peach item generator by sockdude1](https://codepen.io/sockdude1/full/ExKxKQp): the generated C2 hook at `8011D0A4` reads the target counter at `8049ED9D`. Choices depend on targets remaining, not pull number. Item IDs are turnip `63`, beam sword `0C`, Bob-omb `06`, Mr. Saturn `07`. Unspecified counts execute the original instruction.

The static code payloads are pinned in `shared/gameplay-codes.json`. Python constructs the portable profile; JavaScript verifies the profile against the same catalog. Peach branches are generated from ten validated choices; custom addresses or pasted Gecko codes are not accepted. The profile verifier reconstructs the canonical Peach payload and rejects mutations. Tests check branch destinations for all target counts and Python/JavaScript agreement.

UCF is enabled by default, with the sheet’s Fix v0.73 before improved dashback. Both are kept in a single block to preserve their ordering at the shared `800C9A44` hook. Turning UCF off omits the entire block. Nana and forced misfires default to off; Peach defaults to Random at every count. Existing music/rumble-only settings migrate without losing either preference. Older tabs updating just those two settings preserve the gameplay choices.

These optional codes do not change the seed identity or original randomizer payload. They are installed before Dolphin reads its configuration; changing a setting while Dolphin runs takes effect after closing and relaunching Dolphin. Slippi serializes the enabled Gecko list (`Gecko::GenerateGct`) into recordings and Playback loads the recorded list; playback does not regenerate codes from current companion preferences. Submissions are included at reveal without prior approval; the organizer can inspect and exclude runs. Automated checks do not establish physical controller behavior or a complete in-game playthrough of every option.

## Luigi misfire compatibility

The sheet's `00142AFB 00000001` byte write changes `li r0,0` to `li r0,1` in Luigi's misfire selection. Slippi's [bootloader](https://github.com/project-slippi/slippi-ssbm-asm/blob/master/Bootloader/main.asm) handles `04`, `06` and `C2` writes but skips `00`. A code can consequently appear in the INI and replay without changing the game.

TTRC emits the equivalent full instruction write **`04142AF8 38000001`** for Melee USA 1.02. The profile verifier accepts the exact old byte payload for upgrade compatibility, but new profiles always use the full-word write. Tests reject unsupported code types at instruction boundaries and reject modified patch payloads.

A comparative Windows Slippi Playback check used a private copy of a Luigi recording with only this code replaced, without resync overriding the simulation. The original produced two normal missiles (motion state 347, misfire flag 0); the corrected copy produced two misfires (state 348, flag 1) from the same inputs. RAM also confirmed the actual instruction changed from `38000000` to `38000001`. The original replay was untouched, and diagnostic copies were not submitted. This check covers grounded missile selection; it is not a full playthrough of every gameplay option.

## Solo Popo replay fix

Target Test can write external character ID **32**, whereas normal Ice Climbers use **14**. Local replay discovery and the shared validator (also used by the website) accept both as `ice-climbers`. Character/course checks, completion checks and pause exclusion remain in place. Matching existing captures to their original recordings allows automatic recovery without recreating a score or altering the replay bytes.

## Zelda / Sheik capture fix

External IDs 18 (Zelda) and 19 (Sheik) map to the same `zelda` challenge entry. `shared/characters.mjs` is used by live capture, replay discovery and the website's replay validator so alternate forms cannot diverge between those paths. Transforming between the two forms does not reset an otherwise valid attempt. Stage, completion and pause checks still apply. A replay from a missed live capture does not by itself recreate a score; recovery requires checking the actual successful game timer in playback.

# Companion gameplay options

Sources retrieved on 2026-09-27:

- [BTT additional Gecko codes](https://docs.google.com/spreadsheets/d/1Zz93mr8iqHYhHtod6tJgF7dHU7fGhU8iQ3rayQNXVxA/edit?gid=1983385300): Luigi misfires (`00142AFB 00000001`), both Ice Climbers (`043BCE40 0A0B0000`, credited to PKFreeZZy), UCF Fix v0.73 and improved dashback.
- [Peach item generator by sockdude1](https://codepen.io/sockdude1/full/ExKxKQp): the generated C2 hook at `8011D0A4` reads the target counter at `8049ED9D`. Choices depend on targets remaining, not pull number. Item IDs are turnip `63`, beam sword `0C`, Bob-omb `06`, Mr. Saturn `07`. Unspecified counts execute the original instruction.

The exact static code payloads are pinned in `shared/gameplay-codes.json`. Python constructs the portable profile; JavaScript verifies the profile against the same catalog. Peach branches are generated from ten validated choices; custom addresses or pasted Gecko codes are not accepted. The profile verifier reconstructs the canonical Peach payload and rejects mutations. Tests check branch destinations for all target counts and Python/JavaScript agreement.

UCF is enabled by default, with the sheet’s Fix v0.73 before improved dashback. Both are kept in a single block to preserve their ordering at the shared `800C9A44` hook. Turning UCF off omits the entire block. Nana and forced misfires default to off; Peach defaults to Random at every count. Existing music/rumble-only settings migrate without losing either preference. Older tabs updating just those two settings preserve the gameplay choices.

These optional codes do not change the seed identity or original randomizer payload. They are installed before Dolphin reads its configuration; changing a setting while Dolphin runs takes effect after closing and relaunching Dolphin. Slippi serializes the enabled Gecko list (`Gecko::GenerateGct`) into recordings and Playback loads the recorded list; playback does not regenerate codes from current companion preferences. Human review still applies. Automated checks do not establish physical controller behavior or a complete in-game playthrough of every option.

## Solo Popo replay fix

Target Test can write external character ID **32**, whereas normal Ice Climbers use **14**. Local replay discovery and the shared validator (also used by the website) accept both as `ice-climbers`. Character/course checks, completion checks and pause exclusion remain in place. Matching existing captures to their original recordings allows automatic recovery without recreating a score or altering the replay bytes.

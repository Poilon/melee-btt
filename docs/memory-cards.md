# Native Melee records

TTRC uses a raw GameCube memory card in slot A and the Slippi recording device
in slot B. The card path is:

`User/GC/TTRC/<challenge-id>/MemoryCardA.USA.raw`

Preparing the profile, restarting Dolphin, moving the installation, or installing
an app update does not replace this file. Selecting a new challenge selects a new
card. Old challenge cards stay on disk; returning to the same challenge ID uses
its original card. The identity includes the challenge rules, not just its seed.

Dolphin formats a missing card on first use. Melee manages its save file through
the normal memory-card flow; accept its save-file creation prompt if shown and
let saving finish before stopping emulation. The release builder removes the
specific Slippi General Codes hook that skips the Target Test/Home Run Contest
card scene. All other General Codes and recording code remain intact. The
patch applies only to the packaged copy of `Sys/GameSettings/GALE01r2.ini`.

The entire Melee save belongs to that challenge. This does not edit a player's
vanilla card, account, controller settings, companion history or replays. Old
vanilla GCI files are no longer imported because their scores were earned on
different courses. Companion scores from before card saving was enabled are
not automatically written into Melee. In-game records use Melee's own rules;
they are separate from the companion's replay/pause checks and submissions.

Automated tests cover profile configuration, card retention, challenge changes,
folder relocation and the exact upstream code removal, including read-only Sys
files from the upstream archive.

Windows validation for v0.9.2 used a separate installation with no player account.
A controlled Target Test completion set the same remaining-target count and
stage flag as the final target hit. Melee recorded Dr. Mario at 61 frames, saved
the card on return to character select, and reloaded that exact record after a
complete Dolphin restart. Loading another generated challenge through the
companion's challenge-package mechanism selected a new card with no records;
the previous card's SHA-256 stayed unchanged. No test scores were submitted.
The Target Test banner and the icon extracted from the compiled Windows EXE
were also checked visually.

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
folder relocation and the exact upstream code removal. A Windows game test is
still needed: create a save, clear Target Test, let it save, restart and check the
time; then change challenges and check that the displayed records are empty.

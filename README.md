# Custom Melee BTT — Beta

Custom Melee BTT is currently in **beta**.
26 authored Target Test worlds for **Super Smash Bros. Melee USA 1.02**, with character-specific terrain, native Melee objects, online leaderboards and replays in the game.

**[Website & installation guide](https://melee-btt.com/#downloads)** · **[Latest Windows release](https://github.com/Poilon/melee-btt/releases/latest)**

## Play on Windows

1. Download **Custom-Melee-BTT-Windows-x64.zip** and use **Extract All…**. Keep the entire **Custom Melee BTT** folder together.
2. Open **Slippi Dolphin.exe**. On first launch, click **Choose ISO** and select your original **Melee USA v1.02 ISO**. The setup window checks its full checksum before enabling **Launch game**. Every launch checks the ISO again; if it is missing or changed, setup reopens. The 26 published levels are built automatically; a loading window shows the current step and elapsed time until Dolphin opens. Your original ISO stays unchanged.
3. Set up Port 1 in Dolphin’s **Controllers** window.
4. In Melee’s **Stadium** menu, choose **Log in**. Create a username/password account or sign in in the browser page that opens, then return to the game. It shows **Logged as your username**.
5. Choose **Target Test**, then a character. Completed eligible records submit automatically while signed in and online. **Start, then Z** restarts the level.
6. Open **Leaderboard** in Stadium to view records and play replays. **Start** in that menu opens Total time; all 26 characters are required.

**Custom Melee BTT Companion.vbs** opens optional settings and the level editor. **Test in Dolphin** in the online editor requires the local companion to be running. Published levels and editor playtests have separate records.

Windows 10/11 **x64**. The companion launcher is a small readable Windows script; no command window, WSL, Node.js or Python installation is needed. The companion stays running when Dolphin closes. Use **Quit companion** to stop it. Opening **Slippi Dolphin.exe** directly still starts the companion if needed. Internet is required for submissions and the first replay playback, which downloads the official Slippi Playback build. GameCube adapters may need their Windows driver installed. Other controllers can be configured in Dolphin’s **Controllers** window.

**The game ISO is not included.** It stays on your computer and is never uploaded. The accepted original image has MD5 `0e63d4223b01d9aba596259dc155a174`.

## Target behavior

Every stage has **10 targets**, with a seeded mix of **6–10 fixed targets**, **0–4 moving targets**, and **0–4 teleporting targets**. The three counts always add up to ten. The seed chooses the counts, affected targets, directions, distances, delays and periods separately for each stage.

Moving targets travel back and forth. Teleporting targets alternate between two positions with several seconds at each. Both return to their original positions regularly. Resetting a run restarts its timing; every player gets the same behavior. This is a challenge rule, not a local preference.

See [implementation and validation](docs/target-motion.md). The downloadable Gecko code contains the complete rules; a BTT seed alone does not include Custom Melee BTT's custom movement.

## Records and replays

- The companion captures fresh, completed Target Test runs and links their `.slp` files automatically.
- Zelda and Sheik share one of the 25 challenge entries. Starting as Sheik or transforming during a run counts toward the same entry.
- **Your runs** shows your best eligible run per character. Expand a character to see and replay earlier attempts.
- **Total attempts** counts every observed start, including resets, failures and abandoned runs. **Finished attempts** counts captured clears, including paused clears that remain excluded from records. Counts are local to the signed-in player and challenge, with per-character totals and an attempt history. Interrupted capture is labeled separately; unfinished attempts never become scores or submissions. Existing clears are included automatically, but abandoned attempts from before v0.8.2 cannot be reconstructed. Keep the companion running and start a fresh attempt for it to be counted.
- New valid personal bests are submitted automatically with their replay. Each new best replaces the current submission for that character.
- Paused runs are excluded from records and submissions, but remain visible with the reason and replay. If a character has no eligible clear, Your runs shows its latest excluded attempt instead of hiding it.
- Before the reveal, the website shows participants only. Other players’ times and ranks remain private.
- Use **Share score** or **Share replay** in the companion, or **Disclose score** / **Disclose replay** under **Your runs** on the website, to publish a time alone or its time and replay before reveal.
- Runs are submitted immediately and included at reveal without prior approval. Final personal bests and their replays become public at reveal. Capture is experimental; structural replay checks alone do not prove a valid record.

The companion saves these settings automatically and applies them the next time Dolphin starts:

- **Game music**, **Controller rumble**, and **UCF** (enabled by default).
- **Remove GO** hides the GO graphic; **Fixed camera** applies the fixed-camera code. Both are off by default.
- Under **Character settings**, enable Nana alongside Popo or force Luigi’s misfires.
- Choose Peach’s item separately for each remaining target count (10 through 1): Random, Turnip, Beam Sword, Bob-omb or Mr. Saturn. Repeated pulls at the same count give the same selected item; Random preserves the original choice.

The codes come from the supplied [BTT code sheet](https://docs.google.com/spreadsheets/d/1Zz93mr8iqHYhHtod6tJgF7dHU7fGhU8iQ3rayQNXVxA/edit?gid=1983385300) and [sockdude1’s Peach generator](https://codepen.io/sockdude1/full/ExKxKQp). UCF combines Fix v0.73 followed by improved dashback, in the sheet’s required order. These are approved optional patches alongside the unchanged seed code; Slippi records enabled patches in the replay. See [code provenance and validation](docs/gameplay-options.md).

The custom title appears on Melee’s character-select screen.

Replays are stored in **`Replays`**, next to Dolphin. The portable emulator profile and managed sign-in credentials live in **`User`**; scores and pending uploads stay in **`.local`**.

## Updating and troubleshooting

Close Dolphin and click **Quit companion**, back up `.local`, `User`, and `Replays`, then extract the latest release into the **same Custom Melee BTT folder** and replace application files. Releases do not contain your personal data, so these folders are preserved. When upgrading from v0.1, keep `build/challenge/runtime.json`, `build/replay-profiles`, and `Dolphin/netplay/Replays` too: the native version imports your player and copies the old replays automatically on its first start.

- **Wrong ISO:** use an original USA 1.02 image, not a modified or compressed image.
- **Dolphin cannot start Custom Melee BTT:** extract the entire ZIP, use a writable folder, and close any other companion using port 4317. See `.local/startup.log` for details.
- **Replay player download interrupted:** click Watch replay again to retry.
- **Game is already open:** close it before applying music/rumble changes or launching another session.
- **No controller input:** check Dolphin’s Controllers settings and your adapter driver.
- **Ice Climbers replay not attached on v0.5 or earlier:** update the companion. Solo Popo replays use character ID 32; both IDs 14 and 32 are accepted. Existing captured runs are linked and submitted automatically when their matching replay is available.
- **No score saved:** sign in before the attempt; start a fresh run and complete it without pausing. Leave the results screen so Dolphin finishes saving the replay.
- **Windows blocks the app:** these initial releases are unsigned. Verify the download source and compare the ZIP with `SHA256SUMS.txt`; do not disable Windows security globally.

## Accounts

Sign in with the same username and password on each PC to keep your Custom Melee BTT profile and records.
Your public username is unique and permanent, with a profile at `/players/your_username`.
No email or external account is required. Passwords are stored as salted scrypt hashes. Signing out of the website
leaves the companion connected; signing out in the companion stops new scored runs.

**Existing players:** open the website using **Open challenge website** in your
already connected companion, then **Add password**. This links your existing
player ID and keeps its records. Choose your username once. Do this before creating
a separate Custom Melee BTT account; distinct existing accounts are not merged automatically.

Save your password in your password manager: there is no email recovery.
See [account setup and storage](docs/accounts.md).

## Development

Node.js 24 and Python 3.10+ are used for development. The current development environment supports WSL with Windows Dolphin; releases run natively on Windows.

```sh
npm ci
npm run setup
npm test
npm run test:ui
npm run generate -- --seed 20260990 --stage all --targets 10 --moving
python3 scripts/prepare_dolphin.py --record-replays --iso /path/to/Melee.iso --dolphin /path/to/Slippi\ Dolphin.exe
npm start
```

The public seed snapshot is in `challenges/current`. Local profiles, ISOs, player files, databases, credentials and recordings are excluded from Git. See [the architecture and review documentation](docs/website.md).

First run the **Build Custom Melee BTT Dolphin** GitHub workflow. Download its `ttrc-dolphin` artifact into `build/dolphin-build`, then build the portable Windows ZIP on Linux:

```sh
npm ci
npm run setup
node scripts/build_release.mjs
```

The native build is pinned to Slippi commit `e7711b104b339a99385f2bb12b472d46140a7bc7`; `scripts/patch_dolphin.py` adds the startup hook, native ISO verification and companion menu. Releases include a separate **Custom Melee BTT-Dolphin-Source.tar.gz** with the complete matching Dolphin source and submodules, under GPL-2.0-or-later. This is a Custom Melee BTT modification, not an official Slippi release.

The builder uses an explicit list of public source folders, verifies pinned runtime downloads, and audits the output for private files. Artifacts are written to `build/release`. The GitHub workflow builds and publishes the same files when a `v*` tag is pushed. Runtime and Dolphin versions/checksums are pinned in `desktop/dependencies.json`.

## Reproducibility and credits

The challenge identity includes the generator version, rules and exact Gecko payload. One common seed randomizes target positions and starting points and assigns each of the 25 existing courses to one character. Original platforms and collisions remain unchanged. The generated seed should be tested before running a competition; randomization constraints do not prove every course is completable.

The generator comes from [Break the Targets Randomizer](https://bttrandomizer.com/) by **djwang88**, with Gecko code by **Punkline**, stage/spawn data by **megaqwertification**, and the contributors credited upstream. `npm run setup` downloads unchanged files from [djwang88/djwang88.github.io](https://github.com/djwang88/djwang88.github.io) at commit `54e8faa7c58ee146e9ce9beac2bc390d36e75871` and verifies their SHA-256 hashes. Upstream generator source files are not bundled in the portable release. `seedrandom` is by David Bau.

Dolphin binaries are downloaded directly from [Slippi](https://github.com/project-slippi/Ishiiruka) and [Slippi Playback](https://github.com/project-slippi/Ishiiruka-Playback); their source and licenses are available in those repositories. Node.js, Python, and JavaScript dependencies retain their bundled licenses. Character artwork sources and credits are listed in [CREDITS.txt](web/assets/melee/CREDITS.txt).

This fan project is not affiliated with Nintendo, HAL Laboratory or Project Slippi.

### New challenges

Admin accounts can close a challenge, set its end date, and generate the next seed
from the website. New seeds retain the same rules. Previous results remain in the
website archives. Companion v0.8.0 downloads new challenges and verifies them with
the pinned generator: close Dolphin, then use **Update challenge**, or launch from
the companion. No new ZIP is needed for each seed.

The website's **Old challenges** tab lists finished challenges with your valid
submissions, including the just-ended current challenge. Each summary shows its
seed, start and end dates, your place, points and THS. Expand a challenge for its
overall/THS leaderboards and copyable Gecko code, or open the complete challenge
to browse character results and replays. Start dates come from publication records;
legacy challenges without one show **Not recorded**.

### Reveal scoring

The overall leaderboard adds character points and THS points. Character places 1–5
award 10, 7, 5, 3 and 1 point; later places award 0. THS is the sum of a player's
best valid times across all 25 characters, with no entry for incomplete rosters.
THS places 1–6 award 15, 12.5, 10, 7.5, 5 and 2.5 points, then 0. Equal times share
a place and points (1, 1, 3); equal overall points also share a place. Times, ranks,
THS and point breakdowns stay hidden until reveal, except individually shared runs.

### Automatic app updates (Windows portable release)

From v0.9.0, starting Custom Melee BTT Dolphin or the companion checks the latest stable GitHub release in the background. A verified download installs automatically once Dolphin is closed; the companion restarts and an open companion tab reloads. Offline checks do not block play. The companion shows the installed version, progress, errors and a **Check for updates** button. Earlier versions need one final manual upgrade to v0.9.0.

Updates preserve `.local`, `User`, `Replays`, `Games`, playback Dolphin and `build/challenge`, including the current seed and ISO path. Only inventoried application files are replaced. The installer runs from a separate Node copy, verifies the archive checksum and file inventory, backs up changed files under `.local/updates/backup`, and rolls back on an installation error. An interrupted file transaction is recovered on the next companion start. Downloaded updates require 1.5 GB free space. Development checkouts do not auto-update.

Updater verification: `node --test test/app-updates.test.mjs`, `npm run test:ui`, and on Windows `npm run test:update:windows` (isolated installation, file-lock rollback, service restart and data preservation). The Windows build workflow runs the Windows integration test.

### Browser weekly competitions

`/weekly.html` is the permanent weekly competition page, separate from the
all-time browser leaderboard and the archived Dolphin/custom-stage challenges.
The opening round is Dr. Mario, October 10–12, 2026. Subsequent rounds change
every Monday at 00:00 **Europe/Paris**, including daylight-saving transitions.
Characters rotate in Melee select-screen order, including Zelda and Sheik as
separate featured fighters. There is no 1v1 mode or rating system here.

The calendar is deterministic (`shared/browser-weekly.mjs`); no scheduled job,
extra server, or manual round creation is needed. The API derives the current
round and provides public standings and previous/next archive links. A round
accepts only completed non-practice runs of its featured character and pinned
engine. UCF on/off is accepted. The signed entry binds the account, round and
server entry time; the browser uses that server clock for replay start times.
It must enter through the weekly page, start a fresh run and upload before the
exclusive deadline. Old records and later uploads never roll into the new round.
This remains a browser-recorded beta competition, not independently verified
competitive play; the entry ticket is not an anti-cheat proof of execution.

Only each player's best weekly time is ranked; equal times share a rank. Weekly
indexes are independent of the all-time best and survive the personal recent-run
list's retention limit. Entry replays stay public for archive viewing. A receipt
saved before the deadline retains its admission when a partial storage failure
requires a retry after the round has closed. Late runs still save as personal
records and display why they were not entered in the weekly competition.

Engine changes must append a future `fromWeek` in `WEEKLY_ENGINES`; do not alter
a past or active round's version. Site preparation verifies that every pinned
engine is still in the replay archive.

Validation: `node --test test/browser-weekly.test.mjs test/browser-btt.test.mjs`.
After building the site, `node scripts/serve-weekly-smoke.mjs` and
`node scripts/smoke-browser-weekly.mjs` exercise entry, the real native engine,
restart, IndexedDB upload, public replay and the leaderboard with a dedicated
muted Chrome CDP endpoint on port 9333. The fixture uses only ephemeral local
accounts and synthetic test results; it never submits runs to production.

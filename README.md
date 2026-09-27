# Target Test Randomizer Challenge

Randomized targets, shuffled character stages, and a shared seed for **Super Smash Bros. Melee USA 1.02**. The original stages and physics are kept: Fox can play Samus’s course, Marth can play Mewtwo’s, and so on.

**[Challenge website](https://target-test-randomizer-challenge.vercel.app)** · **[Download the latest Windows release](https://github.com/Poilon/target-test-randomizer-challenge/releases/latest)**

## Play on Windows

1. Download **TTRC-Windows-x64.zip** and extract the entire ZIP into a writable folder.
2. Open **TTRC Companion.vbs**. Sign in and choose your music and rumble settings before launching Dolphin.
3. Click **Launch Dolphin** in the companion, then **Open** in Dolphin and select your original **Melee USA 1.02** ISO. It stays in its existing folder. Dolphin checks it before starting the game.
4. Keep the companion open for your runs and replay history. **Tools → TTRC Companion** in Dolphin also opens it.
5. Click **Sign in** in the companion. Create an account with a unique username and a password, and confirm the matching connection code in your browser. No player file or Slippi account is needed.
6. Choose any character in Melee. New valid personal bests are submitted automatically with their replay.

Windows 10/11 **x64**. The companion launcher is a small readable Windows script; no command window, WSL, Node.js or Python installation is needed. The companion stays running when Dolphin closes. Use **Quit companion** to stop it. Opening **Slippi Dolphin.exe** directly still starts the companion if needed. Internet is required for submissions and the first replay playback, which downloads the official Slippi Playback build. GameCube adapters may need their Windows driver installed. Other controllers can be configured in Dolphin’s **Controllers** window.

**The game ISO is not included.** It stays on your computer and is never uploaded. The accepted original image has MD5 `0e63d4223b01d9aba596259dc155a174`.

## Target behavior

Every stage has **10 targets**, with a seeded mix of **6–10 fixed targets**, **0–4 moving targets**, and **0–4 teleporting targets**. The three counts always add up to ten. The seed chooses the counts, affected targets, directions, distances, delays and periods separately for each stage.

Moving targets travel back and forth. Teleporting targets alternate between two positions with several seconds at each. Both return to their original positions regularly. Resetting a run restarts its timing; every player gets the same behavior. This is a challenge rule, not a local preference.

See [implementation and validation](docs/target-motion.md). The downloadable Gecko code contains the complete rules; a BTT seed alone does not include TTRC's custom movement.

## Records and replays

- The companion captures fresh, completed Target Test runs and links their `.slp` files automatically.
- Zelda and Sheik share one of the 25 challenge entries. Starting as Sheik or transforming during a run counts toward the same entry.
- **Your runs** shows your best eligible run per character. Expand a character to see and replay earlier attempts.
- New valid personal bests are submitted automatically with their replay. Each new best replaces the current submission for that character.
- Paused runs are excluded from records and submissions, but remain visible with the reason and replay. If a character has no eligible clear, Your runs shows its latest excluded attempt instead of hiding it.
- Before the reveal, the website shows participants only. Other players’ times and ranks remain private.
- You can explicitly **Disclose run** on the website to make that specific time and replay public.
- Runs are submitted immediately and included at reveal without prior approval. Organizers can inspect replays and exclude invalid runs. Capture is experimental; structural replay checks alone do not prove a valid record.

The companion saves these settings automatically and applies them the next time Dolphin starts:

- **Game music**, **Controller rumble**, and **UCF** (enabled by default).
- **Remove GO** hides the GO graphic; **Fixed camera** applies the fixed-camera code. Both are off by default.
- Under **Character settings**, enable Nana alongside Popo or force Luigi’s misfires.
- Choose Peach’s item separately for each remaining target count (10 through 1): Random, Turnip, Beam Sword, Bob-omb or Mr. Saturn. Repeated pulls at the same count give the same selected item; Random preserves the original choice.

The codes come from the supplied [BTT code sheet](https://docs.google.com/spreadsheets/d/1Zz93mr8iqHYhHtod6tJgF7dHU7fGhU8iQ3rayQNXVxA/edit?gid=1983385300) and [sockdude1’s Peach generator](https://codepen.io/sockdude1/full/ExKxKQp). UCF combines Fix v0.73 followed by improved dashback, in the sheet’s required order. These are approved optional patches alongside the unchanged seed code; Slippi records enabled patches in the replay. See [code provenance and validation](docs/gameplay-options.md).

The custom title appears on Melee’s character-select screen.

Replays are stored in **`Replays`**, next to Dolphin. The portable emulator profile and managed sign-in credentials live in **`User`**; scores and pending uploads stay in **`.local`**.

## Updating and troubleshooting

Close Dolphin and click **Quit companion**, back up `.local`, `User`, and `Replays`, then extract the latest release into the **same TTRC folder** and replace application files. Releases do not contain your personal data, so these folders are preserved. When upgrading from v0.1, keep `build/challenge/runtime.json`, `build/replay-profiles`, and `Dolphin/netplay/Replays` too: the native version imports your player and copies the old replays automatically on its first start.

- **Wrong ISO:** use an original USA 1.02 image, not a modified or compressed image.
- **Dolphin cannot start TTRC:** extract the entire ZIP, use a writable folder, and close any other companion using port 4317. See `.local/startup.log` for details.
- **Replay player download interrupted:** click Watch replay again to retry.
- **Game is already open:** close it before applying music/rumble changes or launching another session.
- **No controller input:** check Dolphin’s Controllers settings and your adapter driver.
- **Ice Climbers replay not attached on v0.5 or earlier:** update the companion. Solo Popo replays use character ID 32; both IDs 14 and 32 are accepted. Existing captured runs are linked and submitted automatically when their matching replay is available.
- **No score saved:** sign in before the attempt; start a fresh run and complete it without pausing. Leave the results screen so Dolphin finishes saving the replay.
- **Windows blocks the app:** these initial releases are unsigned. Verify the download source and compare the ZIP with `SHA256SUMS.txt`; do not disable Windows security globally.

## Accounts

Sign in with the same username and password on each PC to keep your TTRC profile and records.
Your public username is unique and permanent, with a profile at `/players/your_username`.
No email or external account is required. Passwords are stored as salted scrypt hashes. Signing out of the website
leaves the companion connected; signing out in the companion stops new scored runs.

**Existing players:** open the website using **Open challenge website** in your
already connected companion, then **Add password**. This links your existing
player ID and keeps its records. Choose your username once. Do this before creating
a separate TTRC account; distinct existing accounts are not merged automatically.

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

First run the **Build TTRC Dolphin** GitHub workflow. Download its `ttrc-dolphin` artifact into `build/dolphin-build`, then build the portable Windows ZIP on Linux:

```sh
npm ci
npm run setup
node scripts/build_release.mjs
```

The native build is pinned to Slippi commit `e7711b104b339a99385f2bb12b472d46140a7bc7`; `scripts/patch_dolphin.py` adds the startup hook, native ISO verification and companion menu. Releases include a separate **TTRC-Dolphin-Source.tar.gz** with the complete matching Dolphin source and submodules, under GPL-2.0-or-later. This is a TTRC modification, not an official Slippi release.

The builder uses an explicit list of public source folders, verifies pinned runtime downloads, and audits the output for private files. Artifacts are written to `build/release`. The GitHub workflow builds and publishes the same files when a `v*` tag is pushed. Runtime and Dolphin versions/checksums are pinned in `desktop/dependencies.json`.

## Reproducibility and credits

The challenge identity includes the generator version, rules and exact Gecko payload. One common seed randomizes target positions and starting points and assigns each of the 25 existing courses to one character. Original platforms and collisions remain unchanged. The generated seed should be tested before running a competition; randomization constraints do not prove every course is completable.

The generator comes from [Break the Targets Randomizer](https://bttrandomizer.com/) by **djwang88**, with Gecko code by **Punkline**, stage/spawn data by **megaqwertification**, and the contributors credited upstream. `npm run setup` downloads unchanged files from [djwang88/djwang88.github.io](https://github.com/djwang88/djwang88.github.io) at commit `54e8faa7c58ee146e9ce9beac2bc390d36e75871` and verifies their SHA-256 hashes. Upstream generator source files are not bundled in the portable release. `seedrandom` is by David Bau.

Dolphin binaries are downloaded directly from [Slippi](https://github.com/project-slippi/Ishiiruka) and [Slippi Playback](https://github.com/project-slippi/Ishiiruka-Playback); their source and licenses are available in those repositories. Node.js, Python, and JavaScript dependencies retain their bundled licenses. Character artwork sources and credits are listed in [CREDITS.txt](web/assets/melee/CREDITS.txt).

This fan project is not affiliated with Nintendo, HAL Laboratory or Project Slippi.

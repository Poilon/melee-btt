# Target Test Randomizer Challenge

Randomized targets, shuffled character stages, and a shared seed for **Super Smash Bros. Melee USA 1.02**. The original stages and physics are kept: Fox can play Samus’s course, Marth can play Mewtwo’s, and so on.

**[Challenge website](https://target-test-randomizer-challenge.vercel.app)** · **[Download the latest Windows release](https://github.com/Poilon/target-test-randomizer-challenge/releases/latest)**

## Play on Windows

1. Download **TTRC-Windows-x64.zip** and extract the entire ZIP into a writable folder. Keep that folder; it holds your game, player profile and replays.
2. Double-click **Start TTRC.cmd**. Keep its window open while playing; your browser opens the companion.
3. Click **Choose Melee ISO** and select your original **USA 1.02** ISO. The companion checks it and copies it to `Games/Melee.iso`. Alternatively, place the file there yourself.
4. Click **Set up Dolphin**. The companion downloads the official Slippi play and replay builds, verifies the downloads, and prepares a dedicated profile.
5. [Create your player on the website](https://target-test-randomizer-challenge.vercel.app), download your `user.json`, and choose **Import player** in the companion. No Slippi or Discord account is needed.
6. Connect your controller, click **Launch Dolphin**, and choose any character in Melee.

Windows 10/11 **x64**, internet for first-time setup, and at least **2 GB** of free space are required. Node.js and Python are included; WSL is not required. GameCube adapters may need their Windows driver installed. The default play profile uses a GameCube USB adapter. Other controllers can be configured in Dolphin’s Controllers window.

**The game ISO is not included.** It stays on your computer and is never uploaded. The accepted original image has MD5 `0e63d4223b01d9aba596259dc155a174`.

## Records and replays

- The companion captures fresh, completed Target Test runs and links their `.slp` files automatically.
- **Your runs** shows your best eligible run per character. Expand a character to see and replay earlier attempts.
- New valid personal bests are submitted automatically with their replay. Each new best replaces the current submission for that character.
- Paused runs are excluded from records and submissions, but remain available for playback.
- Before the reveal, the website shows participants only. Other players’ times and ranks remain private.
- You can explicitly **Disclose run** on the website to make that specific time and replay public.
- Submitted replays require human review. Capture is experimental; structural replay checks alone do not prove a valid record.

**Game music** and **Controller rumble** can be toggled in the companion. Settings are saved automatically and apply on the next launch of Dolphin. The custom title appears on Melee’s character-select screen.

Replays are stored in `Dolphin/netplay/Replays` for a portable installation, next to the recording emulator. Player data and scores stay in `.local` and `build/replay-profiles`.

## Updating and troubleshooting

Close the companion and Dolphin, back up `.local`, `Games`, `build/replay-profiles`, and `Dolphin/netplay/Replays`, then extract the latest release into the **same TTRC folder** and replace application files. Releases do not contain your personal data, so these folders are preserved.

- **Wrong ISO:** use an original USA 1.02 image, not a modified or compressed image.
- **Setup interrupted:** reopen the companion and retry **Set up Dolphin**. Completed verified downloads are kept.
- **Game is already open:** close it before applying music/rumble changes or launching another session.
- **No controller input:** check Dolphin’s Controllers settings and your adapter driver.
- **No score saved:** import your player before the attempt; start a fresh run and complete it without pausing. Leave the results screen so Dolphin finishes saving the replay.
- **Windows blocks the app:** these initial releases are unsigned. Verify the download source and compare the ZIP with `SHA256SUMS.txt`; do not disable Windows security globally.

## Development

Node.js 24 and Python 3.10+ are used for development. The current development environment supports WSL with Windows Dolphin; releases run natively on Windows.

```sh
npm ci
npm run setup
npm test
npm run test:ui
npm run generate -- --seed 20260989 --stage all --targets 10
python3 scripts/prepare_dolphin.py --record-replays --iso /path/to/Melee.iso --dolphin /path/to/Slippi\ Dolphin.exe
npm start
```

The public seed snapshot is in `challenges/current`. Local profiles, ISOs, player files, databases, credentials and recordings are excluded from Git. See [the architecture and review documentation](docs/website.md).

Build the portable Windows ZIP on Linux:

```sh
npm ci
npm run setup
node scripts/build_release.mjs
```

The builder uses an explicit list of public source folders, verifies pinned runtime downloads, and audits the output for private files. Artifacts are written to `build/release`. The GitHub workflow builds and publishes the same files when a `v*` tag is pushed. Runtime and Dolphin versions/checksums are pinned in `desktop/dependencies.json`.

## Reproducibility and credits

The challenge identity includes the generator version, rules and exact Gecko payload. One common seed randomizes target positions and starting points and assigns each of the 25 existing courses to one character. Original platforms and collisions remain unchanged. The generated seed should be tested before running a competition; randomization constraints do not prove every course is completable.

The generator comes from [Break the Targets Randomizer](https://bttrandomizer.com/) by **djwang88**, with Gecko code by **Punkline**, stage/spawn data by **megaqwertification**, and the contributors credited upstream. `npm run setup` downloads unchanged files from [djwang88/djwang88.github.io](https://github.com/djwang88/djwang88.github.io) at commit `54e8faa7c58ee146e9ce9beac2bc390d36e75871` and verifies their SHA-256 hashes. Upstream generator source files are not bundled in the portable release. `seedrandom` is by David Bau.

Dolphin binaries are downloaded directly from [Slippi](https://github.com/project-slippi/Ishiiruka) and [Slippi Playback](https://github.com/project-slippi/Ishiiruka-Playback); their source and licenses are available in those repositories. Node.js, Python, and JavaScript dependencies retain their bundled licenses. Character artwork sources and credits are listed in [CREDITS.txt](web/assets/melee/CREDITS.txt).

This fan project is not affiliated with Nintendo, HAL Laboratory or Project Slippi.

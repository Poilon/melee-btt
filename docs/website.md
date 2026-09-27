# Website, companion and replay review

Public website: **https://target-test-randomizer-challenge.vercel.app**.
Local companion: **http://localhost:4317**. Organizer desk on this PC:
**http://localhost:4317/review**.

## Play and submit

1. Open the TTRC build of **Slippi Dolphin.exe** and select your Melee USA 1.02 ISO with **Open**.
2. Open **Tools → TTRC Companion**, click **Sign in**, then create an account with a unique username and password in your browser.
3. Registration signs you in immediately. Confirm that the website and companion show the same code, then **Connect companion**. Credentials are saved automatically; there is no player-file download/import step.
4. Choose your character in Dolphin and play a fresh attempt with the companion
   running. Completed runs are saved locally. Valid personal bests are submitted
   automatically once their matching replay is complete.
5. Exit the result screen to finish writing the replay. The companion attaches the
   matching recording automatically and uploads the best run’s time and private
   replay together (maximum replay size: 2 MB). Paused runs are excluded.
6. The submission becomes **Submitted** and your name appears in the participant
   list. Times remain private until reveal. Submitted bests enter the revealed
   rankings automatically; the organizer can exclude a run with a reason.

A failed connection leaves the replay and claim in a
private durable upload queue, retried every 15 seconds. Local records remain safe.
Permanent upload errors are shown on the run; resolve the reported issue and retry.
An already accepted run cannot be changed by reusing its ID. Each player has
one current submission per character: the fastest non-rejected run. New faster
runs replace it, while previous entries remain in the owner’s private history.
Delayed retries cannot replace a better run. Review approval stays attached to
the exact run and does not transfer to its replacement.

The companion has a separate purple/mint design with
one personal best per character, expandable attempt history, submission filters and CSV export. Character selection happens in
Melee; the companion displays the character and stage detected during the run.
The public site retains the gold competition design, course search, favorites,
progress, focus mode and character links. Character cards select course details and personal records,
then the character’s leaderboard after reveal. It does not choose a fighter in
Melee. The companion’s recent exports include up to 50 runs; expanded character history
loads older runs in pages of 50. The website displays and exports all of your
submitted runs across characters, grouped by personal best with expandable
history. Personal bests include all stored attempts.

## Accounts and companion connection

Accounts use a unique username and password. No email address, Google account or
mail service is required. Usernames are case-insensitive, permanent, and contain
3–24 ASCII letters, numbers or underscores, starting with a letter or number.
Create-only Blob reservations enforce uniqueness across serverless instances.
Passwords use independent random salts and scrypt (N=32768, r=8, p=3); plaintext
passwords are never stored. Passwords must contain 8–128 characters.

Registration signs the player in immediately. Login checks are rate limited per
IP and username. Browser sessions use HttpOnly, Secure, SameSite=Lax cookies and
expire after 30 days. Private credentials are never included in dashboard or
public profile responses. `/players/<slug>` exposes public identity and disclosed
replays, while other results remain sealed. There is no email password recovery.

The companion requests a ten-minute connection and displays a verification code.
The signed-in browser approves the matching request explicitly. Only the companion's
private polling secret can retrieve its device credential. Cancel and expiry stop
pending authorization; a device credential lasts one year. Credentials are stored
automatically under `User/Challenge/user.json` and `.local/companion.json`.

Existing profiles remain usable. Open the website from the connected companion,
then **Add password** to retain the same player ID and all runs. Existing reserved
usernames can only gain a password through their owner's authenticated session;
other users cannot claim them. Conditional Blob writes protect concurrent upgrades.
An earlier Google browser session can also prove ownership while it remains valid.

**Open challenge website** uses a one-time, 60-second ticket in a URL fragment,
removed before redemption. Signing out of the website leaves the companion signed
in. Signing out of the companion prevents old local files from restoring the session.
See [account setup](accounts.md).

## Sealed leaderboard

During an open challenge, public responses contain an alphabetical, challenge-wide
participant list with player names and TT codes, **without rankings, time/frame
fields, or performance-based ordering**. The leaderboard array is empty. Players
with submitted runs appear once; rejected-only entries do not.
This is enforced by the server, not CSS. Your own submitted times and history
remain visible to you when signed in. At reveal, the fastest non-rejected submission per player
and character determines rank; equal times share a rank. No prior approval is required.

By default, the organizer closes the challenge manually from the review desk.
**Close challenge & reveal times** requires confirmation, stops new submissions
and permanently reveals submitted times. No real challenge is closed by setup or
tests. An optional ISO timestamp `CHALLENGE_ENDS_AT` provides automatic closure.
Reviews of submissions received before closure can continue after it.

## Optional public disclosure

On the website, **Disclose run** publishes that specific time and replay after
showing exactly what becomes public. All visitors can see it under **Public
replays**, copy a direct link, download the `.slp`, or **Watch in Dolphin**.
The last action opens the companion with the selected run; **Launch replay**
starts playback. Merely opening a link never starts an executable.

Disclosure requires the owner’s signed-in website session. It applies to one
immutable run, never to a character or future replacement. **Make private** removes
public access again; downloaded copies cannot be recalled. Replay download and
playback check the disclosure flag on every request. Approval/rejection is shown
separately, and private review notes are not published. The participant list and
undisclosed results remain sealed until the organizer’s reveal.

## Launching replays

Recordings are saved in the **Replays** folder next to the recording Dolphin
executable. **Open replay folder** opens that directory. Preparing the profile
copies legacy recordings without deleting originals or overwriting existing
recordings. Playback is available directly in **Your runs**; there is no duplicate
replay gallery in the companion.
**Your runs** initially shows one personal best per character. Click a character
row to see all its attempts, newest first, with **Watch replay** on each recorded
run. Replay association runs every two seconds and requires a unique matching
character, course and recording start timestamp. The replay frame counter is not
the in-game timer, and is not used to reject a match when the start was captured. Ambiguous matches are
left unresolved. The companion waits for Dolphin to finish the file, then keeps
a private copy. The association survives restarts and the original file being
moved. No manual linking, file picker or submit click is needed for a new personal best.
Paused recordings are linked for playback but excluded from local personal bests,
progress and submissions. The companion and public upload API check jumps in the
Slippi scene-frame counter (available since 3.10); older files still require manual
pause review. The score is never replaced by the replay’s frame index.
Old clears made without replay recording cannot acquire a replay retroactively.
Replays are limited to 2 MB.

The local organizer desk has the same **Launch replay** button on each submission.
It downloads the private evidence through the reviewer connection and opens a
local copy. On the public review page, **Open companion to launch** opens the local
desk; the website itself cannot start a Windows executable.

Playback uses a separate profile under `build/playback-profiles/<challenge>/<stage>`
and private snapshots under `.local/playback/replays`. It reuses the existing
viewer for that stage when possible and restarts the selected replay. It never
writes into the original `.slp`, recording profile or ordinary Slippi profile.
The viewer is excluded from live score capture, so watching cannot create a run.

Playback loads the Gecko list embedded in the replay. BTT's modular randomizer
also reads Melee's `selected_stage` global (0x804D49E8), so the viewer restores the
recorded external stage ID before loading the stage. Slippi's normal resync option
is enabled. The real Marth → Mewtwo recording from 2026-09-27 was replayed through
all ten targets to a successful ending. This confirms that recording's playback,
not automatic validation of other recordings or proof against tampering.

## Optional human review

The organizer desk lists submitted claims with their private replay downloads,
recorded character/stage, claimed time, replay version and embedded-code check.
Use **Launch replay** on the local desk, or download the `.slp` for a compatible
Slippi playback Dolphin. Check the seed/course, character, all targets and game
clock when checking a submission. If replay playback cannot reproduce the run, reject it
with a reason rather than treating the parser as proof.

The parser rejects renamed files, incomplete raw data, wrong game mode, mismatched
character/stage and missing game endings. The evidence SHA-256 and immutable claim
bind the submitted time to the attached bytes. A parser or matching Gecko list is
not an anti-cheat proof, proof of ownership, or proof of a successful clear.
Submission does not require human approval. An optional review decision is immutable in this
interface. Replays are kept in private storage. Only reviewers can download undisclosed
replays; disclosed replays are publicly downloadable through a permission-checked
endpoint.

On the organizer's PC, `.local/reviewer.key` supplies the server-side reviewer
credential; the local desk does not expose that key to browser JavaScript. Other
reviewers can use `/review.html` on the public site and sign in with the shared
reviewer key. Never distribute this key with a player pack. Reviewer sessions
expire after one hour. The local server checks host, origin and action headers
and binds only to loopback; it must not be exposed publicly.

## Emulator and capture

Current setup targets WSL with Windows Dolphin, Node.js 24 and Python 3:

```sh
npm install
npm run setup
npm run generate
python3 scripts/prepare_dolphin.py --record-replays
npm start
```

The default recorder executable is Slippi Launcher's installed netplay Dolphin.
Use `--dolphin`, `--iso` and `--controller-config` for custom paths. The script
verifies the original Melee USA 1.02 ISO and creates an isolated replay profile,
with recording enabled and Slippi online/menu patches disabled. Existing ordinary
Dolphin and Slippi profiles are not modified. `runtime.json` selects the prepared
profile for the companion. Supply your own ISO; no installer or ISO is distributed.

The Windows reader observes only the dedicated profile's process, read-only.
It must see a fresh attempt, expected character/stage, all targets broken, success
and a frozen final timer. Failures, resets, time reversals, changing players or
processes cancel the capture. Attaching midway through a run cannot save a score.

Times are integer game frames. Melee's fractional display is
`floor((frames % 60) * 99 / 59)` with 60 frames/second. Fox's observed 704-frame
result matches 11.73. The fraction is read at match +0x2C, not +0x26.
Capture remains experimental. Standard Dolphin boot and the Slippi recording
profile's Target Test menu/memory connection have been checked. A real locally recorded Marth replay has also been played through a successful
ending. A complete new attempt with the repaired player-profile migration, live
score capture and human submission review remains to be cross-checked.
The previous 11.73 made on standard Dolphin has no replay to attach retroactively.

Address references: [m-target GALE01-2.lua](https://github.com/bkacjios/m-target/blob/8458ada90b2dc5031508d0fe15313e6654f23392/source/modules/games/GALE01-2.lua),
[result handling](https://github.com/bkacjios/m-target/blob/8458ada90b2dc5031508d0fe15313e6654f23392/source/targets.lua).
Replay support: [Slippi ShouldRecord.asm](https://github.com/project-slippi/slippi-ssbm-asm/blob/master/Recording/ShouldRecord.asm),
[slippi-js](https://github.com/project-slippi/slippi-js).

## Storage, tests and deployment

Local records: `.local/scores.sqlite`; queued uploads: `.local/outbox`; player key
cache: `.local/companion.json`. These and emulator profiles are private and excluded
from deployment. Cloud storage holds profiles, hashed device/session keys,
submissions, private evidence, review decisions and challenge closure state.
Legacy score-only uploads return HTTP 410 and cannot enter the leaderboard.

Vercel environment: `BLOB_READ_WRITE_TOKEN`, `SESSION_SECRET`, `REVIEWER_KEY` and
optionally `CHALLENGE_ENDS_AT`. The current active seed is **20260989**. New seeds
require generating a challenge, preparing its Dolphin profile and deploying the
same manifest/code. Use `TTRC_CHALLENGE_DIR` for a different local challenge folder.

```sh
npm test
npm run test:ui
node scripts/prepare_vercel.mjs
vercel --prod --yes --cwd .deploy --scope poilons-projects
```

Tests cover actual replay parsing, authentication, replay privacy, automatic inclusion
at reveal and rejected-run exclusion, own-time visibility, sealed API payloads, review, closure and submission
retry. Browser tests exercise the complete replay submission and approval flow in
memory-only fixtures. They never add test scores to production.

The deployment allowlist contains only web/cloud/shared code and generated
challenge data. No ISO, player file, local database, reviewer key, test replay or
emulator is uploaded. Listings can take about 15 seconds to refresh across cloud
instances; companion review status is checked every 30 seconds.

### Companion play settings

The companion's **Game music** and **Controller rumble** checkboxes save to
`.local/play-settings.json`. They are independent of the player account and
survive a companion restart. Changes apply when launching Dolphin from the
companion; an open game is not interrupted or changed mid-run.

The dedicated play profile uses Slippi's `04023FFC 38800000` music-only patch
when music is disabled, and removes that optional patch on the next enabled
launch. The seed's original Gecko payload and hash remain unchanged. Master
volume and sound effects are preserved. Adapter rumble is configured for all
four ports; emulated controller motor strengths are restored when re-enabled.
Sources: [Slippi music patch](https://github.com/project-slippi/slippi-ssbm-asm/blob/master/Binary/GameMusicOff.bin),
[Dolphin configuration](https://github.com/project-slippi/Ishiiruka/blob/slippi/Source/Core/Core/ConfigManager.cpp).

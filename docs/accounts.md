# TTRC accounts

Create an account using **Username** and **Password**. Registration signs you in
immediately. No email, verification message, Google account or Resend setup is needed.

Usernames are unique regardless of capitalization: `Poilon` and `poilon` are the
same login. They use 3–24 letters, numbers or underscores and cannot be changed.
Passwords have 8–128 characters. Save yours in your password manager: there is no
email recovery in this account model.

## Companion and existing profiles

Click Sign in in the companion, sign in or create an account on the website, compare
the code in both windows, then Connect companion. Its credential is saved automatically.
Use the same username and password on another PC to keep your profile and records.

For an existing profile, open the website using Open challenge website in its connected
companion. Choose Add password and retain your existing username, or choose a username
if this older profile did not have one. This keeps the original player ID and runs.
Distinct accounts are never merged by matching their public display names.

## Hosting

Production only needs these existing Vercel environment variables:

- `SESSION_SECRET`: a strong random secret.
- `BLOB_READ_WRITE_TOKEN`: access to the private Blob store.
- `REVIEWER_KEY`: optional legacy organizer access. Admin accounts use their normal login.

`SITE_ORIGIN` is optional when Vercel's canonical production URL is available.
Google and Resend variables are not used. After changing server code or environment:

```sh
node scripts/prepare_vercel.mjs
vercel --prod --yes --cwd .deploy --scope poilons-projects
```

## Credential storage

The private username reservation contains its owner ID, a random credential revision
and a salted scrypt password hash (N=32768, r=8, p=3). Create-only writes prevent races
for the same username; ETag conditional writes protect legacy account upgrades.
Public profile records are separate and never contain password hashes.

Sessions and device tokens are random and stored only as hashes. Browser cookies
are HttpOnly, Secure and SameSite=Lax. Sessions expire after 30 days; device credentials
after a year. Server-side limits protect password checks and account creation. Login
errors use the same message for a nonexistent username and an incorrect password.

Companion authorization lasts ten minutes and requires explicit browser approval.
The secret used to retrieve its credential is never sent to the browser. Public profile
pages and sealed score responses never expose credentials or other players' private runs.

Tests cover concurrent username claims, case-insensitive login, wrong passwords,
legacy account upgrades, credential privacy, rate limits and companion cancellation.

## Admin accounts

An operator can grant a role to an existing password account using private Blob
credentials (do not commit the environment file):

```sh
node --env-file=<private-env-file> scripts/set_admin.mjs poilon grant
node --env-file=<private-env-file> scripts/set_admin.mjs poilon revoke
```

The grant is attached to the immutable player ID in private storage. Registration,
public profiles and companion player files cannot assign roles. Access is checked
on every admin API request, so revoking the role takes effect on existing sessions.

Sign in normally, then open **Admin** in the website navigation (`/review`). Admins
can see private submissions and download evidence, set or remove an end date,
and close the challenge with a confirmation. Runs are accepted automatically.
Dates are entered in the browser's local time zone and stored in UTC.

At the deadline, submissions stop and rankings/times are revealed automatically by
the server, including when nobody has the admin page open. Without a date the
challenge stays open until manual closure. Closure is permanent; the admin page
cannot hide already revealed results or reopen submissions. After reveal, each player’s current valid records and their replays become public.
Before reveal, players can share just a score or share the score and replay from the
companion. A score-only disclosure never grants replay download access.

After closing a challenge, use **Generate new challenge** with an optional seed
(blank selects a random seed). Confirm **Generate & publish** to open the next
challenge with the same rules and no deadline. A server-side conditional write
prevents simultaneous publications from replacing each other. Previous results
remain in **Previous challenges** on the site. Generation does not require a deploy.

Companion v0.8.0 checks for new challenges, verifies their full contents against the
pinned generator, and offers **Update challenge**. Close Dolphin before applying it.
Launching Dolphin through the companion also checks and applies available updates.
Accounts, settings, previous local scores and replays are preserved.

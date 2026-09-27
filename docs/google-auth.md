# Google sign-in setup

The public website and companion share one TTRC account. Google credentials belong
only in the website's server environment; never bundle them in a release or commit them.

1. In [Google Auth Platform](https://console.cloud.google.com/auth/overview), choose or create a project.
2. Configure Branding and Audience for TTRC. Select External for public players.
   In Testing mode, only explicitly added test users can sign in. Publish the app's
   audience when ready for everyone. Complete any requirements shown by Google.
3. Under Clients, create an OAuth client of type **Web application**.
4. Add this exact **Authorized redirect URI**:

   ```text
   https://target-test-randomizer-challenge.vercel.app/api/auth/google/callback
   ```

   This is a server redirect flow; no browser JavaScript client secret or localhost
   Google redirect is needed. Only the `openid` scope is requested.
5. In the [Vercel project environment settings](https://vercel.com/poilons-projects/target-test-randomizer-challenge/settings/environment-variables), add these to **Production**:

   ```text
   GOOGLE_CLIENT_ID=<Web application client ID>
   GOOGLE_CLIENT_SECRET=<client secret>
   ```

   Retain the existing `SESSION_SECRET`, `BLOB_READ_WRITE_TOKEN` and `REVIEWER_KEY`.
   `SESSION_SECRET` must be a strong random secret. The Blob store must be private.
   `SITE_ORIGIN`, if set, must match the canonical HTTPS website origin exactly.
6. Redeploy production so the new environment variables take effect:

   ```sh
   node scripts/prepare_vercel.mjs
   vercel --prod --yes --cwd .deploy --scope poilons-projects
   ```

7. Use **Continue with Google**, choose a username, then connect a companion by
   comparing its code with the browser and approving it. Sign out and sign back
   in to verify the same profile returns. Existing players should first open the
   website from their already connected companion to link their existing records.

Without both Google variables, the site clearly reports that sign-in is not yet
configured. It does not create fake accounts or fall back to downloadable credentials.

Automated tests use an isolated mock identity provider for browser navigation and
locally signed JWTs for signature/claim validation. They do not exercise Google's
live consent screen. Real production sign-in must be checked after configuration.

Protocol reference: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect).

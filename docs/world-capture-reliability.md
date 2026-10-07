# Published-stage score and replay capture

The October 7 capture fixes address reproducible failures in the local Dolphin
recorder, without changing course IDs, gameplay, or leaderboard validation.

- The watcher no longer has to observe the first six timer frames. A late first
  gameplay sample creates an attempt with an estimated start time; submission
  still requires a matching, complete replay.
- Missing/incoherent RAM reads do not discard an active attempt. Scene changes,
  resets, deaths and account changes still terminate it.
- A coherent clear is saved on its first sample, before a quick Start + Z can
  skip the second sample the previous implementation required.
- Replay matching checks character, stage, score and start time. Identical file
  copies are deduplicated; all accounts and previously submitted records
  participate in ambiguity checks.
- A complete replay can repair the missed finish of an observed interrupted
  attempt. This requires an unambiguous owner and the original rules revision.
  Orphan files are never assigned to whichever account happens to be signed in.
- The replay link is saved before upload. Failed uploads retain their local
  evidence and retry. A final sync runs when Dolphin closes.
- Malformed history entries no longer stop the entire queue. Transient disk
  write failures retain the latest attempt in memory for retry and appear in
  the companion. This cannot guarantee recovery after a crash while the disk
  remains unwritable.
- Unchanged replay files are parsed once per recorder lifetime. The cache holds
  metadata, not replay buffers, and invalidates on file size/modification changes.
- Records before the score cutoff are ignored, not deleted by synchronization.

Validation: `npm test`, plus the capture, worlds and world-history suites using
Windows Node. Tests use isolated copies of the public DK replay fixture; no
player records or production scores are modified.

Limits: these fixes have not been verified against a particular affected
player's installation. The existing 2 MiB replay size limit remains in the
shared parser, upload and playback paths; long replays exceeding it need a
separate transport/storage change. No missing replay can be recreated if Dolphin
never wrote it. Publishing an updated client is required for existing players
to receive these fixes; changing the website alone does not update their recorder.

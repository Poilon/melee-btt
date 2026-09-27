import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

export class ScoreStore {
  constructor(path) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY, challenge_id TEXT NOT NULL,
        player_id TEXT NOT NULL, display_name TEXT NOT NULL, connect_code TEXT NOT NULL,
        character TEXT NOT NULL, stage TEXT NOT NULL,
        frames INTEGER NOT NULL CHECK(frames > 0 AND frames <= 216000),
        created_at TEXT NOT NULL, source TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS submissions (
        run_id TEXT PRIMARY KEY, status TEXT NOT NULL, replay_name TEXT,
        note TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS run_exclusions (
        run_id TEXT PRIMARY KEY, reason TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS run_capture (
        run_id TEXT PRIMARY KEY, started_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS run_replays (
        run_id TEXT PRIMARY KEY, sha256 TEXT NOT NULL, file_name TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS runs_board ON runs(challenge_id, character, player_id, frames);
    `);
  }
  add({ id = randomUUID(), challenge, identity, character, stage, frames, startedAt }) {
    if (!identity || !/^[0-9a-f]{64}$/.test(identity.id) || !challenge.assignments[character] ||
        challenge.assignments[character] !== stage || !Number.isInteger(frames) || frames <= 0 || frames > 216000) {
      throw new Error('Résultat invalide.');
    }
    this.db.prepare('INSERT OR IGNORE INTO runs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, challenge.id, identity.id, identity.displayName, identity.connectCode,
        character, stage, frames, new Date().toISOString(), 'dolphin-local-experimental');
    if (typeof startedAt === 'string' && Number.isFinite(Date.parse(startedAt))) {
      this.db.prepare('INSERT OR IGNORE INTO run_capture VALUES (?, ?)').run(id, startedAt);
    }
    return id;
  }
  leaderboard(challengeId, character) {
    return this.db.prepare(`
      WITH best AS (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY frames, created_at, id) AS personal
        FROM runs WHERE challenge_id = ? AND character = ? AND NOT EXISTS(SELECT 1 FROM run_exclusions x WHERE x.run_id=runs.id)
      )
      SELECT RANK() OVER (ORDER BY frames) AS rank, display_name AS displayName,
        connect_code AS connectCode, player_id AS playerId, frames, created_at AS createdAt
      FROM best WHERE personal = 1 ORDER BY frames, created_at, id LIMIT 100
    `).all(challengeId, character);
  }
  history(challengeId, playerId) {
    return this.db.prepare(`SELECT id, character, stage, frames, created_at AS createdAt,
        COALESCE(s.status, 'local') AS submissionStatus, s.replay_name AS replayName, s.note AS reviewNote,
        rr.sha256 IS NOT NULL AS hasReplay, x.reason AS exclusionReason
      FROM runs LEFT JOIN submissions s ON s.run_id = runs.id LEFT JOIN run_exclusions x ON x.run_id=runs.id
      LEFT JOIN run_replays rr ON rr.run_id = runs.id WHERE challenge_id = ? AND player_id = ? ORDER BY created_at DESC, runs.rowid DESC LIMIT 50`)
      .all(challengeId, playerId);
  }
  bestRuns(challengeId, playerId) {
    return this.db.prepare(`WITH ranked AS (
      SELECT *, ROW_NUMBER() OVER(PARTITION BY character ORDER BY frames, created_at, id) AS place,
      (SELECT COUNT(*) FROM runs all_runs WHERE all_runs.challenge_id=runs.challenge_id AND all_runs.player_id=runs.player_id AND all_runs.character=runs.character) AS attemptCount
      FROM runs WHERE challenge_id=? AND player_id=? AND NOT EXISTS(SELECT 1 FROM run_exclusions x WHERE x.run_id=runs.id)
    ) SELECT r.id, r.character, r.stage, r.frames, r.created_at AS createdAt, r.attemptCount,
      COALESCE(s.status,'local') AS submissionStatus, s.replay_name AS replayName, s.note AS reviewNote,
      rr.sha256 IS NOT NULL AS hasReplay FROM ranked r
      LEFT JOIN submissions s ON s.run_id=r.id LEFT JOIN run_replays rr ON rr.run_id=r.id
      WHERE r.place=1 ORDER BY r.character`).all(challengeId, playerId);
  }
  characterHistory(challengeId, playerId, character, offset = 0) {
    return this.db.prepare(`SELECT r.id, r.character, r.stage, r.frames, r.created_at AS createdAt,
      COALESCE(s.status,'local') AS submissionStatus, s.replay_name AS replayName, s.note AS reviewNote,
      rr.sha256 IS NOT NULL AS hasReplay, x.reason AS exclusionReason FROM runs r LEFT JOIN run_exclusions x ON x.run_id=r.id
      LEFT JOIN submissions s ON s.run_id=r.id LEFT JOIN run_replays rr ON rr.run_id=r.id
      WHERE r.challenge_id=? AND r.player_id=? AND r.character=?
      ORDER BY r.created_at DESC, r.rowid DESC LIMIT 50 OFFSET ?`).all(challengeId, playerId, character, offset);
  }
  personalBest(challengeId, character, playerId) {
    return this.db.prepare(`SELECT frames FROM runs WHERE challenge_id = ? AND character = ? AND NOT EXISTS(SELECT 1 FROM run_exclusions x WHERE x.run_id=runs.id)
      AND player_id = ? ORDER BY frames LIMIT 1`).get(challengeId, character, playerId) || null;
  }
  progress(challengeId, playerId) {
    return Object.fromEntries(this.db.prepare(`SELECT character, COUNT(*) AS runs, MIN(frames) AS best
      FROM runs WHERE challenge_id = ? AND player_id = ? AND NOT EXISTS(SELECT 1 FROM run_exclusions x WHERE x.run_id=runs.id) GROUP BY character`).all(challengeId, playerId)
      .map(row => [row.character, { runs: row.runs, best: row.best }]));
  }
  run(id, playerId, challengeId) {
    return this.db.prepare('SELECT id, character, stage, frames, (SELECT reason FROM run_exclusions x WHERE x.run_id=runs.id) AS exclusionReason FROM runs WHERE id = ? AND player_id = ? AND challenge_id = ?').get(id, playerId, challengeId) || null;
  }
  unlinkedRuns(challengeId) {
    return this.db.prepare(`SELECT r.id, r.character, r.stage, r.frames, r.created_at AS createdAt, c.started_at AS startedAt
      FROM runs r LEFT JOIN run_capture c ON c.run_id=r.id LEFT JOIN run_replays p ON p.run_id=r.id
      WHERE r.challenge_id=? AND p.run_id IS NULL ORDER BY r.created_at DESC LIMIT 200`).all(challengeId);
  }
  exclude(id, reason) { this.db.prepare('INSERT OR REPLACE INTO run_exclusions VALUES (?, ?)').run(id,reason.slice(0,500)); }
  linkedReplayHashes() { return new Set(this.db.prepare('SELECT sha256 FROM run_replays').all().map(r=>r.sha256)); }
  attachReplay(id, sha256, name) {
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('Invalid replay hash');
    this.db.prepare('INSERT INTO run_replays VALUES (?, ?, ?) ON CONFLICT(run_id) DO UPDATE SET sha256=excluded.sha256, file_name=excluded.file_name')
      .run(id, sha256, name.slice(0, 120));
  }
  replay(id) { return this.db.prepare('SELECT sha256, file_name AS name FROM run_replays WHERE run_id = ?').get(id) || null; }
  setSubmission(id, status, note = '', replayName = null) {
    if (!['local','queued','pending','approved','rejected','upload-error','superseded'].includes(status)) throw new Error('Invalid submission status');
    this.db.prepare(`INSERT INTO submissions VALUES (?, ?, ?, ?, ?) ON CONFLICT(run_id) DO UPDATE SET
      status=excluded.status, note=excluded.note, updated_at=excluded.updated_at,
      replay_name=COALESCE(excluded.replay_name, submissions.replay_name)`)
      .run(id, status, replayName, note.slice(0, 500), new Date().toISOString());
  }
  stats(challengeId) {
    return this.db.prepare(`SELECT COUNT(*) AS completions, COUNT(DISTINCT player_id) AS players,
      COUNT(DISTINCT character) AS characters FROM runs WHERE challenge_id = ? AND NOT EXISTS(SELECT 1 FROM run_exclusions x WHERE x.run_id=runs.id)`).get(challengeId);
  }
  close() { this.db.close(); }
}

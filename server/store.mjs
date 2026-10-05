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
      CREATE TABLE IF NOT EXISTS attempts (
        id TEXT PRIMARY KEY, challenge_id TEXT NOT NULL, player_id TEXT NOT NULL,
        character TEXT NOT NULL, stage TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT,
        status TEXT NOT NULL CHECK(status IN ('active','finished','aborted','interrupted')),
        elapsed_frames INTEGER NOT NULL DEFAULT 0 CHECK(elapsed_frames BETWEEN 0 AND 216000),
        reason TEXT NOT NULL DEFAULT ''
      ) STRICT;
      CREATE INDEX IF NOT EXISTS attempts_player ON attempts(challenge_id,player_id,character,started_at);
      INSERT OR IGNORE INTO attempts
        SELECT r.id,r.challenge_id,r.player_id,r.character,r.stage,COALESCE(c.started_at,r.created_at),r.created_at,'finished',r.frames,''
        FROM runs r LEFT JOIN run_capture c ON c.run_id=r.id ORDER BY r.rowid;
    `);
  }
  clearScoresBefore(cutoff) {
    if(!Number.isFinite(Date.parse(cutoff)))throw Error('Invalid score reset date');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.exec('CREATE TEMP TABLE reset_score_ids (id TEXT PRIMARY KEY)');
      this.db.prepare('INSERT INTO reset_score_ids SELECT r.id FROM runs r LEFT JOIN run_capture c ON c.run_id=r.id WHERE r.created_at < ? OR c.started_at < ?').run(cutoff,cutoff);
      for(const table of ['submissions','run_exclusions','run_replays','run_capture'])this.db.exec(`DELETE FROM ${table} WHERE run_id IN (SELECT id FROM reset_score_ids)`);
      this.db.exec('DELETE FROM runs WHERE id IN (SELECT id FROM reset_score_ids)');
      this.db.prepare('DELETE FROM attempts WHERE started_at < ? OR id IN (SELECT id FROM reset_score_ids)').run(cutoff);
      this.db.exec('DROP TABLE reset_score_ids; COMMIT');
    } catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  recordAttempt({id,challenge,identity,character,stage,startedAt,status,endedAt,elapsedFrames=0,reason=''}) {
    if(!id||!/^[a-f0-9]{64}$/.test(identity?.id||'')||!challenge?.assignments[character]||challenge.assignments[character]!==stage||!Number.isFinite(Date.parse(startedAt)))throw new Error('Invalid attempt');
    if(status==='active'){
      this.db.prepare('INSERT OR IGNORE INTO attempts (id,challenge_id,player_id,character,stage,started_at,status) VALUES (?,?,?,?,?,?,?)')
        .run(id,challenge.id,identity.id,character,stage,startedAt,status);
    }else if(['aborted','interrupted'].includes(status)){
      this.db.prepare("UPDATE attempts SET status=?,ended_at=?,elapsed_frames=?,reason=? WHERE id=? AND challenge_id=? AND player_id=? AND status='active'")
        .run(status,endedAt||new Date().toISOString(),Math.max(0,Math.min(216000,Math.trunc(elapsedFrames))),reason.slice(0,200),id,challenge.id,identity.id);
    }else throw new Error('Invalid attempt status');
  }
  recoverAttempts() {
    this.db.prepare("UPDATE attempts SET status='interrupted',ended_at=?,reason='Companion stopped before the result was captured' WHERE status='active'").run(new Date().toISOString());
  }
  attemptStats(challengeId,playerId) {
    const rows=this.db.prepare(`SELECT character,COUNT(*) AS total,SUM(status='finished') AS finished,
      SUM(status='aborted') AS aborted,SUM(status='interrupted') AS interrupted,SUM(status='active') AS active
      FROM attempts WHERE challenge_id=? AND player_id=? GROUP BY character`).all(challengeId,playerId);
    const result={total:0,finished:0,aborted:0,interrupted:0,active:0,byCharacter:{}};
    for(const {character,...counts} of rows){result.byCharacter[character]=counts;for(const key of Object.keys(counts))result[key]+=counts[key];}
    return result;
  }
  add({ id = randomUUID(), challenge, identity, character, stage, frames, startedAt }) {
    if (!identity || !/^[0-9a-f]{64}$/.test(identity.id) || !challenge.assignments[character] ||
        challenge.assignments[character] !== stage || !Number.isInteger(frames) || frames <= 0 || frames > 216000) {
      throw new Error('Résultat invalide.');
    }
    this.db.exec('BEGIN');
    try{
    this.db.prepare('INSERT OR IGNORE INTO runs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, challenge.id, identity.id, identity.displayName, identity.connectCode,
        character, stage, frames, new Date().toISOString(), 'dolphin-local-experimental');
    if (typeof startedAt === 'string' && Number.isFinite(Date.parse(startedAt))) {
      this.db.prepare('INSERT OR IGNORE INTO run_capture VALUES (?, ?)').run(id, startedAt);
    }
    this.db.prepare(`INSERT OR IGNORE INTO attempts SELECT r.id,r.challenge_id,r.player_id,r.character,r.stage,COALESCE(c.started_at,r.created_at),r.created_at,'finished',r.frames,''
      FROM runs r LEFT JOIN run_capture c ON c.run_id=r.id WHERE r.id=?`).run(id);
    this.db.prepare("UPDATE attempts SET status='finished',ended_at=(SELECT created_at FROM runs WHERE id=?),elapsed_frames=(SELECT frames FROM runs WHERE id=?),reason='' WHERE id=? AND challenge_id=? AND player_id=?")
      .run(id,id,id,challenge.id,identity.id);
    this.db.exec('COMMIT');
    }catch(error){this.db.exec('ROLLBACK');throw error;}
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
  bestRuns(challengeId, playerId, {includeExcluded = false} = {}) {
    // The dashboard may show the latest excluded attempt when no eligible best
    // exists. Submission selection keeps its eligible-only default.
    return this.db.prepare(`WITH candidates AS (
      SELECT runs.*, runs.rowid AS sequence, x.reason AS exclusionReason,
      (SELECT COUNT(*) FROM runs all_runs WHERE all_runs.challenge_id=runs.challenge_id AND all_runs.player_id=runs.player_id AND all_runs.character=runs.character) AS attemptCount
      FROM runs LEFT JOIN run_exclusions x ON x.run_id=runs.id
      WHERE challenge_id=? AND player_id=? AND (? OR x.run_id IS NULL)
    ), ranked AS (
      SELECT *, ROW_NUMBER() OVER(PARTITION BY character ORDER BY
        exclusionReason IS NOT NULL,
        CASE WHEN exclusionReason IS NULL THEN frames END,
        CASE WHEN exclusionReason IS NOT NULL THEN sequence END DESC,
        created_at, id) AS place FROM candidates
    ) SELECT r.id, r.character, r.stage, r.frames, r.created_at AS createdAt, r.attemptCount,
      COALESCE(s.status,'local') AS submissionStatus, s.replay_name AS replayName, s.note AS reviewNote,
      rr.sha256 IS NOT NULL AS hasReplay, r.exclusionReason FROM ranked r
      LEFT JOIN submissions s ON s.run_id=r.id LEFT JOIN run_replays rr ON rr.run_id=r.id
      WHERE r.place=1 ORDER BY r.character`).all(challengeId, playerId, includeExcluded ? 1 : 0);
  }
  characterHistory(challengeId, playerId, character, offset = 0) {
    return this.db.prepare(`SELECT a.id, a.character, a.stage, r.frames, COALESCE(r.created_at,a.started_at) AS createdAt,
      a.status AS attemptStatus,a.reason AS abortReason,a.elapsed_frames AS elapsedFrames,
      COALESCE(s.status,'local') AS submissionStatus, s.replay_name AS replayName, s.note AS reviewNote,
      rr.sha256 IS NOT NULL AS hasReplay, x.reason AS exclusionReason FROM attempts a LEFT JOIN runs r ON r.id=a.id LEFT JOIN run_exclusions x ON x.run_id=r.id
      LEFT JOIN submissions s ON s.run_id=r.id LEFT JOIN run_replays rr ON rr.run_id=r.id
      WHERE a.challenge_id=? AND a.player_id=? AND a.character=?
      ORDER BY COALESCE(r.created_at,a.started_at) DESC, a.rowid DESC LIMIT 50 OFFSET ?`).all(challengeId, playerId, character, offset);
  }
  runGroups(challengeId,playerId) {
    const best=new Map(this.bestRuns(challengeId,playerId,{includeExcluded:true}).map(r=>[r.character,r]));
    return Object.entries(this.attemptStats(challengeId,playerId).byCharacter).map(([character,counts])=>{
      const run=best.get(character)||this.characterHistory(challengeId,playerId,character)[0];
      return {...run,attemptStatus:best.has(character)?'finished':run.attemptStatus,attemptCount:counts.total,finishedCount:counts.finished};
    }).sort((a,b)=>a.character.localeCompare(b.character));
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
    if (!['local','queued','submitted','pending','approved','rejected','upload-error','superseded'].includes(status)) throw new Error('Invalid submission status');
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

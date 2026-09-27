import { artworkFiles } from '../shared/artwork.mjs';
import { validPlaySettings } from './play-settings.mjs';
import { ReplayError,ReplayLibrary } from './replays.mjs';
import {verifyChallengePackage} from './online-challenge.mjs';
import { inspectReplay, MAX_REPLAY_BYTES } from '../shared/replay.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { stages } from '../src/challenge.mjs';

const files = new Map([
  ...artworkFiles,
  ['/', ['../companion/index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['../companion/app.js', 'text/javascript; charset=utf-8']],
  ['/review', ['review.html', 'text/html; charset=utf-8']],
  ['/review.js', ['review.js', 'text/javascript; charset=utf-8']],
  ['/review.css', ['review.css', 'text/css; charset=utf-8']],
  ['/time.js', ['time.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['../companion/style.css', 'text/css; charset=utf-8']],
  ['/target.svg', ['target.svg', 'image/svg+xml']],
]);

export function createApp({ challenge:initialChallenge, gecko:initialGecko, getChallenge, onlineChallenge, updateChallenge, store, getIdentity, getCapture, launch, remote, importPlayer, prepareRecorder, reviewerProxy, openReplays, replays, getPlaySettings, savePlaySettings, onboarding, account, instance, quit }) {
  const server = createServer(async (req, res) => {
    const {manifest:challenge,gecko}=getChallenge?getChallenge():{manifest:initialChallenge,gecko:initialGecko};
    const port = server.address()?.port;
    const hosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`]);
    const json = (status, value) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(value));
    };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if (!hosts.has(req.headers.host)) return json(403, { error: 'Host not allowed.' });
    if (req.headers.origin && ![`http://localhost:${port}`, `http://127.0.0.1:${port}`].includes(req.headers.origin)) {
      return json(403, { error: 'Origin not allowed.' });
    }
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if(req.method==='POST'&&url.pathname==='/api/challenge/update'){
        if(!req.headers.origin||req.headers['x-ttrc-action']!=='challenge')return json(403,{error:'Action not allowed.'});
        if(!updateChallenge)return json(503,{error:'Challenge updates unavailable.'});
        try{return json(200,await updateChallenge());}catch(error){return json(409,{error:error.message});}
      }
      if(req.method==='POST'&&url.pathname==='/api/submissions/disclose'){
        if(!req.headers.origin||req.headers['x-ttrc-action']!=='disclose')return json(403,{error:'Action not allowed.'});
        const identity=await getIdentity();if(!identity)return json(401,{error:'Sign in first.'});
        let body='';for await(const part of req){body+=part;if(body.length>1024)return json(413,{error:'Request too large.'});}
        const input=JSON.parse(body),run=store.run(input.id,identity.id,challenge.id);
        if(!run||run.exclusionReason)return json(404,{error:'Submitted run not found for this player.'});
        if(!remote?.disclose)return json(503,{error:'Sharing unavailable.'});
        try{return json(200,await remote.disclose(run.id,input.kind,identity));}catch(error){return json(400,{error:error.message});}
      }
      if (req.method === 'GET' && url.pathname === '/api/health') return json(200, {instance});
      if (req.method === 'POST' && url.pathname === '/api/quit') {
        if (!req.headers.origin || req.headers['x-ttrc-action'] !== 'quit') return json(403, {error:'Action not allowed.'});
        if (!quit) return json(503, {error:'Quit unavailable.'});
        res.once('finish', quit);
        return json(200, {ok:true});
      }
      if (req.method === 'POST' && ['/api/account/start', '/api/account/cancel', '/api/account/logout'].includes(url.pathname)) {
        if (!req.headers.origin || req.headers['x-ttrc-action'] !== 'profile') return json(403, { error: 'Action not allowed.' });
        if (!account) return json(503, { error: 'Sign-in unavailable. Update your companion.' });
        try { return json(200, await account[url.pathname.split('/').at(-1)]()); }
        catch (error) { return json(503, { error: error.message }); }
      }
      if (req.method === 'POST' && ['/api/setup/iso','/api/setup/install','/api/setup/folder'].includes(url.pathname)) {
        if (!onboarding) return json(503, {error:'Setup unavailable.'});
        if (!req.headers.origin || req.headers['x-ttrc-action'] !== 'setup') return json(403, {error:'Action not allowed.'});
        if (url.pathname.endsWith('/iso')) return json(200, await onboarding.chooseIso());
        if (url.pathname.endsWith('/folder')) return json(200, await onboarding.openGames());
        return json(202, onboarding.start());
      }
      if (url.pathname === '/api/settings' && req.method === 'POST') {
        if (!req.headers.origin || req.headers['x-ttrc-action'] !== 'settings') return json(403, { error: 'Action not allowed.' });
        if (!savePlaySettings) return json(503, { error: 'Play settings unavailable.' });
        let body = '';
        for await (const chunk of req) { body += chunk; if (body.length > 2048) return json(413, { error: 'Request too large.' }); }
        let value; try { value = JSON.parse(body); } catch { return json(400, { error: 'Invalid play settings.' }); }
        if (!validPlaySettings(value)) return json(400, { error: 'Invalid play settings.' });
        return json(200, { settings: await savePlaySettings(value) });
      }
      if(url.pathname==='/api/shared/run'&&req.method==='GET'){
        if(!remote?.publicRun)return json(503,{error:'Shared replays unavailable.'});
        try{return json(200,await remote.publicRun(url.searchParams.get('id'),url.searchParams.get('playerId'),false,url.searchParams.get('challenge')));}
        catch{return json(404,{error:'This run is not public or is no longer available.'});}
      }
      if(url.pathname==='/api/shared/launch'&&req.method==='POST'){
        if(!req.headers.origin||req.headers['x-ttrc-action']!=='launch')return json(403,{error:'Launch not allowed.'});
        if(!remote?.publicRun||!replays)return json(503,{error:'Playback unavailable.'});
        let body='';for await(const part of req){body+=part;if(body.length>1024)return json(413,{error:'Request too large.'});}
        const input=JSON.parse(body);
        try{
          const data=await remote.publicRun(input.id,input.playerId,false,input.challengeId);
          const bytes=await remote.publicRun(input.id,input.playerId,true,input.challengeId);
          if(data.challengeId!==challenge.id){
            const pack=await verifyChallengePackage(await remote.challengePackage(data.challengeId));
            const archived=new ReplayLibrary({directory:replays.directory,cacheDirectory:replays.cacheDirectory,challenge:pack.manifest,gecko:pack.gecko,run:replays.run});
            return json(200,await archived.launchBytes(bytes));
          }
          return json(200,await replays.launchBytes(bytes));
        }catch(error){if(error instanceof ReplayError)throw error;return json(404,{error:'This public replay is no longer available.'});}
      }
      if (req.method === 'POST' && ['/api/runs/replay/link', '/api/runs/replay/launch'].includes(url.pathname)) {
        if (!replays) return json(503, { error: 'Playback unavailable.' });
        if (!req.headers.origin || req.headers['x-ttrc-action'] !== 'launch') return json(403, { error: 'Launch not allowed.' });
        const identity = await getIdentity();
        if (!identity) return json(401, { error: 'Sign in first.' });
        let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 3 * 1024 * 1024) return json(413, { error: 'Replay must be under 2 MB.' }); }
        let input; try { input = JSON.parse(body); } catch { return json(400, { error: 'Invalid request.' }); }
        const run = store.run(input.id, identity.id, challenge.id);
        if (!run) return json(404, { error: 'Local run not found for this player.' });
        if (url.pathname.endsWith('/link')) {
          const bytes = Buffer.from(typeof input.replay === 'string' ? input.replay : '', 'base64');
          try { inspectReplay(bytes, run, gecko); } catch { return json(400, { error: 'Choose the complete .slp matching this run’s character and course.' }); }
          const saved = await replays.remember(bytes);
          store.attachReplay(run.id, saved.sha256, typeof input.name === 'string' ? input.name : 'replay.slp');
          return json(200, { ok: true });
        }
        const saved = store.replay(run.id);
        if (!saved) return json(404, { error: 'The matching replay is not ready yet. Exit the results screen and wait a moment.' });
        return json(200, await replays.launchSaved(saved.sha256));
      }
      if (req.method === 'GET' && url.pathname === '/api/replays') {
        return json(200, { replays: replays ? await replays.list() : [] });
      }
      if (req.method === 'POST' && ['/api/replays/launch', '/api/replays/open', '/api/review/launch'].includes(url.pathname)) {
        if (!replays) return json(503, { error: 'Playback is not available in this companion.' });
        if (!req.headers.origin || req.headers['x-ttrc-action'] !== 'launch') return json(403, { error: 'Launch not allowed.' });
        let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 3 * 1024 * 1024) return json(413, { error: 'Replay must be under 2 MB.' }); }
        let input; try { input = JSON.parse(body); } catch { return json(400, { error: 'Invalid launch request.' }); }
        if (url.pathname === '/api/replays/launch') return json(200, await replays.launch(input.id));
        if (url.pathname === '/api/replays/open') return json(200, await replays.launchBytes(Buffer.from(typeof input.replay === 'string' ? input.replay : '', 'base64')));
        if (!reviewerProxy || !/^[a-f0-9-]{36}$/.test(input.id || '') || !/^[a-f0-9]{64}$/.test(input.playerId || '')) return json(400, { error: 'Invalid review request.' });
        const response = await reviewerProxy('review/replay', `?id=${input.id}&playerId=${input.playerId}`, 'GET');
        if (!response.ok) return json(response.status, { error: 'Replay unavailable. Reviewer access is required.' });
        return json(200, await replays.launchBytes(Buffer.from(await response.arrayBuffer())));
      }
      if (url.pathname.startsWith('/api/review/')) {
        const path = url.pathname.slice(5);
        if (!reviewerProxy || !['review/queue','review/replay','review/decision','review/close','review/schedule'].includes(path)) return json(404, { error: 'Reviewer route unavailable.' });
        if (req.method !== 'GET' && (!req.headers.origin || req.headers['x-ttrc-action'] !== 'review')) return json(403, { error: 'Action not allowed.' });
        let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 4096) return json(413, { error: 'Request too large.' }); }
        const response = await reviewerProxy(path, url.search, req.method, body || undefined);
        const headers = { 'Content-Type': response.headers.get('content-type') || 'application/json' };
        if (response.headers.get('content-disposition')) headers['Content-Disposition'] = response.headers.get('content-disposition');
        res.writeHead(response.status, headers); res.end(Buffer.from(await response.arrayBuffer())); return;
      }
      if (req.method === 'POST' && url.pathname === '/api/recorder/folder') {
        if (!openReplays || !req.headers.origin || req.headers['x-ttrc-action'] !== 'launch') return json(403, { error: 'Action not allowed.' });
        return json(200, await openReplays());
      }
      if (req.method === 'POST' && url.pathname === '/api/recorder/prepare') {
        if (!prepareRecorder || !req.headers.origin || req.headers['x-ttrc-action'] !== 'launch') return json(403, { error: 'Action not allowed.' });
        return json(200, await prepareRecorder());
      }
      if (req.method === 'POST' && ['/api/player/import', '/api/remote/browser'].includes(url.pathname)) {
        if (!req.headers.origin || req.headers['x-ttrc-action'] !== 'profile') return json(403, { error: 'Action not allowed.' });
        if (url.pathname === '/api/remote/browser') {
          if (!remote) return json(503, { error: 'Website unavailable.' });
          return json(200, { url: await remote.browserLink(await getIdentity()) });
        }
        let body = '';
        for await (const chunk of req) { body += chunk; if (body.length > 4096) return json(413, { error: 'Player file is too large.' }); }
        try { await importPlayer(JSON.parse(body)); }
        catch { return json(400, { error: 'Use the user.json downloaded from this challenge website. It may be expired, modified, or the website may be offline.' }); }
        return json(200, { ok: true });
      }
      if (req.method === 'POST' && url.pathname === '/api/submissions') {
        if (!remote || !req.headers.origin || req.headers['x-ttrc-action'] !== 'submit') return json(403, { error: 'Action not allowed.' });
        const identity = await getIdentity();
        if (!identity) return json(401, { error: 'Sign in first.' });
        let body = '';
        for await (const chunk of req) { body += chunk; if (body.length > 3 * 1024 * 1024) return json(413, { error: 'Replay must be under 2 MB.' }); }
        const input = JSON.parse(body), run = store.run(input.id, identity.id, challenge.id);
        if (!run) return json(404, { error: 'Local run not found for this player and seed.' });
        if (run.exclusionReason) return json(409, { error: run.exclusionReason });
        const saved = store.replay(run.id);
        let bytes, name;
        if (input.replay === undefined) {
          if (!saved || !replays?.savedBytes) return json(409, { error: 'The matching replay is not ready yet. Exit the results screen and wait a moment.' });
          bytes = await replays.savedBytes(saved.sha256);
          name = saved.name;
        } else {
          bytes = Buffer.from(typeof input.replay === 'string' ? input.replay : '', 'base64');
          name = typeof input.name === 'string' ? input.name.slice(0, 120) : 'replay.slp';
        }
        if (bytes.length > MAX_REPLAY_BYTES) return json(413, { error: 'Replay must be under 2 MB.' });
        try { const details=inspectReplay(bytes, run, gecko); if(details.pauseFrames>0){store.exclude(run.id,'Paused during the run. Excluded from records and submissions.');return json(409,{error:'Paused runs cannot be submitted.'});} } catch (error) { return json(400, { error: error.message }); }
        if (input.replay !== undefined && replays?.remember) {
          const snapshot = await replays.remember(bytes);
          store.attachReplay(run.id, snapshot.sha256, name);
        }
        await remote.enqueue({ ...run, identity, challenge }, bytes, name);
        return json(202, { ok: true });
      }
      if (req.method === 'GET' && files.has(url.pathname)) {
        const [name, type] = files.get(url.pathname);
        res.writeHead(200, { 'Content-Type': type });
        return res.end(await readFile(new URL(`../web/${name}`, import.meta.url)));
      }
      if (req.method === 'GET' && url.pathname === '/api/runs') {
        const identity = await getIdentity();
        if (!identity) return json(401, { error: 'Sign in first.' });
        const character = url.searchParams.get('character'), offset = Number(url.searchParams.get('offset') || 0);
        if (!stages.includes(character) || !Number.isInteger(offset) || offset < 0 || offset > 1000000) return json(400, { error: 'Invalid history request.' });
        return json(200, { runs: store.characterHistory(challenge.id, identity.id, character, offset) });
      }
      if (req.method === 'GET' && url.pathname === '/api/dashboard') {
        const character = url.searchParams.get('character') || 'fox';
        if (!stages.includes(character)) return json(400, { error: 'Unknown character.' });
        const identity = await getIdentity();
        const player = identity;
        return json(200, {
          challenge, identity, player, auth: { mode: 'password', configured: true, connection: account?.status(), account: identity ? { name: identity.displayName, linked: true } : null }, capture: getCapture(), scope: 'local', character,
          remote: remote?.status(identity) || { available: false, paired: false, pending: 0 },
          settings: getPlaySettings?.() || null,
          challengeUpdate:onlineChallenge?.status()||null,
          setup: onboarding?.get() || {ready:true},
          leaderboard: [], stats: store.stats(challenge.id),
          history: player ? store.history(challenge.id, player.id) : [],
          bestRuns: player ? store.bestRuns(challenge.id, player.id, {includeExcluded:true}) : [],
          progress: player ? store.progress(challenge.id, player.id) : {},
          personalBest: player ? store.personalBest(challenge.id, character, player.id) : null,
        });
      }
      if (req.method === 'GET' && url.pathname === '/api/challenge/code') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="TTRC-${challenge.rules.seed}.txt"` });
        return res.end(gecko);
      }
      if (req.method === 'POST' && url.pathname === '/api/launch') {
        // Local action, only from our own UI. No arbitrary executable or path input.
        if (req.headers['x-ttrc-action'] !== 'launch' || !req.headers.origin) {
          return json(403, { error: 'Launch not allowed.' });
        }
        return json(200, await launch());
      }
      return json(404, { error: 'Resource not found.' });
    } catch (error) {
      if (error instanceof ReplayError) return json(400, { error: error.message });
      // Never return exception contents: those may contain a local file or credentials.
      return json(500, { error: 'Action failed. Check that the challenge is prepared and Dolphin is available.' });
    }
  });
  return server;
}

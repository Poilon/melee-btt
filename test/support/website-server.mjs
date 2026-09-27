import { artworkFiles } from '../../shared/artwork.mjs';
// In-memory fixtures: never read the real player file, score DB or reviewer key.
import { generateChallenge } from '../../src/challenge.mjs';
import { parsePlayer, playerIdentity } from '../../server/player.mjs';
import { ScoreStore } from '../../server/store.mjs';
import { CompanionAccount } from '../../server/account.mjs';
import { createApp } from '../../server/app.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createCloudHandler } from '../../cloud/backend.mjs';
const generated = await generateChallenge({ seed: 20260989 });
// The upstream DK fixture is a vanilla course. Only this isolated test seed uses it.
const challenge = { ...generated.manifest, assignments: { ...generated.manifest.assignments, 'donkey-kong': 'donkey-kong' } }, gecko = generated.gecko;
const origin = 'http://localhost:4319', reviewerKey = 'd'.repeat(64);
const rows = new Map(), versions = new Map();
const memory = {
  async get(path) { return rows.get(path)?.value ?? null; },
  async put(path, value, overwrite = false) { if (!overwrite && rows.has(path)) throw new Error('Exists'); rows.set(path, { value: structuredClone(value), uploadedAt: new Date() }); versions.set(path, (versions.get(path) || 0) + 1); },
  async readVersion(path) { return rows.has(path) ? {value: structuredClone(rows.get(path).value), etag: versions.get(path)} : null; },
  async writeVersion(path,value,etag) { if(versions.get(path)!==etag)return false; await this.put(path,value,true);return true; },
  async delete(path) { rows.delete(path); },
  async list(prefix) { return [...rows].filter(([p]) => p.startsWith(prefix)).map(([pathname, row]) => ({ pathname, uploadedAt: row.uploadedAt })); },
};
const publicHandler = createCloudHandler({ store: memory, challenge, gecko, origin, secret: 'test-only', reviewerKey, allowLegacySignup: true });
const staticFiles = { ...Object.fromEntries(artworkFiles), '/': ['index.html','text/html'], '/review': ['review.html','text/html'], ...Object.fromEntries(['app.js','time.js','review.js'].map(p=>['/'+p,[p,'text/javascript']])), ...Object.fromEntries(['style.css','review.css'].map(p=>['/'+p,[p,'text/css']])), '/target.svg':['target.svg','image/svg+xml'] };
await new Promise(resolve => createServer(async (req, res) => {
  if (req.url.startsWith('/api/')) return publicHandler(req, res);
  const path = new URL(req.url, origin).pathname;
  const file = path.startsWith('/players/') ? staticFiles['/'] : staticFiles[path];
  if (!file) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': file[1] }); res.end(await readFile(new URL(`../../web/${file[0]}`, import.meta.url)));
}).listen(4319, '127.0.0.1', resolve));
const created = await fetch(origin+'/api/players/create', { method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({displayName:'Browser Test'}) });
let player = (await created.json()).playerFile, currentIdentity = playerIdentity(player);
const store = new ScoreStore(':memory:');
store.add({ challenge, identity: currentIdentity, character: 'fox', stage:'samus', frames:1234 });
const dkBest=store.add({ challenge, identity: currentIdentity, character:'donkey-kong',stage:'donkey-kong',frames:1190 });
const dkOld=store.add({ challenge, identity: currentIdentity, character:'donkey-kong',stage:'donkey-kong',frames:1300 });
for(const id of [dkBest,dkOld])store.attachReplay(id,'b'.repeat(64),'record.slp');
const remote = {
  status: () => ({ available:true,paired:true,pending:0 }),
  publicRun:async(id,playerId,replay=false)=>{const response=await fetch(`${origin}/api/shared/${replay?'replay':'run'}?id=${id}&playerId=${playerId}`);if(!response.ok)throw Error('Not public');return replay?Buffer.from(await response.arrayBuffer()):response.json();},
  browserLink:async()=>{const response=await fetch(origin+'/api/companion/browser',{method:'POST',headers:{Authorization:`Bearer ${player.token}`}});return (await response.json()).url;},
  enqueue: async (run, replay, name) => {
    const response = await fetch(origin+'/api/submissions',{method:'POST',headers:{Authorization:`Bearer ${player.token}`,'Content-Type':'application/json'},body:JSON.stringify({id:run.id,challengeId:challenge.id,geckoSha256:challenge.geckoSha256,character:run.character,stage:run.stage,frames:run.frames,replay:replay.toString('base64')})});
    if(!response.ok)throw new Error('Submission failed');
    store.setSubmission(run.id,'pending','Awaiting human review',name);
  }
};
const account = new CompanionAccount({ origin, accept: async file => { player = parsePlayer(file, origin); currentIdentity = playerIdentity(player); }, signOut: async () => { currentIdentity = null; } });
setInterval(() => account.poll(), 100);
let playSettings={music:true,rumble:true};
createApp({ challenge, gecko, store, remote, account,
  getPlaySettings:()=>({...playSettings}),savePlaySettings:async value=>(playSettings={...value}),
  replays: {
    list: async()=>[{id:'a'.repeat(64),name:'record.slp',character:'donkey-kong',stage:'donkey-kong',ready:true}],
    launch: async id=>{if(id!=='a'.repeat(64))throw new Error('Unexpected replay');return {status:'started'};},
    savedBytes: async sha=>{if(sha!=='b'.repeat(64))throw new Error('Unexpected replay');return readFile(new URL('../fixtures/BTTDK.slp',import.meta.url));},
    remember: async bytes=>({sha256:'b'.repeat(64)}),
    launchSaved: async sha=>{if(sha!=='b'.repeat(64))throw new Error('Unexpected replay');return {status:'started'};},
    launchBytes: async bytes=>{if(bytes.length<16)throw new Error('Missing replay evidence');return {status:'started'};},
  }, getIdentity: async () => currentIdentity,
  importPlayer: async value => {
    const file = parsePlayer(value, origin);
    const response = await fetch(origin+'/api/companion/me', { headers: { Authorization: `Bearer ${file.token}` } });
    const profile = await response.json();
    if (profile.playerId !== file.id || profile.displayName !== file.displayName) throw new Error('Invalid file');
    player = file; currentIdentity = playerIdentity(file);
  },
  reviewerProxy: (path,query,method,body)=>fetch(`${origin}/api/${path}${query}`,{method,headers:{Authorization:`Bearer ${reviewerKey}`,Origin:origin,'Content-Type':'application/json'},...(body?{body}:{})}),
  getCapture: () => ({ status: 'waiting' }), launch: async () => ({ status: 'started' }),
}).listen(4318, '127.0.0.1');

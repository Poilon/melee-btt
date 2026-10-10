import { mkdir, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { generateChallenge } from '../src/challenge.mjs';
import {WEEKLY_ENGINES} from '../shared/browser-weekly.mjs';
import {readSources} from '../src/upstream.mjs';

const root = resolve(import.meta.dirname, '..');
const out = join(root, '.deploy');
const source = join(root, 'build/challenge');
const saved = JSON.parse(await readFile(join(source, 'challenge.json'), 'utf8'));
const generated = await generateChallenge(saved.rules);
if (generated.manifest.id !== saved.id || generated.gecko !== await readFile(join(source, 'code.txt'), 'utf8')) throw new Error('Défi incohérent.');
for (const name of ['public', 'api', 'cloud', 'challenge', 'shared','src','generator-sources']) {
  await rm(join(out, name), { recursive: true, force: true });
  await mkdir(join(out, name), { recursive: true });
}
// Explicit allowlist: no ISO, user.json, database, credentials, or local tools.
await cp(join(root, 'web'), join(out, 'public'), { recursive: true });
// Official browser BTT is built independently from the Dolphin/custom stages.
const browserBundle = process.env.MELEE_BROWSER_BTT_BUILD || join(root, '../melee-browser/build/btt-site/play');
await cp(browserBundle, join(out, 'public/play'), { recursive: true });
// A weekly competition keeps its original engine across later deployments.
for(const {engine} of WEEKLY_ENGINES){
  const metadata=JSON.parse(await readFile(join(browserBundle,'native/versions',engine,'build.json'),'utf8'));
  if(metadata.sha256!==engine)throw new Error('Weekly engine archive mismatch: '+engine);
}

// The leaderboard, game toolbar and saved-run list must use Melee's timer.
if (await readFile(join(browserBundle, 'shared/btt-time.mjs'), 'utf8') !== await readFile(join(root, 'web/time.js'), 'utf8'))
  throw new Error('Browser BTT timer formatter is out of sync with the website.');
// Browser and server must validate the same version of the replay format.
if (await readFile(join(browserBundle, 'shared/btt-replay.mjs'), 'utf8') !== await readFile(join(root, 'shared/browser-btt-replay.mjs'), 'utf8'))
  throw new Error('Browser replay parser is out of sync. Copy melee-browser/shared/btt-replay.mjs to shared/browser-btt-replay.mjs and rebuild.');
await cp(join(root, 'cloud'), join(out, 'cloud'), { recursive: true });
await cp(join(root, 'shared'), join(out, 'shared'), { recursive: true });
await cp(join(root, 'src'), join(out, 'src'), { recursive: true });
for(const [name,source] of Object.entries(await readSources()))await writeFile(join(out,'generator-sources',name),source);
await writeFile(join(out, 'challenge/challenge.json'), JSON.stringify(generated.manifest));
await writeFile(join(out, 'challenge/code.txt'), generated.gecko);
await writeFile(join(out, 'api/index.mjs'), "export { default } from '../cloud/entry.mjs';\n");
const pkg = JSON.parse(await readFile(join(root, 'package.json')));
await writeFile(join(out, 'package.json'), JSON.stringify({ name: 'target-test-randomizer-challenge', private: true, type: 'module',
  engines: { node: '24.x' }, dependencies: { '@vercel/blob': pkg.dependencies['@vercel/blob'], '@slippi/slippi-js': pkg.dependencies['@slippi/slippi-js'] } }, null, 2));
await writeFile(join(out, 'vercel.json'), JSON.stringify({
  framework: null, outputDirectory: 'public', installCommand: 'npm install --omit=dev', buildCommand: '',
  functions: { 'api/index.mjs': { includeFiles: '{challenge/**,generator-sources/**,src/gecko/**,cloud/worlds-catalog.json,cloud/worlds-first-challenge.json}', maxDuration: 30 } },
  rewrites: [{ source: '/play', destination: '/play/index.html' }, { source: '/editor', destination: '/editor/index.html' }, { source: '/review', destination: '/review.html' }, { source: '/players/:slug', destination: '/legacy-challenge.html' }, { source: '/api/:route*', destination: '/api/index?route=:route*' }],
  headers: [{ source: '/(.*)', headers: [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'no-referrer' },
    { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' blob:; media-src 'self' blob:; connect-src 'self' wss://melee-browser-relay.fly.dev; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" },
  ] }, { source: '/play/:path*', headers: [
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
    { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; connect-src 'self' ws://127.0.0.1:4326 wss://melee-browser-relay.fly.dev; img-src 'self' blob:; worker-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'" },
  ] }, { source: '/play/', headers: [
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
    { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; connect-src 'self' ws://127.0.0.1:4326 wss://melee-browser-relay.fly.dev; img-src 'self' blob:; worker-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'" },
  ] },
  { source: '/play/:path*.mjs', headers: [{ key: 'Content-Type', value: 'text/javascript; charset=utf-8' }] },
  { source: '/play/btt-game/:asset*.blob', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
  { source: '/editor', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
  { source: '/editor/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }] }],
}, null, 2));
await writeFile(join(out, '.vercelignore'), '.env*\nnode_modules\n');
console.log(`Version publique préparée dans ${out} ; seed ${saved.rules.seed}. Aucun fichier local privé inclus.`);

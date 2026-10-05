import { mkdir, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { generateChallenge } from '../src/challenge.mjs';
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
  rewrites: [{ source: '/editor', destination: '/editor/index.html' }, { source: '/review', destination: '/review.html' }, { source: '/players/:slug', destination: '/legacy-challenge.html' }, { source: '/api/:route*', destination: '/api/index?route=:route*' }],
  headers: [{ source: '/(.*)', headers: [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'no-referrer' },
    { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" },
  ] }, { source: '/editor', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
  { source: '/editor/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }] }],
}, null, 2));
await writeFile(join(out, '.vercelignore'), '.env*\nnode_modules\n');
console.log(`Version publique préparée dans ${out} ; seed ${saved.rules.seed}. Aucun fichier local privé inclus.`);

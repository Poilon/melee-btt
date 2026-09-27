import { mkdir, writeFile, rename } from 'node:fs/promises';
import { revision, root, sources, verifySource } from '../src/upstream.mjs';

// Pin the upstream generator instead of silently changing shared challenges.
const folder = new URL('.cache/bttrandomizer/', root);
await mkdir(folder, { recursive: true });
for (const name of Object.keys(sources)) {
  const url = `https://raw.githubusercontent.com/djwang88/djwang88.github.io/${revision}/${name}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} : téléchargement de ${name}`);
  const data = Buffer.from(await response.arrayBuffer());
  verifySource(name, data);
  await writeFile(new URL(`${name}.tmp`, folder), data);
  await rename(new URL(`${name}.tmp`, folder), new URL(name, folder));
  console.log(`${name} : téléchargé et vérifié`);
}
console.log('Générateur BTT de djwang88 prêt. La génération fonctionne maintenant hors ligne.');

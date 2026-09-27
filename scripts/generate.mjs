import { parseArgs } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { generateChallenge, stages } from '../src/challenge.mjs';

try {
  const { values } = parseArgs({ options: {
    seed: { type: 'string', default: '20260989' },
    stage: { type: 'string', default: 'all' },
    targets: { type: 'string', default: '10' },
    'fixed-spawn': { type: 'boolean', default: false },
    'original-stages': { type: 'boolean', default: false },
    out: { type: 'string', default: 'build/challenge' },
    help: { type: 'boolean' },
  } });
  if (values.help) {
    console.log('npm run generate -- --seed 12345 [--stage all] --targets 10 [--fixed-spawn] [--original-stages] [--out dossier]');
    console.log('Par défaut : tous les personnages et stages mélangés. --original-stages désactive le mélange.');
    console.log(`Stages : all, ${stages.join(', ')}`);
  } else {
    const { manifest, gecko, ini } = await generateChallenge({
      seed: Number(values.seed), stage: values.stage, targets: Number(values.targets), spawn: !values['fixed-spawn'],
      mismatch: values.stage === 'all' && !values['original-stages'],
    });
    const out = resolve(values.out);
    await mkdir(out, { recursive: true });
    await writeFile(join(out, 'challenge.json'), JSON.stringify(manifest, null, 2) + '\n');
    await writeFile(join(out, 'code.txt'), gecko);
    await writeFile(join(out, 'GALE01.ini'), ini);
    await writeFile(join(out, 'parcours.txt'), Object.entries(manifest.assignments)
      .map(([character, stage]) => `${character} -> stage de ${stage}`).join('\n') + '\n');
    console.log(`Défi ${manifest.id.slice(0, 12)} — ${manifest.rules.stage} — seed ${manifest.rules.seed}`);
    console.log(`${manifest.rules.targets} cibles ; départ ${manifest.rules.spawn ? 'aléatoire' : 'original'} ; plateformes d’origine.`);
    console.log(`Fichiers : ${out}`);
    if (manifest.character) {
      console.log(`Choisis ${manifest.character} dans Target Test pour jouer ce parcours.`);
    } else {
      console.log('Tous les personnages sont jouables. Associations :');
      for (const character of stages) console.log(`  ${character} -> ${manifest.assignments[character]}`);
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

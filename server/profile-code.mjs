import { sha256 } from '../src/upstream.mjs';

export function verifyProfileCode(ini, expectedHash) {
  const blocks = new Map(); let section = '', current;
  for (const raw of ini.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('[')) { section = line; current = null; continue; }
    if (section !== '[Gecko]' || !line) continue;
    if (line.startsWith('$')) {
      if (blocks.has(line)) return false;
      current = []; blocks.set(line, current);
    } else if (current) current.push(line);
    else return false;
  }
  const challenge = blocks.get('$Target Test Randomizer Challenge');
  if (!challenge || sha256(challenge.join('\n') + '\n') !== expectedHash) return false;
  blocks.delete('$Target Test Randomizer Challenge');
  for (const [name, lines] of blocks) {
    if (name !== '$TTRC: Music off' || lines.join('\n') !== '04023FFC 38800000') return false;
  }
  return true;
}

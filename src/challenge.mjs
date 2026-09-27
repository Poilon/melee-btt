import vm from 'node:vm';
import { readSources, revision, sha256 } from './upstream.mjs';
import {createMotionPlan,motionGecko} from './target-motion.mjs';

export const stages = Object.freeze([
  'dr-mario', 'mario', 'luigi', 'bowser', 'peach', 'yoshi', 'donkey-kong',
  'captain-falcon', 'ganondorf', 'falco', 'fox', 'ness', 'ice-climbers',
  'kirby', 'samus', 'zelda', 'link', 'young-link', 'pichu', 'pikachu',
  'jigglypuff', 'mewtwo', 'game-and-watch', 'marth', 'roy',
]);
export const codeName = 'Target Test Randomizer Challenge';
export const generatorVersion = 'ttrc-btt3-v2';

export function normalizeRules({ seed, stage = 'all', targets = 10, spawn = true, mismatch = stage === 'all', moving = false } = {}) {
  if (!Number.isSafeInteger(seed) || seed < 1) {
    throw new Error('La seed doit être un entier entre 1 et 9007199254740991.');
  }
  if (stage !== 'all' && !stages.includes(stage)) throw new Error(`Stage inconnu : ${stage}`);
  // Keep the first prototype small enough for Gecko, and the normal target counter.
  if (!Number.isInteger(targets) || targets < 1 || targets > 10) {
    throw new Error('Ce prototype accepte entre 1 et 10 cibles.');
  }
  if (typeof spawn !== 'boolean') throw new Error('spawn doit être un booléen.');
  if (typeof mismatch !== 'boolean') throw new Error('mismatch doit être un booléen.');
  if (typeof moving !== 'boolean') throw new Error('moving doit être un booléen.');
  if (mismatch && stage !== 'all') throw new Error('Le mélange personnage/stage nécessite --stage all.');
  return { seed, stage, targets, spawn, mismatch, weighted: true, moving };
}

export function validateGecko(code) {
  const lines = code.trim().split('\n');
  if (lines.some(line => !/^[0-9A-F]{8} [0-9A-F]{8}$/.test(line))) {
    throw new Error('Le générateur a renvoyé un code Gecko mal formé.');
  }
  // Check C2 payload boundaries, not the instruction bytes within those payloads.
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('C2')) {
      const size = parseInt(lines[i].slice(9), 16);
      if (size === 0 || i + size >= lines.length) throw new Error('Injection C2 tronquée.');
      if (!lines[i + size].endsWith(' 00000000')) throw new Error('Fin C2 invalide.');
      i += size;
    }
  }
  if (lines.length * 8 > 8192) throw new Error('Code trop volumineux (8 KiB maximum).');
}

export async function generateChallenge(input) {
  const rules = normalizeRules(input);
  const source = await readSources();
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, { value: '', checked: false, style: {} });
    return elements.get(selector);
  };
  element('#options-div').style.display = 'block';
  element('#stage').value = rules.stage === 'all' ? 'all' : String(stages.indexOf(rules.stage));
  element('#num-targets').value = String(rules.targets);
  element('#spawn').checked = rules.spawn;
  element('#weighted').checked = true;
  element('#impossible-checkbox').checked = true;
  element('#mismatch-checkbox').checked = rules.mismatch;
  // defaultCodes already includes boot to Target Test and unlocks. Leave the
  // optional speedrun pack off: normal countdown, HUD and pause behaviour.
  // The upstream browser glue is satisfied locally; no Firebase request occurs.
  const database = () => ({ ref: () => ({ on() {}, update() {} }) });
  database.ServerValue = { increment: value => value };
  const context = vm.createContext({
    document: {
      querySelector: element, createElement: () => ({}), body: { appendChild() {} },
    },
    firebase: { initializeApp() {}, database },
    inputSeed: rules.seed,
    motionEnabled: rules.moving,
  }, { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(source['seedrandom.js'], context, { timeout: 2000 });
  vm.runInContext(source['randomizer.js'], context, { timeout: 2000 });
  // Capture the SAME mapping used by upstream to encode the stage-selection
  // hook and to exclude targets the assigned character cannot reach. Calling
  // getMismatchCode a second time would advance the RNG and report another map.
  vm.runInContext(`
    globalThis.targetCaptures = [];
    const originalGetValidCoordinates = getValidCoordinates;
    getValidCoordinates = function (...args) {
      for(let attempt=0;attempt<1000;attempt++){
        const result = originalGetValidCoordinates(...args);
        const packed=coordsToHalfWords(result.x,result.y);
        const signed=h=>{const n=parseInt(h,16);return (n>=32768?n-65536:n)/64;};
        const x=signed(packed.slice(0,4)),y=signed(packed.slice(4));
        if(motionEnabled&&targetCaptures.some(c=>c.stage===args[0]&&Math.hypot(c.x-x,c.y-y)<8))continue;
        globalThis.targetCaptures.push({stage:args[0],packed,x,y,randomExclusions:args[4]});
        return result;
      }
      throw new Error('Cannot space targets safely; choose another seed.');
    };
    const originalGetMismatchCode = getMismatchCode;
    getMismatchCode = function () {
      const result = originalGetMismatchCode();
      globalThis.stageToCharacter = result.map.slice();
      return result;
    };
    randomize(inputSeed, 3);
  `, context, { timeout: 5000 });
  let gecko = element('#result').value.trim().toUpperCase() + '\n';
  let motion;
  if(rules.moving){
    const geometries=JSON.parse(vm.runInContext(`JSON.stringify(bounds.map((b,i)=>({
      bounds:newBounds[i]||b,
      mismatch:mismatchExclusions[i]?.[globalThis.stageToCharacter?.[i]??i]||[],
      exceptions:exceptions[i]||[],
      excluded:[...(exclusions[i]||[]),...(newExclusions[i]||[]),
        ...(targetCaptures.find(c=>c.stage===i)?.randomExclusions&&randomExclusions[i]?[randomExclusions[i].slice(1)]:[])]
    })))`,context,{timeout:1000}));
    motion=createMotionPlan(rules.seed,stages,Array.from(context.targetCaptures),geometries);
    gecko+=motionGecko(motion,stages);
  }
  validateGecko(gecko);
  const assignments = {};
  if (rules.mismatch) {
    const map = Array.from(context.stageToCharacter);
    if (map.length !== stages.length || new Set(map).size !== stages.length ||
        map.some(index => !Number.isInteger(index) || index < 0 || index >= stages.length)) {
      throw new Error('Association personnage/stage invalide.');
    }
    for (let stageIndex = 0; stageIndex < map.length; stageIndex++) {
      assignments[stages[map[stageIndex]]] = stages[stageIndex];
    }
  } else {
    for (const stage of rules.stage === 'all' ? stages : [rules.stage]) assignments[stage] = stage;
  }
  const identity = { generatorVersion:rules.moving?'ttrc-btt3-motion-v1':generatorVersion, upstreamRevision: revision, game: 'GALE01r2', rules, geckoSha256: sha256(gecko) };
  const manifest = {
    format: 'ttrc-challenge-v1',
    id: sha256(JSON.stringify(identity)),
    ...identity,
    bttSeed: element('#randomizer-id').value,
    character: rules.stage === 'all' ? null : rules.stage,
    assignments,
    geometry: 'original',
    ...(motion?{motion}:{}),
  };
  const ini = `[Gecko]\n$${codeName} [djwang88, Punkline; TTRC]\n${gecko}\n[Gecko_Enabled]\n$${codeName}\n`;
  return { manifest, gecko, ini };
}

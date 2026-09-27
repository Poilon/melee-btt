import test from 'node:test';
import assert from 'node:assert/strict';
import { generateChallenge, normalizeRules, stages, validateGecko } from '../src/challenge.mjs';
import { verifySource } from '../src/upstream.mjs';

test('same seed and rules produce exactly the same challenge across fresh contexts', async () => {
  const rules = { seed: 123456, stage: 'fox' };
  assert.deepEqual(await generateChallenge(rules), await generateChallenge(rules));
});

test('different seeds and rules cannot share a record identity', async () => {
  const cases = [
    { seed: 1 }, { seed: 2 }, { seed: 1, stage: 'marth' },
    { seed: 1, targets: 5 }, { seed: 1, spawn: false },
  ];
  const results = [];
  for (const rules of cases) results.push(await generateChallenge(rules));
  assert.equal(new Set(results.map(r => r.manifest.id)).size, cases.length);
  assert.notEqual(results[0].gecko, results[1].gecko);
});

test('all 25 original character stages generate bounded, well-formed Gecko', async () => {
  for (const stage of stages) {
    for (const targets of [1, 10]) {
      const result = await generateChallenge({ seed: 20260926, stage, targets });
      validateGecko(result.gecko);
      assert.equal(result.manifest.rules.mismatch, false);
      assert.equal(result.manifest.geometry, 'original');
      assert.match(result.gecko, /041BFA20 3860000F/); // Boot to Target Test.
    }
  }
});

test('invalid seeds, unsupported stages and oversized challenges fail early', () => {
  for (const seed of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '12']) {
    assert.throws(() => normalizeRules({ seed }));
  }
  for (const targets of [0, 11, 1.5, NaN]) assert.throws(() => normalizeRules({ seed: 1, targets }));
  assert.throws(() => normalizeRules({ seed: 1, stage: 'unknown' }));
  assert.throws(() => normalizeRules({ seed: 1, spawn: 'false' }));
  assert.throws(() => normalizeRules({ seed: 1, mismatch: 'true' }));
  assert.throws(() => normalizeRules({ seed: 1, stage: 'fox', mismatch: true }));
});

test('shuffled roster is reproducible and every character gets exactly one stage', async () => {
  const first = await generateChallenge({ seed: 20260926 });
  assert.deepEqual(first, await generateChallenge({ seed: 20260926 }));
  assert.equal(first.manifest.character, null);
  assert.equal(first.manifest.rules.mismatch, true);
  assert.deepEqual(Object.keys(first.manifest.assignments).sort(), [...stages].sort());
  assert.deepEqual(Object.values(first.manifest.assignments).sort(), [...stages].sort());
  assert.ok(stages.some(character => first.manifest.assignments[character] !== character));
  const next = await generateChallenge({ seed: 20260927 });
  assert.notDeepEqual(first.manifest.assignments, next.manifest.assignments);
  const original = await generateChallenge({ seed: 20260926, mismatch: false });
  assert.notEqual(first.manifest.id, original.manifest.id);
  for (const character of stages) assert.equal(original.manifest.assignments[character], character);
});

test('manifest assignments match the actual Gecko stage lookup table for all characters', async () => {
  // External character IDs and target-stage IDs from Melee USA 1.02.
  const characterIds = [0x16, 8, 7, 5, 12, 17, 1, 0, 25, 20, 2, 11, 32, 4, 16, 18, 6, 21, 24, 13, 15, 10, 3, 9, 23];
  const stageIds = [0x25, 0x21, 0x2c, 0x2a, 0x30, 0x36, 0x24, 0x22, 0x3a, 0x26, 0x27, 0x2f, 0x28,
    0x29, 0x34, 0x37, 0x2b, 0x23, 0x31, 0x32, 0x33, 0x2e, 0x38, 0x2d, 0x39];
  for (const seed of [1, 2, 20260926, 20260989]) {
    const { manifest, gecko } = await generateChallenge({ seed });
    if (seed === 20260989) {
      assert.equal(manifest.assignments.fox, 'samus');
      assert.ok(stages.every(character => manifest.assignments[character] !== character));
    }
    const lines = gecko.trim().split('\n');
    const hook = lines.indexOf('C21B659C 00000008');
    assert.ok(hook >= 0);
    const payload = Buffer.from(lines.slice(hook + 1, hook + 9).join('').replaceAll(' ', ''), 'hex');
    const table = payload.subarray(12, 45);
    for (let i = 0; i < stages.length; i++) {
      assert.equal(table[characterIds[i]], stageIds[stages.indexOf(manifest.assignments[stages[i]])]);
    }
  }
});

test('truncated injections and modified upstream files are rejected', () => {
  assert.throws(() => validateGecko('C2001234 00000002\n60000000 00000000\n'));
  assert.throws(() => validateGecko('not a Gecko code'));
  assert.throws(() => verifySource('randomizer.js', Buffer.from('changed')));
});

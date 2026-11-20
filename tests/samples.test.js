import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DAYS } from '../src/content.js';
import { sampleAppearance, sampleObservation } from '../src/samples.js';

const items = new Map(DAYS.flatMap(({ cases }) => cases.map((item) => [item.id, item])));

test('sample families use distinct front and rear art, including alternate batches', () => {
  const samples = [...items.values()].flatMap(({ sample, variants = [] }) => [sample, ...variants.map((variant) => ({ ...sample, ...variant.sample }))]);
  const families = new Map(samples.map((spec) => {
    const artwork = sampleAppearance(spec);
    assert.equal(artwork.key, spec.appearance);
    return [artwork.key, artwork];
  }));
  assert.deepEqual([...families.keys()].sort(), ['classic', 'clip', 'compact', 'earmuff', 'glove', 'shield', 'vented']);
  const hashes = new Set();
  for (const { stem } of families.values()) {
    for (const side of ['', '-back']) {
      const image = readFileSync(new URL(`../public/art/${stem}${side}.webp`, import.meta.url));
      assert.equal(image.toString('ascii', 8, 12), 'WEBP');
      hashes.add(createHash('sha256').update(image).digest('hex'));
    }
  }
  assert.equal(hashes.size, 14);
});

test('reinspection preserves product identity and physical clues follow what was inspected', () => {
  for (const [previous, returnId] of [[5, 9], [10, 14], [11, 13], [4, 15]]) {
    assert.equal(items.get(previous).sample.appearance, items.get(returnId).sample.appearance);
  }
  const clasp = items.get(12).variants[1].sample;
  assert.doesNotMatch(sampleObservation(clasp, { back: true }), /弹开/);
  assert.match(sampleObservation(clasp, { back: true, tug: true }), /弹.*开/);
  assert.match(sampleObservation(items.get(16).sample, { unpacked: true }), /泛黄留在包装袋/);
  assert.equal(sampleAppearance(items.get(10).sample).clasp, false);
  assert.equal(sampleAppearance(items.get(18).sample).clasp, false);
});

test('peeling film and pulling a rear clasp report only their respective observations', () => {
  const film = items.get(2).sample;
  const crack = items.get(4).sample;
  assert.equal(sampleObservation(film, { film: true }), '白痕随薄膜掀起。下方的镜片平整。');
  assert.match(sampleObservation(crack, { film: true }), /白纹还留在镜片上/);
  for (const sample of [film, crack]) {
    assert.doesNotMatch(sampleObservation(sample, {}), /掀起|留在镜片/);
    assert.match(sampleObservation(sample, { back: true, clasp: true, tug: true }), /扣上后轻拉，没有脱开/);
    assert.doesNotMatch(sampleObservation(sample, { back: true, film: true, tug: true }), /薄膜|膜角/);
  }

  const damagedClip = items.get(15).sample;
  assert.match(sampleObservation(damagedClip, { back: true }), /少了一截插片/);
  assert.doesNotMatch(sampleObservation(damagedClip, { back: true, clasp: true }), /弹开/);
  assert.match(sampleObservation(damagedClip, { back: true, clasp: true, tug: true }), /立刻弹开/);
});

test('the first G-205 delivery omits the entire report and the follow-up supplies it', () => {
  const first = items.get(5);
  const followup = items.get(9);
  assert.deepEqual(first.documents.map(({ type }) => type), ['label', 'order']);
  assert.equal(first.answer, 'review');
  assert.equal(followup.answer, 'pass');
  assert.equal(followup.batch, first.batch);
  assert.ok(followup.documents.some(({ type, fields }) => type === 'report' && fields.some(([, value]) => value === 'R-065')));
});

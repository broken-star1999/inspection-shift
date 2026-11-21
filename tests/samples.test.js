import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DAYS } from '../src/content.js';
import { gaugeArt, gaugeJawStyle } from '../src/gauge-art.js';
import { cuffSplitVisible, sampleAppearance, sampleFinding, sampleInGauge, sampleObservation } from '../src/samples.js';

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

test('the two G-208 models share a shell and disclose the marking when turned over', () => {
  const { sample, documents, variants } = items.get(8);
  const alternate = { ...sample, ...variants[1].sample };
  assert.deepEqual(sampleAppearance(alternate), sampleAppearance(sample));
  assert.equal(sampleObservation(alternate, {}), sampleObservation(sample, {}));
  assert.match(sampleObservation(sample, { back: true }), /内框刻字：型号 A/);
  assert.match(sampleObservation(alternate, { back: true }), /内框刻字：型号 B/);
  assert.ok(documents.find(({ type }) => type === 'order').fields.some(([name, value]) => name === '指定型号' && value === 'A'));
});

test('G-212 states the accepted pull behavior without distinguishing the samples before a tug', () => {
  const { sample, documents, variants } = items.get(12);
  const alternate = { ...sample, ...variants[1].sample };
  assert.deepEqual(sampleAppearance(alternate), sampleAppearance(sample));
  assert.ok(documents.find(({ type }) => type === 'order').fields.some(([name, value]) => name === '扣合要求' && /轻拉.*不得脱开/.test(value)));
  for (const inspection of [{}, { back: true }, { back: true, clasp: true }]) {
    assert.equal(sampleObservation(alternate, inspection), sampleObservation(sample, inspection));
  }
  assert.match(sampleObservation(sample, { back: true, clasp: true, tug: true }), /仍然闭合/);
  assert.match(sampleObservation(alternate, { back: true, clasp: true, tug: true }), /弹了开/);
});

test('G-218 keeps the reported, measured and allowed thickness in distinct sources', () => {
  const { documents, sample, title } = items.get(18);
  const papers = Object.fromEntries(documents.map(({ type, fields }) => [type, Object.fromEntries(fields)]));
  const observations = [title, sampleObservation(sample, {}), sampleObservation(sample, { back: true })].join(' ');
  assert.doesNotMatch(observations, /薄件|偏薄|低于|超差|1\.80|2\.00/);
  assert.equal(sample.reading, '1.80 mm');
  assert.equal(papers.report.厚度, '2.10 mm');
  assert.equal(papers.order.厚度范围, '2.00–2.20 mm');
  assert.equal(papers.report.厚度范围, undefined);
});

test('seating an insert exposes neither its reading nor its contact offset until the jaws close', () => {
  const { sample, variants } = items.get(18);
  const alternate = { ...sample, ...variants[1].sample };
  const seated = { gaugeLoaded: true, measured: false };
  assert.equal(sampleInGauge(sample, {}), false);
  assert.equal(sampleInGauge(sample, seated), true);
  assert.equal(sampleInGauge(sample, { measured: true }), true);
  const open = (spec) => gaugeArt(spec.reading, { loaded: true, measured: false });
  assert.equal(open(sample), open(alternate));
  assert.match(open(sample), /gauge-display[^>]*>—/u);
  assert.equal(gaugeJawStyle(sample.reading, false), '');
  assert.equal(gaugeJawStyle(alternate.reading, false), '');
  assert.match(gaugeJawStyle(sample.reading, true), /--gauge-contact-offset:-0\.8px/u);
  assert.match(gaugeJawStyle(alternate.reading, true), /--gauge-contact-offset:0\.4px/u);
  assert.doesNotMatch(sampleFinding(sample, seated).text, /1\.80 mm/u);
  assert.match(gaugeArt(alternate.reading, { loaded: true, measured: true }), /2\.10 mm/u);
});

test('G-216 only reveals each side of the glove after the bag is opened', () => {
  const { sample } = items.get(16);
  assert.equal(sampleObservation(sample, {}), sample.front);
  const oldInspection = { back: true, film: true, clasp: true, tug: true, unpacked: false };
  assert.equal(sampleObservation(sample, oldInspection), sample.front);
  assert.equal(sampleObservation(sample, { unpacked: true }), sample.unwrapped);
  assert.equal(sampleObservation(sample, { back: true, unpacked: true }), sample.back);
});

test('G-216 conceals a split cuff until the glove is unpacked and turned over', () => {
  const { sample, variants } = items.get(16);
  const split = { ...sample, ...variants[1].sample };
  assert.deepEqual(sampleAppearance(split), sampleAppearance(sample));
  for (const inspection of [{}, { back: true }, { unpacked: true }]) {
    assert.equal(cuffSplitVisible(split, inspection), false);
    assert.equal(sampleObservation(split, inspection), sampleObservation(sample, inspection));
  }
  const inspection = { unpacked: true, back: true };
  assert.equal(cuffSplitVisible(sample, inspection), false);
  assert.equal(cuffSplitVisible(split, inspection), true);
  assert.match(sampleObservation(sample, inspection), /缝线连续/);
  assert.match(sampleObservation(split, inspection), /脱线.*张开/);
});

test('sample notes identify the operation so one can be removed without losing the others', () => {
  const { sample } = items.get(2);
  const peeled = sampleFinding(sample, { film: true });
  const rear = sampleFinding(sample, { film: true, back: true });
  assert.equal(peeled.key, 'sample:揭膜后');
  assert.equal(rear.key, 'sample:背面');
  assert.match(peeled.text, /白痕随薄膜掀起/);
  assert.match(rear.text, /扣件/);
  assert.deepEqual(sampleFinding(sample, { film: true, back: false }), peeled);
  assert.equal(sampleFinding(items.get(16).sample, {}).key, 'sample:package');
  assert.equal(sampleFinding(items.get(16).sample, { unpacked: true }).key, 'sample:拆袋后');
  assert.deepEqual(sampleFinding(items.get(18).sample, { measured: true }), {
    key: 'sample:measure', source: '量规实测', text: '1.80 mm',
  });
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

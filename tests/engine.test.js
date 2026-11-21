import assert from 'node:assert/strict';
import test from 'node:test';
import { G205_SUPPLEMENT_REQUEST, PHONE, PRESSURE } from '../src/content.js';
import { intakeComparison, projectComparison, relabelComparison } from '../src/document-comparison.js';
import { archive, archivedReportSources, canRecheckReceipt, canShowFinding, createFollowingRun, createRun, dispatch, getCase, getDay, getEnding, getIncomingCall, getPhoneReportLookup, getPreviousReceipt, getReworkFollowup, getShipmentAcceptance, getShipmentException, getTraceInquiry, getWindowSupplementRequest, isSupplementOnly, receiptFeedback, restoreRun, shipmentIssueFeedback, TRACE_CASE_ID, TRACE_FINDING, TUTORIAL } from '../src/engine.js';

function act(state, type, details) {
  return dispatch(state, { type, ...details });
}

function takeRecallReceipt(state, id) {
  const delivered = act(state, 'receive-recall', { id });
  assert.equal(delivered.event?.caseId, id);
  return act(delivered, 'ack-visit');
}

function untilHandoff(seed, { decisions = {}, inspect = (state) => state, initialState = createRun(seed) } = {}) {
  let state = initialState;
  while (state.phase !== 'handoff') {
    if (state.phase !== 'case' && state.event) state = act(state, 'ack-visit');
    else if (state.phase === 'brief') state = act(state, 'start-day');
    else if (state.phase === 'summary') state = act(state, 'advance-day');
    else if (state.phase === 'case') {
      const item = getCase(state);
      if (item.id === 1) {
        for (const { key } of TUTORIAL.slice(0, -1)) state = act(state, 'tutorial', { key });
      }
      state = inspect(state, item);
      while (state.event) state = act(state, 'ack-visit');
      state = act(state, 'stamp', { value: decisions[item.id] ?? item.answer });
    } else state = act(state, 'next');
  }
  return state;
}

function receiptAt(id, value, { seed = 21, decisions = {}, findings, inspect = (state) => state } = {}) {
  let receipt;
  untilHandoff(seed, { decisions, inspect: (state, item) => {
    const prepared = inspect(state, item);
    if (item.id === id) {
      let ready = prepared;
      while (ready.event) ready = act(ready, 'ack-visit');
      receipt = act(ready, 'stamp', { value, findings });
    }
    return prepared;
  } });
  return receipt;
}

function tuesdayClosingReceipt() {
  let receipt;
  untilHandoff(21, { inspect: (state, item) => {
    if (state.day === 1 && state.index === 3) receipt = act(state, 'stamp', { value: item.answer });
    return state;
  } });
  return receipt;
}

test('first stamp stays at the desk until all four guided checks are done', () => {
  const initial = createRun(4);
  let state = act(initial, 'start-day');
  assert.equal(initial.records.length, 0);
  assert.equal(getCase(state).id, 1);
  assert.equal(act(state, 'stamp', { value: 'pass' }), state);
  assert.equal(act(state, 'tutorial', { key: 'sample' }), state);
  for (const { key } of TUTORIAL.slice(0, -1)) state = act(state, 'tutorial', { key });
  state = act(state, 'stamp', { value: 'pass' });
  assert.equal(state.phase, 'receipt');
  assert.equal(state.records[0].decision, 'pass');
  assert.equal(Object.hasOwn(state.records[0], 'findings'), false);
  assert.equal(act(state, 'stamp', { value: 'pass' }), state);
  assert.equal(getCase(act(state, 'next')).id, 2);
});

test('an experienced week can begin without a previous snapshot and stamp the first case immediately', () => {
  const seed = 'experienced replay';
  const original = createRun(seed);
  const experienced = createFollowingRun(null, seed);
  assert.deepEqual(experienced, { ...original, sampleSet: 4, replayDocuments: true, replayCartons: true, tutorial: TUTORIAL.length });
  const first = act(experienced, 'start-day');
  assert.equal(getCase(first).id, 1);
  const stamped = act(first, 'stamp', { value: 'pass' });
  assert.equal(stamped.phase, 'receipt');
  assert.equal(stamped.records[0].id, 1);
});

const specimenVariants = (state, ids = [3, 8, 12, 16, 18]) => Object.fromEntries(
  archive(state).filter(({ id }) => ids.includes(id)).map(({ id, variant }) => [id, variant]),
);

test('an experienced replay changes one specimen when all five would match and keeps the new seed', () => {
  const seed = 0;
  const previous = act(untilHandoff(seed), 'finish');
  const replay = createFollowingRun(previous, seed);
  assert.equal(replay.seed, seed);
  assert.deepEqual(replay.flags, createRun(seed).flags);
  assert.ok([3, 8, 12, 16, 18].includes(replay.variantOverride.caseId));
  const played = untilHandoff(seed, { initialState: JSON.parse(JSON.stringify(replay)) });
  const priorVersions = specimenVariants(previous);
  const newVersions = specimenVariants(played);
  assert.equal(Object.keys(priorVersions).length, 5);
  assert.equal(Object.entries(newVersions).filter(([id, variant]) => variant !== priorVersions[id]).length, 1);
  const next = createFollowingRun(act(played, 'finish'), seed);
  assert.equal(next.variantOverride, undefined);
  assert.deepEqual(specimenVariants(untilHandoff(seed, { initialState: next })), priorVersions);
});

test('G-203 keeps the normal mold line in first and legacy weeks, but can split at the seam on replay', () => {
  function inspectEarCup(initialState) {
    let observed;
    const week = untilHandoff(initialState.seed, { initialState, inspect: (state, item) => {
      if (item.id !== 3) return state;
      const resumed = restoreRun(JSON.parse(JSON.stringify(state)));
      observed = getCase(resumed);
      assert.deepEqual(observed, item);
      return resumed;
    } });
    assert.equal(week.records.find(({ id }) => id === 3).answer, observed.answer);
    return observed;
  }

  const firstWeek = createRun(1);
  const normal = inspectEarCup(firstWeek);
  const replayNormal = inspectEarCup(createFollowingRun(null, 0));
  const replaySplit = inspectEarCup(createFollowingRun(null, 1));
  assert.equal(normal.variant, 0);
  assert.equal(normal.answer, 'pass');
  assert.deepEqual(replayNormal.sample, normal.sample);
  assert.equal(replaySplit.variant, 1);
  assert.equal(replaySplit.answer, 'fail');
  assert.equal(replaySplit.sample.earCupSplit, true);
  assert.equal(replaySplit.sample.kind, 'line');
  assert.equal(replaySplit.sample.appearance, normal.sample.appearance);
  assert.equal(replaySplit.documents, normal.documents);
  assert.equal(replaySplit.documents[2].kind, 'mold-sketch');
  assert.equal(replaySplit.npc, normal.npc);
  assert.equal(replaySplit.line, normal.line);

  const { sampleSet: _sampleSet, ...legacy } = firstWeek;
  for (const priorSet of [legacy, { ...legacy, sampleSet: 2 }, { ...legacy, sampleSet: 3 }]) {
    const restored = inspectEarCup({ ...priorSet, variantOverride: { caseId: 3, index: 1 } });
    assert.equal(restored.variant, 0);
    assert.deepEqual(restored.sample, normal.sample);
  }
});

test('when replay would repeat every sample, the deterministic override can choose G-203 alone', () => {
  const seed = 25;
  const original = act(untilHandoff(seed), 'finish');
  const replay = createFollowingRun(original, seed);
  assert.deepEqual(replay.variantOverride, { caseId: 3, index: 1 });
  const next = untilHandoff(seed, { initialState: JSON.parse(JSON.stringify(replay)) });
  assert.deepEqual(specimenVariants(next), { ...specimenVariants(original), 3: 1 });
  assert.deepEqual(next.records.map(({ id }) => id), original.records.map(({ id }) => id));
  assert.deepEqual(next.flags, original.flags);
});

test('G-206 replay checks the report against the original box, with the same current box and sample', () => {
  function inspectReboxing(initialState, decision) {
    let atWindow;
    const week = untilHandoff(initialState.seed, { initialState, decisions: { 6: decision }, inspect: (state, item) => {
      if (item.id !== 6) return state;
      atWindow = restoreRun(JSON.parse(JSON.stringify(state)));
      assert.deepEqual(getCase(atWindow), item);
      return atWindow;
    } });
    return { atWindow, item: getCase(atWindow), week, row: archive(week).find(({ id }) => id === 6) };
  }

  const normal = inspectReboxing(createFollowingRun(null, 0));
  const wrongReport = inspectReboxing(createFollowingRun(null, 2));
  assert.equal(normal.item.variant, 0);
  assert.equal(wrongReport.item.variant, 1);
  assert.equal(wrongReport.item.line, normal.item.line);
  assert.equal(wrongReport.item.npc, normal.item.npc);
  assert.deepEqual(wrongReport.item.sample, normal.item.sample);
  assert.deepEqual(wrongReport.item.documents, [normal.item.documents[0], {
    ...normal.item.documents[1], fields: [['批号', 'G-160'], ...normal.item.documents[1].fields.slice(1)],
  }, normal.item.documents[2]]);

  const compare = relabelComparison(wrongReport.item, 2);
  assert.deepEqual(compare.pairs.map(({ side, left, right }) => [side, left.value, right.value]), [
    ['original', 'G-160', 'G-106'], ['current', 'G-206', 'G-206'],
  ]);
  const finding = compare.pairs[0].finding;
  assert.equal(finding.key, 'compare:6:relabel:2:1:original');
  const held = act(wrongReport.atWindow, 'stamp', { value: 'review', findings: [finding] });
  assert.deepEqual(held.records.at(-1).findings, [finding]);
  assert.deepEqual([normal.row.record.answer, normal.row.record.status], ['pass', 'shipped']);
  assert.deepEqual([wrongReport.row.record.answer, wrongReport.row.record.status], ['review', 'held']);
  assert.deepEqual(archive(wrongReport.week, 'G-160').map(({ id }) => id), [6]);
  const restoredWeek = restoreRun(JSON.parse(JSON.stringify(wrongReport.week)));
  const [source] = archivedReportSources(restoredWeek, 'R-066');
  assert.deepEqual([source.id, source.index, source.document], [6, 1, wrongReport.item.documents[1]]);
  assert.equal(getEnding(act(wrongReport.week, 'finish')).id, 'routine');

  const hurried = inspectReboxing(createFollowingRun(null, 2), 'pass');
  assert.equal(hurried.row.record.status, 'shipped');
  const ending = getEnding(act(hurried.week, 'finish'));
  assert.equal(ending.id, 'issue');
  assert.deepEqual(ending.issues.map(({ id }) => id), [6]);

  const { replayDocuments: _documentMarker, ...oldReplay } = createFollowingRun(null, 2);
  for (const oldRun of [createRun(2), oldReplay]) {
    const old = inspectReboxing(oldRun);
    assert.equal(old.item.variant, 0);
    assert.deepEqual(old.row.documents, normal.row.documents);
    assert.deepEqual([old.row.record.answer, old.row.record.status], ['pass', 'shipped']);
  }
});

test('G-217 replay keeps the papers and sample the same while the actual carton code changes', () => {
  function inspectCarton(initialState, decision) {
    let item;
    const week = untilHandoff(initialState.seed, { initialState, decisions: { 17: decision }, inspect: (state, arrived) => {
      if (arrived.id !== 17) return state;
      const restored = restoreRun(JSON.parse(JSON.stringify(state)));
      item = getCase(restored);
      assert.deepEqual(item, arrived);
      return restored;
    } });
    const restoredWeek = restoreRun(JSON.parse(JSON.stringify(week)));
    const row = archive(restoredWeek).find(({ id }) => id === 17);
    assert.deepEqual(row.carton, item.carton);
    assert.deepEqual(row.documents, item.documents);
    const [report] = archivedReportSources(restoredWeek, 'R-087');
    assert.deepEqual([report.id, report.index, report.document], [17, 1, item.documents[1]]);
    return { item, row, ending: getEnding(act(restoredWeek, 'finish')) };
  }

  const matched = inspectCarton(createFollowingRun(null, 1));
  const mismatched = inspectCarton(createFollowingRun(null, 0));
  assert.deepEqual([matched.item.variant, mismatched.item.variant], [1, 2]);
  assert.deepEqual([matched.item.carton, mismatched.item.carton], [{ code: 'C-217-03' }, { code: 'C-271-03' }]);
  assert.deepEqual(matched.item.documents, mismatched.item.documents);
  assert.deepEqual(matched.item.documents[2].fields.find(([field]) => field === '箱底喷码'), ['箱底喷码', 'C-217-03']);
  assert.deepEqual(matched.item.sample, mismatched.item.sample);
  assert.equal(matched.item.line, mismatched.item.line);
  assert.equal(matched.item.npc, mismatched.item.npc);
  assert.deepEqual([matched.row.record.answer, matched.row.record.status], ['pass', 'shipping']);
  assert.deepEqual([mismatched.row.record.answer, mismatched.row.record.status], ['review', 'held']);
  assert.deepEqual(matched.ending.issues, []);
  assert.ok(mismatched.ending.heldReceipts.some(({ id }) => id === 17));

  const rushed = inspectCarton(createFollowingRun(null, 0), 'pass');
  assert.deepEqual(rushed.ending.issues.map(({ id }) => id), [17]);
  const delayed = inspectCarton(createFollowingRun(null, 1), 'review');
  assert.deepEqual(delayed.ending.delayedReceipts.map(({ id }) => id), [17]);

  const { replayCartons: _cartonMarker, ...oldReplay } = createFollowingRun(null, 1);
  for (const oldRun of [createRun(1), oldReplay]) {
    const old = inspectCarton(oldRun);
    const oldOrderFields = matched.item.documents[2].fields.filter(([field]) => field !== '箱底喷码');
    assert.equal(old.item.variant, 0);
    assert.deepEqual(old.item.carton, { code: null });
    assert.deepEqual(old.item.documents, [...matched.item.documents.slice(0, 2), { ...matched.item.documents[2], fields: oldOrderFields }]);
    assert.deepEqual([old.row.record.answer, old.row.record.status], ['review', 'held']);
  }
});

test('G-216 uses the seeded sample for new runs and keeps the old sample for legacy saves', () => {
  const glove = (state) => archive(state).find(({ id }) => id === 16);
  const worlds = new Map();
  for (const [seed, variant, answer] of [[0, 0, 'pass'], [4, 1, 'fail']]) {
    const newRun = createRun(seed);
    assert.equal(newRun.sampleSet, 3);
    const played = untilHandoff(seed, { initialState: newRun, inspect: (state, item) => {
      if (item.id !== 16) return state;
      const loaded = restoreRun(JSON.parse(JSON.stringify(state)));
      assert.deepEqual(getCase(loaded), item);
      return loaded;
    } });
    const original = glove(played);
    assert.equal(original.variant, variant);
    assert.equal(original.record.answer, answer);
    assert.equal(original.sample.kind, 'yellow');
    assert.equal(original.sample.cuffSplit === true, variant === 1);
    worlds.set(seed, played);
  }

  const seed = 4;
  const v2 = untilHandoff(seed, { initialState: { ...createRun(seed), sampleSet: 2 } });
  assert.equal(glove(v2).variant, 1);
  assert.equal(glove(v2).record.answer, 'fail');
  const { sampleSet: _newSampleSet, ...oldRun } = createRun(seed);
  const legacy = untilHandoff(seed, { initialState: { ...oldRun, variantOverride: { caseId: 16, index: 1 } } });
  const restored = restoreRun(JSON.parse(JSON.stringify(legacy)));
  assert.equal(restored.sampleSet, undefined);
  assert.equal(glove(restored).variant, 0);
  assert.equal(glove(restored).record.answer, 'pass');
  assert.equal(glove(restored).sample.cuffSplit === true, false);
  assert.deepEqual(specimenVariants(restored, [8, 12]), specimenVariants(worlds.get(seed), [8, 12]));
  assert.deepEqual(restored.flags, worlds.get(seed).flags);
  assert.deepEqual(restored.records.map(({ id }) => id), worlds.get(seed).records.map(({ id }) => id));
  assert.equal(glove(worlds.get(0)).sample.front, glove(worlds.get(seed)).sample.front);
  assert.equal(glove(worlds.get(0)).sample.unwrapped, glove(worlds.get(seed)).sample.unwrapped);
  assert.equal(createFollowingRun(act(restored, 'finish'), seed).variantOverride, undefined);
});

test('a replay from a legacy week can change G-216 alone when all samples would match', () => {
  const seed = 63;
  const { sampleSet: _newSampleSet, ...oldRun } = createRun(seed);
  const original = act(untilHandoff(seed, { initialState: oldRun }), 'finish');
  const replay = createFollowingRun(original, seed);
  assert.equal(replay.seed, seed);
  assert.deepEqual(replay.variantOverride, { caseId: 16, index: 1 });
  const played = untilHandoff(seed, { initialState: JSON.parse(JSON.stringify(replay)) });
  assert.deepEqual(specimenVariants(played), { ...specimenVariants(original), 16: 1 });
  assert.equal(played.records.find(({ id }) => id === 16).answer, 'fail');
});

test('G-218 changes only its measurement and decision, and old saves keep the original sample', () => {
  const variants = [];
  const gauge = (state) => archive(state).find(({ id }) => id === 18);
  for (const [seed, reading, answer] of [[0, '1.80 mm', 'fail'], [3, '2.10 mm', 'pass']]) {
    const played = untilHandoff(seed, { inspect: (state, item) => {
      if (item.id !== 18) return state;
      const restored = restoreRun(JSON.parse(JSON.stringify(state)));
      assert.deepEqual(getCase(restored), item);
      assert.equal(item.sample.reading, reading);
      assert.equal(item.answer, answer);
      variants.push(item);
      return restored;
    } });
    assert.equal(gauge(played).record.answer, answer);
    assert.equal(gauge(played).sample.reading, reading);
  }
  assert.equal(variants.length, 2);
  const [outOfRange, inRange] = variants;
  assert.equal(inRange.line, outOfRange.line);
  assert.equal(inRange.documents, outOfRange.documents);
  assert.deepEqual(inRange.sample, { ...outOfRange.sample, reading: '2.10 mm' });

  const seed = 3;
  const newRun = createRun(seed);
  const { sampleSet: _newSampleSet, ...olderRun } = newRun;
  const modern = untilHandoff(seed, { initialState: newRun });
  for (const oldRun of [olderRun, { ...olderRun, sampleSet: 2 }]) {
    const restored = restoreRun(JSON.parse(JSON.stringify({ ...oldRun, variantOverride: { caseId: 18, index: 1 } })));
    const played = untilHandoff(seed, { initialState: restored });
    assert.equal(gauge(played).variant, 0);
    assert.equal(gauge(played).sample.reading, '1.80 mm');
    assert.equal(gauge(played).record.answer, 'fail');
    assert.deepEqual(played.records.map(({ id }) => id), modern.records.map(({ id }) => id));
    assert.deepEqual(played.flags, modern.flags);
    assert.deepEqual(specimenVariants(played, [8, 12]), specimenVariants(modern, [8, 12]));
    assert.equal(createFollowingRun(act(played, 'finish'), seed).variantOverride, undefined);
  }
});

test('an otherwise matching replay from sample set 2 can vary G-218 alone', () => {
  const seed = 2;
  const olderRun = { ...createRun(seed), sampleSet: 2 };
  const original = act(untilHandoff(seed, { initialState: olderRun }), 'finish');
  const replay = createFollowingRun(original, seed);
  assert.deepEqual(replay.variantOverride, { caseId: 18, index: 1 });
  const played = untilHandoff(seed, { initialState: JSON.parse(JSON.stringify(replay)) });
  assert.deepEqual(specimenVariants(played), { ...specimenVariants(original), 18: 1 });
  assert.equal(played.records.find(({ id }) => id === 18).answer, 'pass');
});

test('a receipt preserves selected findings alongside the legacy note after reload', () => {
  let state = act(createRun(4), 'start-day');
  for (const { key } of TUTORIAL.slice(0, -1)) state = act(state, 'tutorial', { key });
  const findings = [
    { key: 'doc:0:0', source: '外箱标签', text: '批号 · G-201' },
    { key: 'doc:1:0', source: '检验报告', text: '批号 · G-201' },
  ];
  state = act(state, 'stamp', { value: 'pass', note: '初查材料齐全', findings });
  const receipt = state.records[0];
  findings[0].text = '替换原内容';
  assert.equal(receipt.findings[0].text, '批号 · G-201');
  state = act(JSON.parse(JSON.stringify(state)), 'next');
  assert.deepEqual(archive(state).find(({ id }) => id === 1).record, receipt);
  assert.equal(receipt.note, '初查材料齐全');
  state = act(state, 'stamp', { value: 'review', findings: [] });
  assert.equal(Object.hasOwn(state.records[1], 'findings'), false);
  assert.equal(state.records[1].note, '');
});

test('receipt feedback follows handling rather than revealing whether the stamp was right', () => {
  const replies = new Map();
  for (let seed = 0; seed < 24 && replies.size < 2; seed++) {
    const issued = receiptAt(8, 'fail', { seed });
    const record = issued.records.at(-1);
    replies.set(record.answer, receiptFeedback(issued));
    assert.equal(Object.hasOwn(record, 'response'), false);
  }
  assert.equal(replies.size, 2);
  assert.equal(replies.get('pass'), replies.get('fail'));
  assert.doesNotMatch(replies.get('fail'), /错型|型号 B|拿错/);

  const issued = receiptAt(4, 'fail');
  const legacy = JSON.parse(JSON.stringify(issued));
  legacy.records.at(-1).response = '镜片内侧有分叉裂纹。';
  assert.equal(receiptFeedback(legacy), receiptFeedback(issued));
  assert.doesNotMatch(receiptFeedback(legacy), /裂纹/);
  assert.equal(receiptFeedback(act(issued, 'next')), null);
  assert.doesNotMatch(receiptFeedback(receiptAt(18, 'fail')), /1\.80|2\.00|偏薄|超差|单上写|记下/);

  const warned = receiptAt(createRun(0).flags.warningCase, 'review', { seed: 0 });
  assert.match(receiptFeedback(warned), /^行，我先让他们挪进黄线里。/);
  const last = receiptAt(20, 'review');
  assert.match(receiptFeedback(last), /交班时把板给我/);
  const umbrella = receiptAt(17, 'review', { inspect: (state, item) => item.id === 16 ? act(state, 'explore', { key: 'umbrella' }) : state });
  assert.match(receiptFeedback(umbrella), /晾伞/);
});

test('lab paperwork appears in receipt dialogue only for a review supported by that batch', () => {
  const checked = [];
  untilHandoff(21, { inspect: (state, item) => {
    if (item.id !== 5 && item.id !== 10) return state;
    const isIntake = item.id === 5;
    const orderIndex = isIntake ? 1 : 2;
    const comparison = isIntake ? intakeComparison(item, orderIndex) : projectComparison(item, orderIndex, 1);
    const { finding } = comparison;
    const missing = isIntake ? /报告|实验室/ : /耐冲击|实验室/;
    const compared = isIntake ? /拿到报告我再来一趟/ : /耐冲击那份，我明早去实验室问/;
    const stamp = (atWindow, value, findings) => act(atWindow, 'stamp', { value, findings });
    const ignored = act(state, 'dial', { number: '204', papers: [{ id: item.id, index: 0 }] });
    const requested = act(state, 'dial', { number: '204', papers: [{ id: item.id, index: orderIndex }] });

    assert.doesNotMatch(receiptFeedback(stamp(state, 'review')), missing);
    assert.doesNotMatch(receiptFeedback(stamp(ignored, 'review')), missing);
    assert.doesNotMatch(receiptFeedback(stamp(state, 'review', [{ ...finding, text: '批号吻合' }])), missing);
    assert.match(receiptFeedback(stamp(state, 'review', [finding])), compared);
    assert.match(receiptFeedback(stamp(requested, 'review')), /实验室已经记了这批/);
    for (const decision of ['pass', 'fail']) {
      const issued = stamp(requested, decision, [finding]);
      assert.doesNotMatch(receiptFeedback(issued), missing);
    }
    const unsupported = stamp(state, 'pass', [finding]);
    const corrected = act(unsupported, 'recheck-receipt', { id: item.id, value: 'review' });
    assert.equal(corrected.records.at(-1).decision, 'review');
    assert.doesNotMatch(receiptFeedback(corrected), missing);
    if (isIntake) {
      const shown = act(requested, 'show-finding', { finding });
      assert.match(receiptFeedback(stamp(shown, 'review')), /我带补件联去趟实验室/);
    }
    checked.push(item.id);
    return requested;
  } });
  assert.deepEqual(checked, [5, 10]);
});

test('the next day brings a single G-202 rework or hold record without changing the original receipt', () => {
  for (const [decision, status] of [['fail', 'returned'], ['review', 'held']]) {
    const monday = act(receiptAt(4, 'fail', { decisions: { 2: decision } }), 'next');
    const close = JSON.parse(JSON.stringify(monday));
    delete close.events;
    assert.equal(close.event, null);
    assert.deepEqual(close.pending, []);

    const tuesday = JSON.parse(JSON.stringify(act(close, 'advance-day')));
    const followup = getReworkFollowup(tuesday);
    assert.equal(followup.key, 'rework:2');
    assert.equal(followup.document.kind, 'rework');
    assert.match(followup.document.fields.flat().join(' '), /揭膜检查.*实物无需返修/);
    const waiting = act(tuesday, 'start-day');
    assert.equal(waiting.event.key, followup.key);
    assert.equal(waiting.event.kind, 'rework');
    assert.equal(waiting.event.caseId, 2);
    assert.equal(waiting.event.line, followup.line);
    assert.equal(waiting.events.length, 1);
    assert.equal(waiting.flags['rework:2Document'], undefined);
    assert.equal(archive(waiting).some(({ id }) => id === 5), false);
    assert.equal(act(waiting, 'stamp', { value: 'review' }), waiting);

    const restored = JSON.parse(JSON.stringify(waiting));
    const filed = act(restored, 'ack-visit');
    assert.equal(filed.records, restored.records);
    assert.equal(filed.records.find(({ id }) => id === 2).status, status);
    assert.equal(filed.records.length, 4);
    assert.equal(filed.flags['rework:2Document'], true);
    assert.deepEqual(filed.flags, { ...tuesday.flags, 'rework:2Document': true });
    assert.deepEqual(filed.phoneLog, tuesday.phoneLog);
    assert.equal(filed.event, null);
    assert.equal(getCase(filed).id, 5);
    assert.equal(filed.seen.filter((id) => id === 5).length, 1);
    assert.equal(act(filed, 'ack-visit'), filed);
    assert.equal(act(filed, 'start-day'), filed);
    const handoff = untilHandoff(21, { initialState: JSON.parse(JSON.stringify(filed)) });
    assert.equal(handoff.records.length, 20);
    assert.equal(getEnding(handoff).delayedReceipts.some(({ id }) => id === 2), true);
    const revised = act(handoff, 'recheck', { id: 2, value: 'pass' });
    assert.deepEqual(getReworkFollowup(revised), followup);
  }
});

test('G-202 opens normally when passed, and an already open legacy Tuesday does not get a late visit', () => {
  const monday = act(receiptAt(4, 'fail'), 'next');
  const tuesday = act(monday, 'advance-day');
  const opened = act(tuesday, 'start-day');
  assert.equal(opened.event, null);
  assert.equal(getReworkFollowup(opened), null);
  assert.equal(getCase(opened).id, 5);

  const legacy = JSON.parse(JSON.stringify(opened));
  const g202 = legacy.records.find(({ id }) => id === 2);
  Object.assign(g202, { original: 'fail', decision: 'fail', status: 'returned' });
  assert.equal(act(legacy, 'start-day'), legacy);
  const handoff = untilHandoff(21, { initialState: legacy });
  assert.equal(handoff.flags['rework:2Document'], undefined);
  assert.equal(handoff.event, null);
  assert.deepEqual(handoff.pending, []);
  assert.equal(handoff.records.length, 20);

  const lateRecheck = act(untilHandoff(21), 'recheck', { id: 2, value: 'fail' });
  assert.equal(getReworkFollowup(lateRecheck), null);
});

test('Friday files the actual G-248 arrival receipt exactly once before the final inspection', () => {
  const prior = receiptAt(18, 'fail');
  const waiting = act(prior, 'next');
  assert.equal(getCase(waiting).id, 20);
  assert.equal(waiting.seen.includes(20), false);
  assert.equal(archive(waiting).some(({ id }) => id === 20), false);
  assert.deepEqual(waiting.events.map(({ kind, key, npc }) => ({ kind, key, npc })), [
    { kind: 'acceptance', key: 'acceptance:14', npc: 'zhou' },
  ]);
  assert.equal(waiting.acceptanceReceipt, undefined);
  assert.equal(getShipmentAcceptance(waiting), null);
  assert.equal(act(waiting, 'stamp', { value: 'pass' }), waiting);
  assert.equal(getShipmentAcceptance(waiting, { ...waiting.event, caseId: 7 }), null);

  const restored = JSON.parse(JSON.stringify(waiting));
  const delivered = getShipmentAcceptance(restored, restored.event);
  assert.equal(delivered.caseId, 14);
  assert.equal(delivered.record, restored.records.find(({ id }) => id === 14));
  assert.equal(delivered.record.day, 3);
  assert.equal(delivered.day, 4);
  assert.match(delivered.title, /G-248.*到货验收联/u);
  assert.match(delivered.line, /G-248/u);

  const filed = act(restored, 'ack-visit');
  assert.deepEqual(filed.acceptanceReceipt, { caseId: 14, day: 4 });
  assert.deepEqual(getShipmentAcceptance(filed), delivered);
  assert.equal(filed.records, restored.records);
  assert.equal(filed.flags, restored.flags);
  assert.equal(filed.event, null);
  assert.equal(getCase(filed).id, 20);
  assert.equal(filed.seen.filter((id) => id === 20).length, 1);
  assert.equal(act(filed, 'ack-visit'), filed);

  const handoff = untilHandoff(21, { initialState: JSON.parse(JSON.stringify(filed)) });
  const ending = getEnding(act(handoff, 'finish'));
  assert.equal(handoff.records.length, 20);
  assert.equal(ending.id, 'routine');
  assert.equal(ending.acceptedReceipt, handoff.records.find(({ id }) => id === 14));

  const amended = act(handoff, 'recheck', { id: 14, value: 'review' });
  assert.equal(getShipmentAcceptance(amended).record.status, 'recallPending');
  assert.equal(getEnding(act(amended, 'finish')).acceptedReceipt, null);
});

test('Friday chooses prior valid shipments in order and leaves the window clear when none qualifies', () => {
  const declined = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [index + 1, 'fail']));
  const arrive = (decisions) => act(receiptAt(18, 'fail', { decisions: { ...declined, ...decisions } }), 'next');

  const recent = arrive({ 5: 'pass', 7: 'pass', 9: 'pass', 13: 'pass' });
  assert.equal(getShipmentAcceptance(recent, recent.event)?.caseId, 13);

  const supplement = arrive({ 5: 'pass', 7: 'pass', 9: 'pass' });
  assert.equal(getShipmentAcceptance(supplement, supplement.event)?.caseId, 9);

  const none = arrive({ 7: 'pass', 17: 'pass' });
  assert.equal(none.event, null);
  assert.equal(none.acceptanceReceipt, undefined);
  assert.equal(none.seen.includes(20), true);
  assert.equal(getCase(none).id, 20);
});

test('Friday files exactly one exception for a shipped fault and keeps the pickup and the disposition independent', () => {
  const prior = receiptAt(18, 'fail', { decisions: { 4: 'pass', 5: 'pass', 9: 'review', 10: 'pass' } });
  assert.equal(getShipmentException(prior), null);
  const waiting = act(prior, 'next');
  assert.equal(getCase(waiting).id, 20);
  assert.equal(waiting.seen.includes(20), false);
  assert.deepEqual(waiting.events.map(({ kind, key, npc }) => ({ kind, key, npc })), [
    { kind: 'exception', key: 'exception:4', npc: 'zhou' },
  ]);
  assert.equal(getShipmentException(waiting, { ...waiting.event, caseId: 10 }), null);
  assert.equal(getShipmentException(waiting), null);
  assert.equal(getShipmentAcceptance(waiting, waiting.event), null);
  assert.equal(act(waiting, 'stamp', { value: 'pass' }), waiting);

  const restored = restoreRun(JSON.parse(JSON.stringify(waiting)));
  const delivered = getShipmentException(restored, restored.event);
  assert.equal(delivered.caseId, 4);
  assert.equal(delivered.record.status, 'shipped');
  assert.equal(delivered.day, 4);
  assert.match(delivered.title, /G-204.*到货复核联/u);
  assert.deepEqual(shipmentIssueFeedback(delivered.record), { action: '收货方复核', reason: delivered.record.reason });

  const filed = act(restored, 'ack-visit');
  assert.deepEqual(filed.exceptionReceipt, { caseId: 4, day: 4 });
  assert.deepEqual(getShipmentException(filed), delivered);
  assert.equal(filed.records, restored.records);
  assert.equal(filed.acceptanceReceipt, undefined);
  assert.equal(filed.event, null);
  assert.equal(filed.seen.filter((id) => id === 20).length, 1);
  assert.equal(act(filed, 'ack-visit'), filed);

  const handoff = untilHandoff(21, { initialState: filed });
  assert.equal(getShipmentException(handoff).record.status, 'shipped');
  assert.ok(getEnding(act(handoff, 'finish')).issues.some(({ id }) => id === 4));
  const amended = act(handoff, 'recheck', { id: 4, value: 'fail' });
  assert.equal(getShipmentException(amended).record.status, 'recallPending');
  const confirmed = takeRecallReceipt(amended, 4);
  const finished = restoreRun(JSON.parse(JSON.stringify(act(confirmed, 'finish'))));
  assert.equal(getShipmentException(finished).record.status, 'recalled');
  assert.equal(getEnding(finished).issues.some(({ id }) => id === 4), false);
});

test('Friday exception prioritizes earlier missing proof and skips a same-lot release that was verified later', () => {
  const arrive = (decisions) => act(receiptAt(18, 'fail', { decisions }), 'next');
  const missing = arrive({ 5: 'pass', 9: 'review', 10: 'pass', 14: 'review', 17: 'pass' });
  const first = getShipmentException(missing, missing.event);
  assert.equal(first.caseId, 5);
  assert.deepEqual(shipmentIssueFeedback(first.record), { action: '暂缓入库', reason: first.record.reason });

  const verified = arrive({ 5: 'pass', 9: 'pass', 10: 'pass', 14: 'review', 17: 'pass' });
  assert.equal(getShipmentException(verified, verified.event).caseId, 10);

  const stillAtFactory = arrive({ 5: 'pass', 9: 'pass', 10: 'pass', 14: 'pass', 17: 'pass' });
  assert.equal(stillAtFactory.records.find(({ id }) => id === 17).status, 'shipping');
  assert.equal(getShipmentException(stillAtFactory, stillAtFactory.event), null);
  assert.equal(stillAtFactory.event.kind, 'acceptance');
});

test('Friday waits for earlier visitors and resumes existing saves that already reached case 20', () => {
  const prior = receiptAt(18, 'fail');
  let state = act(prior, 'dial', { number: '204', caseIds: [7, 14] });
  state = act(state, 'dial', { number: '107', caseIds: [11] });
  state = act(state, 'next');
  assert.deepEqual(state.events.map(({ key }) => key), ['trace', 'night']);
  assert.equal(state.seen.includes(20), false);
  state = act(state, 'ack-visit');
  assert.equal(state.event.key, 'night');
  assert.equal(state.seen.includes(20), false);
  state = act(state, 'ack-visit');
  assert.equal(state.flags.traceDocument, true);
  assert.equal(state.flags.nightDocument, true);
  assert.equal(state.event.key, 'acceptance:14');
  assert.equal(state.seen.includes(20), false);
  state = act(state, 'ack-visit');
  assert.equal(state.event, null);
  assert.equal(state.seen.includes(20), true);

  const legacy = { ...prior, phase: 'case', index: prior.index + 1, seen: [...prior.seen, 20] };
  assert.equal(getCase(legacy).id, 20);
  const legacyHandoff = untilHandoff(21, { initialState: legacy });
  assert.equal(getShipmentAcceptance(legacyHandoff), null);
  assert.equal(legacyHandoff.records.length, 20);
});

test('a finding shown during pressure survives reload and records independently from the stamp', () => {
  let checked = false;
  untilHandoff(0, { inspect: (state, item) => {
    if (item.id !== 5) return state;
    const finding = intakeComparison(item, 1).finding;
    const expected = { ...finding, caseId: item.id };
    const payload = { ...finding, text: ` ${finding.text} `, caseId: 10 };
    const shown = act(state, 'show-finding', { finding: payload });
    assert.deepEqual(shown.shownFinding, expected);
    assert.equal(shown.records, state.records);
    assert.equal(shown.flags, state.flags);
    assert.equal(shown.pending, state.pending);
    payload.text = '更改原输入';
    assert.deepEqual(shown.shownFinding, expected);
    const restored = JSON.parse(JSON.stringify(shown));
    assert.deepEqual(getCase(restored).shownFinding, expected);
    assert.equal(getCase(restored).pressureReply, PRESSURE[0].shown.intake);
    assert.equal(act(restored, 'show-finding', { finding }), restored);
    assert.equal(act(restored, 'show-finding', { finding: { key: finding.key, text: ' ' } }), restored);

    const other = { key: 'doc:1:0', source: '送检联', text: '批号 · G-205' };
    for (const value of ['pass', 'fail', 'review']) {
      const details = { value, findings: [other] };
      const stamped = act(restored, 'stamp', details);
      const control = act(state, 'stamp', details);
      const { shownFinding, supplementRequest, ...record } = stamped.records.at(-1);
      assert.deepEqual(shownFinding, expected);
      assert.deepEqual(record, control.records.at(-1));
      assert.deepEqual(supplementRequest, value === 'review' ? finding : undefined);
      if (value === 'review') assert.ok(receiptFeedback(stamped).includes(G205_SUPPLEMENT_REQUEST.receipt));
      else assert.equal(receiptFeedback(stamped), receiptFeedback(control));
      assert.equal(act(stamped, 'show-finding', { finding: other }), stamped);
      const next = act(stamped, 'next');
      assert.equal(next.shownFinding, null);
      assert.equal(getCase(next).shownFinding, null);
      assert.deepEqual(archive(next).find(({ id }) => id === 5).record.shownFinding, expected);
    }
    checked = true;
    return state;
  } });
  assert.equal(checked, true);
});

function g205AtWindow(seed) {
  let arrival;
  untilHandoff(seed, { inspect: (state, item) => {
    if (item.id === 5) arrival = state;
    return state;
  } });
  return arrival;
}

test('showing the exact G-205 intake at a quiet window prioritizes the next-day supplement only after a review', () => {
  const state = g205AtWindow(1);
  const item = getCase(state);
  const finding = intakeComparison(item, 1).finding;
  const note = { key: 'sample:5:front', source: '耳罩检样', text: '外壳边沿平整' };
  assert.equal(item.pressure, null);
  assert.equal(canShowFinding(item), true);
  assert.equal(canShowFinding(item, finding), true);
  assert.equal(canShowFinding(item, note), false);
  assert.equal(act(state, 'show-finding', { finding: note }), state);

  const shown = act(state, 'show-finding', { finding });
  const questioned = act(shown, 'dial', { number: '204', papers: [{ id: 5, index: 1 }] });
  assert.equal(questioned.phone.kind, 'lab-request');
  const beforeStamp = restoreRun(JSON.parse(JSON.stringify(questioned)));
  assert.equal(getCase(beforeStamp).pressureReply, G205_SUPPLEMENT_REQUEST.shown);
  assert.equal(getWindowSupplementRequest(beforeStamp), null);
  assert.deepEqual(getDay({ ...beforeStamp, day: 2 }).cases.map(({ id }) => id), [12, 10, 11, 9]);
  const held = act(beforeStamp, 'stamp', { value: 'review', findings: [finding] });
  const record = held.records.at(-1);
  assert.equal(record.status, 'held');
  assert.deepEqual(getWindowSupplementRequest(held), { record, proof: finding });
  assert.equal(archive(held).some(({ id }) => id === 9), false);
  assert.deepEqual(archivedReportSources(held, 'R-065'), []);
  assert.equal(act(held, 'next').supplementRequestDraft, null);

  const wednesday = [];
  const thursday = [];
  const week = untilHandoff(state.seed, { initialState: restoreRun(JSON.parse(JSON.stringify(held))), inspect: (run, arrived) => {
    if (run.day === 2) wednesday.push(arrived.id);
    if (run.day === 3) thursday.push(arrived.id);
    if (arrived.id === 9) {
      assert.equal(run.index, 0);
      assert.equal(getPreviousReceipt(run).record.status, 'held');
      assert.equal(arrived.line, [arrived.followUp.lines.review, G205_SUPPLEMENT_REQUEST.delivery, PHONE['204'].requests[5].delivery].join(' '));
      assert.equal(archivedReportSources(run, 'R-065')[0].id, 9);
      assert.equal(act(run, 'stamp', { value: 'pass' }).records.at(-1).status, 'shipping');
    }
    return run;
  } });
  assert.deepEqual(wednesday, [9, 12, 10, 11]);
  assert.deepEqual(thursday, [13, 16, 14, 15]);
  assert.equal(week.records.filter(({ id }) => id === 9).length, 1);
  assert.equal(week.records.find(({ id }) => id === 5).verifiedBy, 9);
  assert.equal(getEnding(act(week, 'finish')).id, 'routine');
});

test('only an actual G-205 intake presentation with a review persists a request, even when another note is shown later', () => {
  const state = g205AtWindow(0);
  const item = getCase(state);
  const finding = intakeComparison(item, 1).finding;
  const sampleNote = { key: 'sample:5:front', source: '耳罩检样', text: '外壳边沿平整' };
  const shown = act(state, 'show-finding', { finding });
  const afterAnother = act(shown, 'show-finding', { finding: sampleNote });
  const restored = restoreRun(JSON.parse(JSON.stringify(afterAnother)));
  const review = act(restored, 'stamp', { value: 'review' });
  assert.deepEqual(review.records.at(-1).shownFinding, { ...sampleNote, caseId: 5 });
  assert.deepEqual(getWindowSupplementRequest(review).proof, finding);
  assert.deepEqual(getDay({ ...review, day: 2 }).cases.map(({ id }) => id), [9, 12, 10, 11]);

  const reviewWithout = [
    act(state, 'stamp', { value: 'review', findings: [finding] }),
    act(act(state, 'show-finding', { finding: sampleNote }), 'stamp', { value: 'review' }),
    act(act(state, 'show-finding', { finding: { ...finding, text: '另一份送检联上的说明' } }), 'stamp', { value: 'review' }),
    act({ ...state, shownFinding: { ...finding, caseId: 5 } }, 'stamp', { value: 'review' }),
  ];
  const passed = act(restored, 'stamp', { value: 'pass' });
  const failed = act(restored, 'stamp', { value: 'fail' });
  for (const alternative of [...reviewWithout, passed, failed]) {
    assert.equal(getWindowSupplementRequest(alternative), null);
    assert.deepEqual(getDay({ ...alternative, day: 2 }).cases.map(({ id }) => id), [12, 10, 11, 9]);
  }
  assert.equal(passed.records.at(-1).status, 'shipping');
  assert.equal(failed.records.at(-1).status, 'returned');
  const afterPass = untilHandoff(state.seed, { initialState: passed, decisions: { 9: 'review' } });
  const later = afterPass.records.find(({ id }) => id === 9);
  assert.equal(later.priorShipmentId, 5);
  assert.equal(isSupplementOnly(later), true);
  assert.equal(afterPass.records.find(({ id }) => id === 5).status, 'shipped');
});

test('pressure replies follow the latest evidence and cannot be triggered before a visitor arrives', () => {
  const sample = { key: 'sample:正面', source: '防护面屏 · 正面', text: '视野内没有划伤。' };
  const ordinary = act(createRun(0), 'start-day');
  const { shownFinding: _initialFinding, ...legacy } = ordinary;
  assert.equal(getCase(legacy).shownFinding, null);
  assert.equal(getCase(legacy).pressureReply, null);
  assert.equal(act(legacy, 'show-finding', { finding: sample }), legacy);

  let checked = false;
  untilHandoff(0, { inspect: (state, item) => {
    if (item.id !== 10) return state;
    const project = projectComparison(item, 2, 1).finding;
    let shown = act(state, 'show-finding', { finding: project });
    assert.equal(getCase(shown).pressureReply, PRESSURE[1].shown.projects);
    shown = act(shown, 'show-finding', { finding: sample });
    assert.equal(getCase(shown).pressureReply, PRESSURE[1].shown.sample);
    const paper = { key: 'doc:2:1', source: '送检联', text: '必查项目 · 外观、耐冲击' };
    shown = act(shown, 'show-finding', { finding: paper });
    assert.equal(getCase(shown).pressureReply, PRESSURE[1].shown.paper);
    assert.deepEqual(getCase(shown).shownFinding, { ...paper, caseId: item.id });
    const another = act(shown, 'show-finding', { finding: { ...paper, text: '修订后的条目' } });
    assert.equal(another.shownFinding.text, '修订后的条目');
    assert.equal(shown.shownFinding.text, paper.text);
    checked = true;
    return state;
  } });
  assert.equal(checked, true);

  const beforeAcceptance = act(receiptAt(18, 'fail', { seed: 1 }), 'next');
  assert.equal(getCase(beforeAcceptance).id, 20);
  assert.equal(getCase(beforeAcceptance).pressure, 'warning');
  assert.equal(beforeAcceptance.event.kind, 'acceptance');
  assert.equal(act(beforeAcceptance, 'show-finding', { finding: sample }), beforeAcceptance);
});

test('same seed remains playable after JSON restore and contains one of each pressure event', () => {
  const weeks = [];
  for (let seed = 0; seed < 24; seed++) {
    const events = [];
    const week = untilHandoff(seed, { inspect: (state, item) => {
      const restored = JSON.parse(JSON.stringify(state));
      assert.deepEqual(getCase(restored), item);
      if (item.pressure) events.push([item.pressure, item.id]);
      return restored;
    } });
    assert.equal(week.records.length, 20);
    assert.deepEqual(events.map(([type]) => type), ['favor', 'warning'].sort((a, b) => {
      const slots = { favor: week.flags.offerCase, warning: week.flags.warningCase };
      return slots[a] - slots[b];
    }));
    const ending = getEnding(act(week, 'finish'));
    assert.equal(ending.id, 'routine');
    assert.deepEqual(ending.delayed, { count: 0, batches: [] });
    weeks.push(week);
  }
  for (const id of [8, 12]) {
    const answers = new Set(weeks.map((week) => week.records.find((record) => record.id === id).answer));
    assert.deepEqual(answers, new Set(['pass', 'fail']));
  }
  const allowedOrders = [
    ['1,2,3,4'],
    ['5,6,7,8', '5,8,7,6'],
    ['9,10,11,12', '12,10,11,9'],
    ['13,15,14,16', '13,16,14,15'],
    ['17,18,19,20', '17,19,18,20'],
  ];
  for (const [day, allowed] of allowedOrders.entries()) {
    const orders = weeks.map((week) => week.records.filter((record) => record.day === day).map(({ id }) => id).join(','));
    assert.deepEqual(new Set(orders), new Set(allowed));
  }
});

test('a saved week without the schedule marker retains its original arrival order', () => {
  const state = createRun(9);
  delete state.schedule;
  const week = untilHandoff(9, { initialState: state });
  assert.deepEqual(week.records.map(({ id }) => id), Array.from({ length: 20 }, (_, index) => index + 1));
});

test('a version-one arrival schedule keeps its Friday cases across a midweek reload', () => {
  const seed = 21;
  const week = untilHandoff(seed, { initialState: { ...createRun(seed), schedule: 1 }, inspect: (state) => {
    const restored = JSON.parse(JSON.stringify(state));
    assert.equal(getCase(restored).id, getCase(state).id);
    return restored;
  } });
  assert.deepEqual(week.records.map(({ id }) => id), [1,2,3,4,5,8,7,6,12,10,11,9,13,16,14,15,17,18,19,20]);
  const current = untilHandoff(seed);
  assert.deepEqual(current.records.slice(0, -4), week.records.slice(0, -4));
  assert.deepEqual(current.records.slice(-4).map(({ id }) => id), [17,19,18,20]);
});

test('trace needs both archived records, the lab visit and submission at handoff', () => {
  let state = untilHandoff('trace', { inspect: (state, item) => {
    if (item.id === 7) {
      const called = act(state, 'dial', { number: '204', caseIds: [7, 14] });
      assert.equal(called.phone.kind, 'hint');
      assert.deepEqual(called.pending, []);
      return called;
    }
    if (item.id === 14) {
      assert.deepEqual(archive(state, '071').map(({ id }) => id), [7, 14]);
      const hint = act(state, 'dial', { number: '204', caseIds: [14] });
      assert.equal(hint.phone.kind, 'hint');
      const called = act(hint, 'dial', { number: '204', caseIds: [7, 14] });
      assert.equal(called.phone.kind, 'trace');
      assert.equal(called.flags.traceDocument, false);
      assert.deepEqual(called.pending, ['trace']);
      return called;
    }
    if (state.records.at(-1)?.id === 14) {
      assert.equal(state.event.npc, 'chen');
      assert.equal(state.flags.traceDocument, false);
      assert.equal(act(state, 'stamp', { value: item.answer }), state);
    }
    return state;
  } });
  assert.equal(getEnding(state).id, 'routine');
  state = act(state, 'attach', { key: 'trace' });
  assert.equal(getEnding(state).id, 'trace');
  assert.match(getEnding(state).traceDisposition, /尚未登记召回/);
  const findings = [{ key: 'trace:source', source: 'R-071 实验室原件', text: '样品来源 · 试样 S-019' }];
  const corrected = act(state, 'recheck', { id: TRACE_CASE_ID, value: 'review', findings });
  assert.match(getEnding(corrected).traceDisposition, /等待收货方确认/);
  const tracedCorrection = getEnding(act(corrected, 'finish'));
  assert.equal(tracedCorrection.id, 'trace');
  assert.equal(tracedCorrection.traceReceipt.status, 'recallPending');
  assert.equal(tracedCorrection.traceReceipt.recallReceipt, undefined);
  assert.deepEqual(tracedCorrection.traceReceipt.amendments, [
    { from: 'pass', to: 'review', status: 'recallPending', previousStatus: 'shipped', day: 4, findings },
  ]);
  const confirmed = act(takeRecallReceipt(corrected, TRACE_CASE_ID), 'finish');
  const confirmedTrace = getEnding(confirmed);
  assert.equal(confirmedTrace.traceReceipt.status, 'recalled');
  assert.match(confirmedTrace.traceDisposition, /确认召回/);
  assert.deepEqual(confirmedTrace.traceReceipt.recallReceipt, { day: 4, amendmentIndex: 0 });
  assert.deepEqual(confirmedTrace.confirmedRecalls, []);

  const legacy = JSON.parse(JSON.stringify(confirmed));
  const oldReceipt = legacy.records.find(({ id }) => id === TRACE_CASE_ID);
  delete oldReceipt.recallReceipt;
  oldReceipt.traceDisposition = 'recalled';
  assert.equal(restoreRun(legacy), legacy);
  assert.equal(act(legacy, 'finish'), legacy);
  assert.match(getEnding(legacy).traceDisposition, /确认召回/);

  state = act(state, 'finish');
  assert.equal(state.phase, 'ending');
  assert.equal(state.records.find(({ id }) => id === TRACE_CASE_ID).status, 'recallPending');
  const ending = getEnding(state);
  assert.match(ending.traceDisposition, /等待收货方确认/);
  assert.equal(ending.traceReceipt, state.records.find(({ id }) => id === TRACE_CASE_ID));
  assert.equal(ending.traceReceipt.recallReceipt, undefined);
  assert.deepEqual(ending.traceReceipt.amendments, [
    { from: 'pass', to: 'review', status: 'recallPending', previousStatus: 'shipped', day: 4, findings: [TRACE_FINDING] },
  ]);
  assert.deepEqual(TRACE_FINDING, {
    key: 'trace:source', source: 'R-071 实验室原件', text: '样品来源 · 试样 S-019；检验范围 · 仅限试样',
  });
  assert.deepEqual(ending.delayedReceipts, []);
});

test('report filed during handoff can still lead to an on-site hold', () => {
  let state = untilHandoff(4, { decisions: { 7: 'review' } });
  state = act(state, 'dial', { number: '204', caseIds: [7, 14] });
  assert.equal(state.event.npc, 'chen');
  state = act(state, 'ack-visit');
  state = act(state, 'attach', { key: 'trace' });
  state = act(state, 'finish');
  assert.equal(getEnding(state).id, 'trace');
  assert.match(getEnding(state).traceDisposition, /留厂隔离/);
  assert.deepEqual(getEnding(state).delayed, { count: 0, batches: [] });
});

test('trace evidence keeps an existing return and intercepts a new permit before shipping', () => {
  let state = untilHandoff(4, { decisions: { [TRACE_CASE_ID]: 'fail', 4: 'pass' } });
  state = act(state, 'dial', { number: '204', caseIds: [TRACE_CASE_ID, 14] });
  state = act(act(state, 'ack-visit'), 'attach', { key: 'trace' });
  const oldReceipt = getEnding(state).traceReceipt;
  const returned = getEnding(act(state, 'finish'));
  assert.equal(returned.id, 'issue');
  assert.deepEqual(returned.issues.map(({ id }) => id), [4]);
  assert.equal(returned.traceReceipt, oldReceipt);
  assert.equal(returned.traceReceipt.status, 'returned');
  assert.match(returned.traceDisposition, /已退回/);

  const queued = act(state, 'recheck', { id: TRACE_CASE_ID, value: 'pass' });
  assert.equal(getEnding(queued).traceReceipt.status, 'shipping');
  assert.match(getEnding(queued).traceDisposition, /尚未出库/);
  const intercepted = getEnding(act(queued, 'finish'));
  assert.equal(intercepted.id, 'issue');
  assert.equal(intercepted.traceReceipt.status, 'held');
  assert.equal(intercepted.traceReceipt.recallReceipt, undefined);
  assert.deepEqual(intercepted.traceReceipt.amendments.at(-1), {
    from: 'pass', to: 'review', status: 'held', previousStatus: 'shipping', day: 4, findings: [TRACE_FINDING],
  });
});

test('two late calls survive reload and grant one document per receipt', () => {
  let state = untilHandoff(9);
  state = act(state, 'dial', { number: '204', caseIds: [7, 14] });
  state = act(state, 'dial', { number: '107', caseIds: [11] });
  state = act(state, 'dial', { number: '204', caseIds: [7, 14] });
  state = act(state, 'dial', { number: '107', caseIds: [11] });
  assert.deepEqual(state.pending, []);
  assert.deepEqual(state.events.map(({ key }) => key), ['trace', 'night']);
  assert.equal(state.event.key, 'trace');
  assert.equal(state.flags.traceDocument, false);
  assert.equal(state.flags.nightDocument, false);
  assert.equal(act(state, 'attach', { key: 'trace' }), state);
  assert.equal(act(state, 'finish'), state);

  state = act(JSON.parse(JSON.stringify(state)), 'ack-visit');
  assert.equal(state.flags.traceDocument, true);
  assert.equal(state.flags.nightDocument, false);
  assert.equal(state.event.key, 'night');
  assert.equal(act(state, 'attach', { key: 'night' }), state);
  assert.equal(act(state, 'finish'), state);
  state = act(state, 'attach', { key: 'trace' });
  assert.equal(state.flags.traceAttached, true);

  state = act(JSON.parse(JSON.stringify(state)), 'ack-visit');
  assert.equal(state.flags.nightDocument, true);
  assert.equal(state.event, null);
  assert.deepEqual(state.events, []);
  assert.equal(act(state, 'ack-visit'), state);
  state = act(state, 'attach', { key: 'night' });
  assert.equal(state.flags.nightAttached, true);
  assert.equal(getEnding(act(state, 'finish')).id, 'trace');
});

test('a v1 save with previously granted evidence can still acknowledge the listed visit', () => {
  let state = act(untilHandoff(9), 'dial', { number: '107', caseIds: [11] });
  const legacy = { ...state, flags: { ...state.flags, nightDocument: true } };
  state = act(JSON.parse(JSON.stringify(legacy)), 'ack-visit');
  assert.equal(state.flags.nightDocument, true);
  assert.equal(state.event, null);
  assert.deepEqual(state.events, []);
});

test('report lookup returns only the exact old slips that have reached the window', () => {
  const inspected = [];
  untilHandoff(21, { inspect: (state, item) => {
    const sources = archivedReportSources(state, '071');
    if (item.id === 5) assert.deepEqual(sources, []);
    if (item.id === 7) {
      assert.deepEqual(sources, [{ id: 7, batch: 'G-241', day: 1, document: item.documents[1], index: 1, number: 'R-071' }]);
      assert.equal(state.records.some(({ id }) => id === 7), false);
      inspected.push(item.id);
    }
    if (item.id === 10) assert.deepEqual(sources.map(({ id }) => id), [7]);
    if (item.id === 14) {
      assert.deepEqual(sources, archivedReportSources(state, ' r-071 '));
      assert.deepEqual(sources, archivedReportSources(state, 'R071'));
      assert.deepEqual(archive(state, 'R071'), archive(state, 'R-071'));
      assert.deepEqual(sources.map(({ id, day, index, document }) => [id, day, index, document.title]), [
        [7, 1, 1, '随货核验联'], [14, 3, 2, '作废随货联'],
      ]);
      assert.equal(sources[1].document, item.documents[2]);
      assert.deepEqual(archivedReportSources(state, '084'), [
        { id: 14, batch: 'G-248', day: 3, document: item.documents[1], index: 1, number: 'R-084' },
      ]);
      for (const invalid of ['07', '0710', 'R-071 R-084', '', undefined]) {
        assert.deepEqual(archivedReportSources(state, invalid), []);
      }
      inspected.push(item.id);
    }
    return state;
  } });
  assert.deepEqual(inspected, [7, 14]);
});

test('report lookup waits for an earlier arrival and works with a legacy saved archive', () => {
  const initialState = createRun(21);
  delete initialState.schedule;
  let checked = false;
  untilHandoff(21, { initialState, inspect: (state, item) => {
    if (item.id === 13) return act(state, 'dial', { number: '107', caseIds: [11] });
    if (item.id !== 14) return state;
    assert.equal(state.event?.key, 'night');
    assert.deepEqual(archivedReportSources(state, '071').map(({ id }) => id), [7]);

    const legacy = JSON.parse(JSON.stringify({ ...state, seen: [...state.seen, 14] }));
    delete legacy.events;
    assert.deepEqual(archivedReportSources(legacy, '071').map(({ id }) => id), [7]);
    const arrived = act(legacy, 'ack-visit');
    assert.deepEqual(archivedReportSources(arrived, '071').map(({ id }) => id), [7, 14]);
    checked = true;
    return state;
  } });
  assert.equal(checked, true);
});

test('the next arrival enters the archive after both visitors hand over their papers', () => {
  let checked = false;
  untilHandoff(21, { inspect: (state, item) => {
    if (item.id === 14) {
      state = act(state, 'dial', { number: '204', caseIds: [14, 7] });
      return act(state, 'dial', { number: '107', caseIds: [11] });
    }
    if (state.records.at(-1)?.id !== 14) return state;

    assert.deepEqual(state.events.map(({ key }) => key), ['trace', 'night']);
    assert.equal(state.seen.includes(item.id), false);
    const legacy = { ...state, seen: [...state.seen, item.id] };
    for (const saved of [state, legacy]) {
      let waiting = JSON.parse(JSON.stringify(saved));
      assert.equal(archive(waiting).some(({ id }) => id === item.id), false);
      assert.equal(archive(waiting, 'R-071').find(({ id }) => id === 14).record.id, 14);
      assert.equal(act(waiting, 'stamp', { value: item.answer }), waiting);
      waiting = act(waiting, 'ack-visit');
      assert.equal(waiting.flags.traceDocument, true);
      assert.equal(waiting.flags.nightDocument, false);
      assert.equal(waiting.event.key, 'night');
      assert.equal(archive(waiting).some(({ id }) => id === item.id), false);
      waiting = act(JSON.parse(JSON.stringify(waiting)), 'ack-visit');
      assert.equal(waiting.flags.nightDocument, true);
      assert.equal(waiting.event, null);
      assert.equal(archive(waiting).find(({ id }) => id === item.id).record, null);
      assert.equal(waiting.seen.filter((id) => id === item.id).length, 1);
    }
    checked = true;
    return state;
  } });
  assert.equal(checked, true);
});

test('sending every batch to review reports the release-ready batches that remain held', () => {
  const decisions = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [index + 1, 'review']));
  const ending = getEnding(act(untilHandoff(21, { decisions }), 'finish'));
  assert.equal(ending.id, 'routine');
  assert.deepEqual(ending.delayed, { count: 12, batches: ['G-201', 'G-202', 'G-203'] });
  assert.equal(ending.delayedReceipts.length, 12);
  assert.deepEqual(ending.delayedReceipts.slice(0, 3).map(({ id }) => id), [1, 2, 3]);
});

test('routine handoff describes the actual batches still in the yellow line', () => {
  const finished = act(untilHandoff(21), 'finish');
  const ending = getEnding(finished);
  assert.equal(ending.id, 'routine');
  assert.deepEqual(ending.heldReceipts, [finished.records.find(({ id }) => id === 17)]);
  assert.equal(ending.detail, 'G-217 留在黄线内，由下一班继续查。');

  const noHolds = getEnding(act(untilHandoff(21, { decisions: { 17: 'fail' } }), 'finish'));
  assert.equal(noHolds.id, 'routine');
  assert.deepEqual(noHolds.heldReceipts, []);
  assert.equal(noHolds.detail, '本周出货回执已归档。');
});

test('routine handoff reports unique held batch codes and excludes paperwork-only supplements', () => {
  const week = untilHandoff(21, { decisions: { 1: 'review', 4: 'review', 5: 'pass', 9: 'review', 15: 'review' } });
  const recovered = takeRecallReceipt(act(week, 'recheck', { id: 5, value: 'review' }), 5);
  const ending = getEnding(act(recovered, 'finish'));
  assert.equal(ending.id, 'routine');
  assert.equal(isSupplementOnly(ending.delayedReceipts.find(({ id }) => id === 9)), true);
  assert.deepEqual(ending.heldReceipts.map(({ id }) => id), [1, 4, 15, 17]);
  assert.equal(ending.detail, '黄线内有 G-201、G-204 等，共 3 个待查批号，由下一班接手。');
});

test('a corrected decision removes the released batch from the handoff delay', () => {
  let state = untilHandoff(9, { decisions: { 1: 'review', 2: 'fail' } });
  assert.deepEqual(getEnding(state).delayed, { count: 2, batches: ['G-201', 'G-202'] });
  state = act(state, 'recheck', { id: 1, value: 'pass' });
  assert.deepEqual(getEnding(act(state, 'finish')).delayed, { count: 1, batches: ['G-202'] });
});

test('an unconfirmed recall leaves bad freight unresolved and reports sound freight separately', () => {
  const week = untilHandoff(21, { decisions: { 4: 'pass' } });
  const requested = act(act(week, 'recheck', { id: 4, value: 'review' }), 'recheck', { id: 1, value: 'fail' });
  const ending = getEnding(act(requested, 'finish'));
  assert.equal(ending.id, 'issue');
  assert.deepEqual(ending.issues.map(({ id }) => id), [4]);
  assert.deepEqual(ending.pendingRecalls.map(({ id }) => id), [1, 4]);
  assert.deepEqual(ending.confirmedRecalls, []);
  assert.deepEqual(ending.delayedReceipts, []);
  assert.match(ending.detail, /G-204 · 召回待确认/);
  assert.equal(act(requested, 'receive-recall', { id: 15 }), requested);
  assert.equal(act(requested, 'ack-visit'), requested);

  const atWindow = act(requested, 'receive-recall', { id: 4 });
  assert.equal(atWindow.event.key, 'recall:4');
  assert.equal(atWindow.event.kind, 'recall');
  assert.match(atWindow.event.line, /G-204/);
  assert.equal(atWindow.records, requested.records);
  assert.equal(act(atWindow, 'receive-recall', { id: 1 }), atWindow);
  assert.equal(act(atWindow, 'finish'), atWindow);
  const received = act(JSON.parse(JSON.stringify(atWindow)), 'ack-visit');
  assert.deepEqual(received.flags, requested.flags);
  assert.deepEqual(received.events, []);
  assert.equal(act(received, 'ack-visit'), received);
  const closed = getEnding(act(received, 'finish'));
  assert.equal(closed.id, 'routine');
  assert.deepEqual(closed.pendingRecalls.map(({ id }) => id), [1]);
  assert.deepEqual(closed.confirmedRecalls.map(({ id, recallReceipt }) => [id, recallReceipt]),
    [[4, { day: 4, amendmentIndex: 0 }]]);
  assert.equal(closed.confirmedRecalls[0].amendments[0].status, 'recallPending');
  assert.equal(received.records.find(({ id }) => id === 15).status, 'returned');
});

test('canceling an offsite recall keeps shipping history and invalidates the previous pickup', () => {
  const week = untilHandoff(21, { decisions: { 4: 'pass' } });
  const requested = act(week, 'recheck', { id: 4, value: 'review' });
  const waiting = act(requested, 'receive-recall', { id: 4 });
  const canceled = act(waiting, 'recheck', { id: 4, value: 'pass' });
  assert.equal(canceled.records.find(({ id }) => id === 4).status, 'shipped');
  assert.deepEqual(getEnding(canceled).pendingRecalls, []);
  assert.deepEqual(getEnding(canceled).issues.map(({ id }) => id), [4]);

  const reopened = act(canceled, 'recheck', { id: 4, value: 'fail' });
  const stale = act(reopened, 'ack-visit');
  const row = stale.records.find(({ id }) => id === 4);
  assert.equal(stale.event, null);
  assert.equal(row.status, 'recallPending');
  assert.equal(row.recallReceipt, undefined);
  const taken = takeRecallReceipt(stale, 4);
  assert.deepEqual(taken.records.find(({ id }) => id === 4).recallReceipt, { day: 4, amendmentIndex: 2 });
});

test('accepting a signed supplement supersedes an outstanding request on its historical lot', () => {
  const week = untilHandoff(21, { decisions: { 5: 'pass', 9: 'review' } });
  const requested = act(week, 'recheck', { id: 5, value: 'review' });
  const waiting = act(requested, 'receive-recall', { id: 5 });
  const accepted = act(waiting, 'recheck', { id: 9, value: 'pass' });
  const historical = archive(accepted, 'G-205').find(({ id }) => id === 5);
  assert.equal(historical.latestReceipt.status, 'shipped');
  assert.deepEqual(getEnding(accepted).pendingRecalls, []);
  const taken = act(accepted, 'ack-visit');
  assert.equal(taken.event, null);
  assert.equal(taken.records.find(({ id }) => id === 5).recallReceipt, undefined);
  assert.equal(act(taken, 'receive-recall', { id: 5 }), taken);
  assert.equal(getEnding(act(taken, 'finish')).id, 'routine');
});

test('old recalled shipments stay confirmed without a newly invented confirmation receipt', () => {
  const week = untilHandoff(21, { decisions: { 4: 'pass' } });
  const legacy = JSON.parse(JSON.stringify(act(week, 'recheck', { id: 4, value: 'review' })));
  const record = legacy.records.find(({ id }) => id === 4);
  record.status = 'recalled';
  record.amendments[0].status = 'recalled';
  assert.equal(act(legacy, 'receive-recall', { id: 4 }), legacy);
  const ending = getEnding(act(legacy, 'finish'));
  assert.equal(ending.id, 'routine');
  assert.deepEqual(ending.pendingRecalls, []);
  assert.deepEqual(ending.confirmedRecalls, []);
});

test('each Friday amendment preserves its own findings alongside the original and legacy entries', () => {
  let firstCase = act(createRun(21), 'start-day');
  for (const { key } of TUTORIAL.slice(0, -1)) firstCase = act(firstCase, 'tutorial', { key });
  const firstFindings = [{ key: 'doc:0:0', source: '外箱标签', text: '批号 · G-201' }];
  const initialState = act(firstCase, 'stamp', { value: 'pass', findings: firstFindings, note: '初查已签发' });
  const week = untilHandoff(21, { initialState });
  const legacy = takeRecallReceipt(act(week, 'recheck', { id: 1, value: 'review', findings: [{ key: '', text: '忽略空键' }] }), 1);
  assert.deepEqual(legacy.records[0].amendments, [
    { from: 'pass', to: 'review', status: 'recallPending', previousStatus: 'shipped', day: 4 },
  ]);

  const firstAmendment = [{ key: ' doc:1:1 ', source: ' 检验报告 ', text: ' 报告编号 · R-061 ' }];
  const revised = act(JSON.parse(JSON.stringify(legacy)), 'recheck', {
    id: 1, value: 'fail', findings: [...firstAmendment, { key: 'doc:1:1', text: '忽略重复条目' }],
  });
  firstAmendment[0].text = '草稿后来改动';
  const secondAmendment = [{ key: 'doc:2:1', source: '送检联', text: '检验项目 · 外观、扣合' }];
  assert.equal(act(revised, 'recheck', { id: 1, value: 'fail', findings: secondAmendment }), revised);
  const released = act(revised, 'recheck', { id: 1, value: 'pass', findings: secondAmendment });
  secondAmendment.pop();
  const restored = JSON.parse(JSON.stringify(released));
  const { record } = archive(restored, 'G-201').find(({ id }) => id === 1);
  assert.deepEqual(record.findings, firstFindings);
  assert.equal(record.note, '初查已签发');
  assert.equal(record.original, 'pass');
  assert.equal(record.status, 'shipping');
  assert.deepEqual(record.amendments, [
    ...legacy.records[0].amendments,
    { from: 'review', to: 'fail', previousStatus: 'recalled', status: 'recalled', day: 4,
      findings: [{ key: 'doc:1:1', source: '检验报告', text: '报告编号 · R-061' }] },
    { from: 'fail', to: 'pass', previousStatus: 'recalled', status: 'shipping', day: 4,
      findings: [{ key: 'doc:2:1', source: '送检联', text: '检验项目 · 外观、扣合' }] },
  ]);
  assert.deepEqual(week.records[0].amendments, []);
  assert.deepEqual(week.records[0].findings, firstFindings);
});

test('recalling an accepted supplement reports the current receipt until the lot is released again', () => {
  const week = untilHandoff(21);
  const recalled = takeRecallReceipt(act(week, 'recheck', { id: 9, value: 'review' }), 9);
  const finished = act(recalled, 'finish');
  const ending = getEnding(finished);
  const active = finished.records.find(({ id }) => id === 9);
  assert.equal(active.status, 'recalled');
  assert.equal(ending.id, 'routine');
  assert.deepEqual(ending.delayed, { count: 1, batches: ['G-205'] });
  assert.deepEqual(ending.delayedReceipts, [active]);
  assert.equal(ending.traceReceipt, null);

  const released = act(recalled, 'recheck', { id: 9, value: 'pass' });
  const releasedEnding = getEnding(act(released, 'finish'));
  assert.deepEqual(releasedEnding.delayed, { count: 0, batches: [] });
  assert.deepEqual(releasedEnding.delayedReceipts, []);
});

test('a second non-pass amendment keeps an accepted supplement in recall with a Friday history', () => {
  const week = untilHandoff(21, { decisions: { 20: 'review' } });
  const requested = act(week, 'recheck', { id: 9, value: 'review' });
  const amended = act(JSON.parse(JSON.stringify(requested)), 'recheck', { id: 9, value: 'fail' });
  const revised = takeRecallReceipt(amended, 9);
  const original = archive(revised, 'G-205').find(({ id }) => id === 5);
  const supplement = original.latestReceipt;
  assert.equal(original.record.status, 'held');
  assert.equal(supplement.id, 9);
  assert.equal(supplement.day, 2);
  assert.equal(supplement.decision, 'fail');
  assert.equal(supplement.status, 'recalled');
  assert.deepEqual(supplement.recallReceipt, { day: 4, amendmentIndex: 0 });
  assert.deepEqual(supplement.amendments, [
    { from: 'pass', to: 'review', previousStatus: 'shipped', status: 'recallPending', day: 4 },
    { from: 'review', to: 'fail', previousStatus: 'recallPending', status: 'recallPending', day: 4 },
  ]);
  assert.deepEqual(getEnding(act(revised, 'finish')).delayedReceipts, [supplement, revised.records.at(-1)]);

  const released = act(revised, 'recheck', { id: 9, value: 'pass' });
  assert.equal(archive(released, 'G-205').find(({ id }) => id === 5).latestReceipt.status, 'shipping');
  const returned = act(released, 'recheck', { id: 20, value: 'fail' });
  assert.equal(returned.records.at(-1).status, 'returned');
  const finished = act(returned, 'finish');
  assert.equal(archive(finished, 'G-205').find(({ id }) => id === 5).latestReceipt.status, 'shipped');
});

test('newly signed proof clears a premature release, while G-204 is tracked separately', () => {
  let state = untilHandoff(9, { decisions: { 4: 'pass', 5: 'pass', 10: 'pass', 11: 'pass' } });
  for (const [id, verifiedBy] of [[5, 9], [10, 14], [11, 13]]) {
    assert.equal(state.records.find((record) => record.id === id).verifiedBy, verifiedBy);
  }
  assert.equal(getEnding(state).id, 'issue');
  assert.deepEqual(getEnding(state).issues.map(({ id }) => id), [4]);
  state = act(state, 'recheck', { id: 4, value: 'review' });
  state = takeRecallReceipt(state, 4);
  const revised = state.records.find(({ id }) => id === 4);
  assert.equal(revised.original, 'pass');
  assert.equal(revised.status, 'recalled');
  assert.equal(revised.amendments[0].previousStatus, 'shipped');
  const corrected = getEnding(act(state, 'finish'));
  assert.equal(corrected.id, 'routine');
  assert.deepEqual(corrected.delayedReceipts, []);
});

test('unadopted offsite supplements only handle their paperwork and preserve the original shipment', () => {
  for (const [value, expectedStatus] of [['review', 'held'], ['fail', 'returned']]) {
    const issued = receiptAt(9, value, { decisions: { 5: 'pass' } });
    const original = issued.records.find(({ id }) => id === 5);
    const supplement = issued.records.at(-1);
    assert.equal(original.status, 'shipped');
    assert.equal(original.verifiedBy, undefined);
    assert.equal(supplement.priorShipmentId, 5);
    assert.equal(supplement.status, expectedStatus);
    assert.equal(isSupplementOnly(supplement), true);
    assert.match(receiptFeedback(issued), /补验联.*原批还在收货方/);

    const legacy = JSON.parse(JSON.stringify(issued));
    delete legacy.records.at(-1).priorShipmentId;
    legacy.records.at(-1).response = '我先放在黄线里。';
    assert.equal(receiptFeedback(legacy), receiptFeedback(issued));
    const archived = archive(legacy, 'G-205').find(({ id }) => id === 9);
    assert.equal(isSupplementOnly(archived.record), true);
    assert.equal(archived.previousReceipt.record.id, 5);
    assert.equal(legacy.records.at(-1).priorShipmentId, undefined);
    assert.equal(restoreRun(legacy).records.at(-1).priorShipmentId, 5);
    const handoff = untilHandoff(21, { initialState: legacy });
    const ending = getEnding(act(handoff, 'finish'));
    assert.deepEqual(ending.issues.map(({ id }) => id), [5]);
    assert.deepEqual(ending.delayedReceipts, []);
    const accepted = act(handoff, 'recheck', { id: 9, value: 'pass' });
    const active = archive(accepted, 'G-205').find(({ id }) => id === 5).latestReceipt;
    assert.equal(active.priorShipmentId, 5);
    assert.equal(active.status, 'shipped');
    assert.equal(isSupplementOnly(active), false);
  }

  const remainder = receiptAt(15, 'fail', { decisions: { 4: 'pass' } }).records.at(-1);
  assert.equal(remainder.priorShipmentId, undefined);
  assert.equal(isSupplementOnly(remainder), false);
});

test('only the active receipt can be corrected at the window, preserving its original stamp and facts', () => {
  const originalFinding = { key: 'doc:0:0', source: '外箱标签', text: '批号 · G-204' };
  const newFinding = { key: 'sample:4:front', source: '护目镜', text: '镜片中央有一道分叉白纹' };
  const issued = receiptAt(4, 'pass', { findings: [originalFinding] });
  const fresh = restoreRun(JSON.parse(JSON.stringify(issued)));
  assert.equal(canRecheckReceipt(fresh, 4), true);
  assert.equal(canRecheckReceipt(fresh, 3), false);
  assert.equal(canRecheckReceipt(fresh, '4'), false);
  assert.equal(act(fresh, 'recheck-receipt', { id: 3, value: 'fail' }), fresh);
  assert.equal(act(fresh, 'recheck-receipt', { id: 4, value: 'pass' }), fresh);
  assert.equal(act(fresh, 'recheck-receipt', { id: 4, value: 'recall' }), fresh);
  assert.equal(act(fresh, 'recheck', { id: 4, value: 'fail' }), fresh);
  const activeVisit = { ...fresh, events: [{ key: 'trace', npc: 'chen' }] };
  assert.equal(canRecheckReceipt(activeVisit, 4), false);
  assert.equal(act(activeVisit, 'recheck-receipt', { id: 4, value: 'fail' }), activeVisit);

  const corrected = act(fresh, 'recheck-receipt', { id: 4, value: 'fail', status: 'shipped', findings: [newFinding] });
  const record = corrected.records.at(-1);
  assert.equal(corrected.phase, 'receipt');
  assert.equal(record.id, 4);
  assert.equal(record.decision, 'fail');
  assert.equal(record.original, 'pass');
  assert.equal(record.status, 'returned');
  assert.equal(record.findings, fresh.records.at(-1).findings);
  assert.deepEqual(record.findings, [originalFinding]);
  assert.equal(record.recallReceipt, undefined);
  assert.deepEqual(record.amendments, [{ from: 'pass', to: 'fail', previousStatus: 'shipping', status: 'returned',
    day: 0, atWindow: true, findings: [newFinding] }]);
  assert.equal(corrected.records.length, fresh.records.length);
  assert.equal(corrected.records[0], fresh.records[0]);
  const departed = act(corrected, 'next');
  assert.equal(departed.phase, 'summary');
  assert.equal(canRecheckReceipt(departed, 4), false);
  assert.equal(act(departed, 'recheck-receipt', { id: 4, value: 'pass' }), departed);
  const week = untilHandoff(21, { initialState: departed });
  assert.equal(archive(week, 'G-204').find(({ id }) => id === 4).latestReceipt, null);
  assert.equal(week.records.find(({ id }) => id === 15).priorShipmentId, undefined);
  assert.deepEqual(getEnding(act(week, 'finish')).issues, []);
});

test('a pass withdrawn on the original G-205 slip does not make its next-day supplement paperwork-only', () => {
  const issued = receiptAt(5, 'pass');
  const corrected = act(issued, 'recheck-receipt', { id: 5, value: 'review' });
  let supplement;
  const week = untilHandoff(21, { initialState: restoreRun(JSON.parse(JSON.stringify(corrected))), decisions: { 9: 'review' }, inspect: (state, item) => {
    if (item.id === 9) supplement = act(state, 'stamp', { value: 'review' });
    return state;
  } });
  assert.equal(getPreviousReceipt(supplement).record.status, 'held');
  assert.equal(supplement.records.at(-1).priorShipmentId, undefined);
  const archived = archive(restoreRun(supplement), 'G-205').find(({ id }) => id === 9).record;
  assert.equal(archived.priorShipmentId, undefined);
  assert.equal(archived.status, 'held');
  assert.equal(isSupplementOnly(archived), false);
  assert.equal(week.records.find(({ id }) => id === 5).status, 'held');
});

test('withdrawing a same-window acceptance of an offsite supplement changes only the paperwork until handed over', () => {
  const issued = receiptAt(9, 'pass', { decisions: { 5: 'pass' } });
  assert.equal(issued.records.find(({ id }) => id === 5).verifiedBy, 9);
  assert.equal(issued.records.at(-1).status, 'shipped');
  const withdrawn = act(issued, 'recheck-receipt', { id: 9, value: 'review' });
  const restored = restoreRun(JSON.parse(JSON.stringify(withdrawn)));
  const original = archive(restored, 'G-205').find(({ id }) => id === 5);
  assert.equal(original.record.status, 'shipped');
  assert.equal(original.record.verifiedBy, undefined);
  assert.equal(original.latestReceipt, null);
  const supplemental = restored.records.at(-1);
  assert.equal(supplemental.priorShipmentId, 5);
  assert.equal(supplemental.status, 'held');
  assert.equal(isSupplementOnly(supplemental), true);
  assert.equal(supplemental.recallReceipt, undefined);
  assert.equal(act(restored, 'receive-recall', { id: 9 }), restored);

  const reaccepted = act(restored, 'recheck-receipt', { id: 9, value: 'pass' });
  assert.equal(reaccepted.records.at(-1).status, 'shipped');
  assert.equal(reaccepted.records.find(({ id }) => id === 5).verifiedBy, 9);
  const returned = act(reaccepted, 'recheck-receipt', { id: 9, value: 'fail' });
  assert.equal(returned.records.at(-1).status, 'returned');
  assert.equal(isSupplementOnly(returned.records.at(-1)), true);

  const week = untilHandoff(21, { initialState: restored });
  assert.deepEqual(getEnding(week).issues.map(({ id }) => id), [5]);
  const acceptedFriday = act(week, 'recheck', { id: 9, value: 'pass' });
  assert.equal(acceptedFriday.records.find(({ id }) => id === 9).status, 'shipped');
  const recalledFriday = act(acceptedFriday, 'recheck', { id: 9, value: 'review' });
  const then = archive(recalledFriday, 'G-205').find(({ id }) => id === 5).latestReceipt;
  assert.equal(then.id, 9);
  assert.equal(then.status, 'recallPending');
  assert.equal(Object.hasOwn(then.amendments.at(-1), 'atWindow'), false);
});

test('G-202 rework and G-205 priority read the last stamp handed over at the window', () => {
  const failed = receiptAt(2, 'fail');
  const passed = act(failed, 'recheck-receipt', { id: 2, value: 'pass' });
  const reviewed = act(passed, 'recheck-receipt', { id: 2, value: 'review' });
  assert.equal(getReworkFollowup(passed), null);
  assert.equal(getReworkFollowup(reviewed).document.fields.find(([label]) => label === '原单印章')[1], '要求审查');
  for (const [state, expected] of [[passed, false], [reviewed, true]]) {
    let dayOpening;
    untilHandoff(21, { initialState: state, inspect: (run) => {
      if (run.day === 1 && run.index === 0) dayOpening = run;
      return run;
    } });
    assert.equal(dayOpening.event?.key === 'rework:2', expected);
  }

  const state = g205AtWindow(1);
  const finding = intakeComparison(getCase(state), 1).finding;
  const shown = act(state, 'show-finding', { finding });
  const unfiled = act(shown, 'stamp', { value: 'pass' });
  const filed = act(unfiled, 'recheck-receipt', { id: 5, value: 'review' });
  assert.deepEqual(getWindowSupplementRequest(filed).proof, finding);
  assert.deepEqual(getDay({ ...filed, day: 2 }).cases.map(({ id }) => id), [9, 12, 10, 11]);
  const voided = act(filed, 'recheck-receipt', { id: 5, value: 'pass' });
  assert.equal(getWindowSupplementRequest(voided), null);
  assert.deepEqual(getDay({ ...voided, day: 2 }).cases.map(({ id }) => id), [12, 10, 11, 9]);
  assert.deepEqual(voided.records.at(-1).supplementRequest, finding);
  const refiled = act(restoreRun(JSON.parse(JSON.stringify(voided))), 'recheck-receipt', { id: 5, value: 'review' });
  assert.deepEqual(getWindowSupplementRequest(refiled).proof, finding);
});

test('departure leaves a superseded queued receipt as history while only the active one ships', () => {
  let state = untilHandoff(21, { decisions: { 5: 'review', 9: 'review' } });
  state = act(state, 'recheck', { id: 5, value: 'pass' });
  state = act(state, 'recheck', { id: 9, value: 'pass' });
  const prior = archive(state, 'G-205').find(({ id }) => id === 5);
  assert.equal(prior.record.status, 'shipping');
  assert.equal(prior.latestReceipt.status, 'shipping');
  const finished = act(state, 'finish');
  const after = archive(finished, 'G-205').find(({ id }) => id === 5);
  assert.equal(after.record, prior.record);
  assert.equal(after.latestReceipt.id, 9);
  assert.equal(after.latestReceipt.status, 'shipped');
  assert.equal(getEnding(finished).id, 'routine');
});

test('a signed same-lot supplement preserves the prior shipment in its immediate receipt', () => {
  const previousIds = new Map([[9, 5], [13, 11], [14, 10]]);
  for (const scenario of [
    { decisions: { 4: 'pass', 5: 'pass', 10: 'pass', 11: 'pass' }, expected: 'shipped' },
    { decisions: { 4: 'pass', 11: 'fail' }, expected: 'shipping' },
  ]) {
    const checked = new Set();
    untilHandoff(21, { decisions: scenario.decisions, inspect: (state, item) => {
      if (item.id === 15) {
        const remainder = act(state, 'stamp', { value: 'pass' });
        const old = archive(remainder, 'G-204').find(({ id }) => id === 4);
        assert.equal(old.record.status, 'shipped');
        assert.equal(old.latestReceipt, null);
        assert.equal(remainder.records.at(-1).status, 'shipping');
      }
      const previousId = previousIds.get(item.id);
      if (!previousId) return state;
      const stamped = act(state, 'stamp', { value: item.answer });
      const saved = JSON.parse(JSON.stringify(stamped));
      const regularReceipt = saved.records.at(-1);
      const history = archive(saved, item.batch).find(({ id }) => id === previousId);
      assert.equal(regularReceipt.id, item.id);
      assert.equal(regularReceipt.status, scenario.expected);
      assert.equal(history.latestReceipt, regularReceipt);
      assert.equal(history.record.status, state.records.find(({ id }) => id === previousId).status);
      assert.equal(restoreRun(saved), saved);
      checked.add(item.id);
      return state;
    } });
    assert.deepEqual(checked, new Set(previousIds.keys()));
  }
});

test('a first acceptance at handoff keeps the offsite lot shipped, and a later release can requeue', () => {
  const week = untilHandoff(21, { decisions: { 5: 'pass', 9: 'review' } });
  assert.deepEqual(getEnding(week).issues.map(({ id }) => id), [5]);
  const findings = [{ key: 'doc:1:1', source: '耳罩检验报告', text: '报告编号 · R-065' }];
  const accepted = act(week, 'recheck', { id: 9, value: 'pass', findings });
  const original = archive(accepted, 'G-205').find(({ id }) => id === 5);
  assert.equal(original.latestReceipt.status, 'shipped');
  assert.equal(original.latestReceipt.amendments.at(-1).status, 'shipped');
  assert.deepEqual(original.latestReceipt.amendments.at(-1).findings, findings);
  assert.deepEqual(getEnding(accepted).issues, []);

  const recalled = takeRecallReceipt(act(accepted, 'recheck', { id: 9, value: 'review' }), 9);
  const requeued = act(JSON.parse(JSON.stringify(recalled)), 'recheck', { id: 9, value: 'pass' });
  assert.equal(archive(requeued, 'G-205').find(({ id }) => id === 5).latestReceipt.status, 'shipping');
  assert.equal(restoreRun(requeued), requeued);
  const shipped = act(requeued, 'finish');
  assert.equal(archive(shipped, 'G-205').find(({ id }) => id === 5).latestReceipt.status, 'shipped');
});

test('restoring an active legacy save corrects only a supplement queued for a shipment already offsite', () => {
  let checked = false;
  untilHandoff(21, { decisions: { 11: 'pass' }, inspect: (state, item) => {
    if (item.id !== 13) return state;
    const receipt = act(state, 'stamp', { value: 'pass' });
    const legacy = {
      ...receipt,
      records: receipt.records.map((record) => record.id === 13 ? { ...record, status: 'shipping' } : record),
    };
    for (const active of [legacy, act(legacy, 'next')]) {
      const saved = JSON.parse(JSON.stringify(active));
      const loaded = restoreRun(saved);
      const original = archive(loaded, 'G-211').find(({ id }) => id === 11);
      assert.equal(original.record, saved.records.find(({ id }) => id === 11));
      assert.equal(original.latestReceipt.status, 'shipped');
      assert.equal(saved.records.find(({ id }) => id === 13).status, 'shipping');
      assert.equal(loaded.phase, active.phase);
      assert.equal(restoreRun(loaded), loaded);
    }
    const historical = { ...legacy, phase: 'summary' };
    assert.equal(restoreRun(historical), historical);
    checked = true;
    return state;
  } });
  assert.equal(checked, true);
});

test('an accepted same-lot receipt owns the disposition and preserves the first receipt', () => {
  let state = untilHandoff(21, { decisions: { 5: 'pass' } });
  const original = archive(state, 'G-205').find(({ id }) => id === 5);
  assert.equal(original.record.original, 'pass');
  assert.equal(original.record.status, 'shipped');
  assert.equal(original.latestReceipt.id, 9);
  assert.equal(original.latestReceipt.status, 'shipped');
  assert.equal(act(state, 'recheck', { id: 5, value: 'review' }), state);

  state = takeRecallReceipt(act(state, 'recheck', { id: 9, value: 'review' }), 9);
  const restored = JSON.parse(JSON.stringify(state));
  const historical = archive(restored, 'G-205').find(({ id }) => id === 5);
  assert.deepEqual(historical.record, original.record);
  assert.equal(historical.latestReceipt.status, 'recalled');
  assert.equal(historical.latestReceipt.decision, 'review');
  assert.deepEqual(historical.latestReceipt.amendments.map(({ from, to }) => [from, to]), [['pass', 'review']]);
  assert.equal(getEnding(act(restored, 'finish')).id, 'routine');
});

test('a follow-up that was never accepted leaves a prematurely shipped lot actionable', () => {
  let state = untilHandoff(21, { decisions: { 5: 'pass', 9: 'review' } });
  state = { ...state, records: state.records.map((record) => record.id === 5 ? { ...record, verifiedBy: 9 } : record) };
  assert.equal(archive(state, 'G-205').find(({ id }) => id === 5).latestReceipt, null);
  assert.deepEqual(getEnding(state).issues.map(({ id }) => id), [5]);
  const corrected = takeRecallReceipt(act(state, 'recheck', { id: 5, value: 'review' }), 5);
  assert.equal(corrected.records.find(({ id }) => id === 5).status, 'recalled');
  assert.equal(getEnding(act(corrected, 'finish')).id, 'routine');
});

test('a new sample from the factory remainder cannot replace the receipt for shipped G-204', () => {
  let state = untilHandoff(21, { decisions: { 4: 'pass' } });
  state = { ...state, records: state.records.map((record) => record.id === 4 ? { ...record, verifiedBy: 15 } : record) };
  assert.equal(archive(state, 'G-204').find(({ id }) => id === 4).latestReceipt, null);
  assert.deepEqual(getEnding(state).issues.map(({ id }) => id), [4]);
  const corrected = takeRecallReceipt(act(state, 'recheck', { id: 4, value: 'review' }), 4);
  assert.equal(corrected.records.find(({ id }) => id === 4).status, 'recalled');
  assert.equal(corrected.records.find(({ id }) => id === 15).status, 'returned');
});

test('a returning delivery finds the exact previous stamp and status after a save reload', () => {
  const expected = new Map([
    [9, { id: 5, decision: 'review', status: 'held', sameLot: true }],
    [13, { id: 11, decision: 'review', status: 'held', sameLot: true }],
    [14, { id: 10, decision: 'fail', status: 'returned', sameLot: true }],
    [15, { id: 4, decision: 'pass', status: 'shipped', sameLot: false }],
  ]);
  const checked = new Set();
  untilHandoff(21, { decisions: { 4: 'pass', 10: 'fail' }, inspect: (state, item) => {
    if (state.event) return state;
    const restored = JSON.parse(JSON.stringify(state));
    const previous = getPreviousReceipt(restored);
    assert.deepEqual(archive(restored).find(({ id }) => id === item.id).previousReceipt, previous);
    const target = expected.get(item.id);
    if (!target) {
      assert.equal(previous, null);
    } else {
      const { id, decision, status } = previous.record;
      assert.equal(previous.record, restored.records.find((row) => row.id === target.id));
      assert.deepEqual({ id, decision, status, sameLot: previous.sameLot }, target);
      checked.add(item.id);
    }
    return state;
  } });
  assert.deepEqual(checked, new Set(expected.keys()));
});

test('107 requires the first G-211 record, and tells the player when the visitor can hand over the receipt', () => {
  const script = PHONE['107'];
  const checked = [];
  const handoff = untilHandoff(21, { inspect: (state, item) => {
    if (item.id !== 11 && item.id !== 13) return state;
    for (const details of [{}, { caseIds: [13] }]) {
      const greeting = act(state, 'dial', { number: '107', ...details });
      assert.equal(greeting.phone.line, script.greeting);
      assert.deepEqual(greeting.pending, []);
      assert.equal(greeting.event, null);
    }
    const called = act(state, 'dial', { number: '107', caseIds: [11] });
    assert.equal(called.phone.kind, 'night');
    assert.deepEqual(called.phone.lines, [script.found, '你先把手上这批办完。我到窗口递给你。']);
    assert.deepEqual(called.pending, ['night']);
    assert.equal(called.flags.nightDocument, false);
    assert.equal(called.event, null);
    const repeat = act(called, 'dial', { number: '107' });
    assert.equal(repeat.phone.lines.at(-1), called.phone.lines.at(-1));
    assert.deepEqual(repeat.pending, ['night']);

    const legacy = JSON.parse(JSON.stringify(act(state, 'explore', { key: 'g211' })));
    assert.deepEqual(act(legacy, 'dial', { number: '107' }).pending, ['night']);
    checked.push(item.id);
    return state;
  } });
  assert.deepEqual(checked, [11, 13]);

  const called = act(handoff, 'dial', { number: '107', caseIds: [11] });
  assert.deepEqual(called.phone.lines, [script.found, '我这就到窗口。']);
  assert.equal(called.event.key, 'night');
  assert.equal(called.flags.nightDocument, false);
  const repeated = act(called, 'dial', { number: '107' });
  assert.equal(repeated.phone.lines.at(-1), '回执已经递到窗口了。');
  assert.equal(repeated.events.length, 1);
  assert.equal(act(repeated, 'ack-visit').flags.nightDocument, true);
});

test('the night receipt adds context without replacing the previous decision in Tang’s dialogue', () => {
  for (const previous of ['pass', 'fail', 'review']) {
    untilHandoff(21, { decisions: { 11: previous }, inspect: (state, item) => {
      if (item.id === 11) return act(state, 'dial', { number: '107', caseIds: [11] });
      if (item.id === 13) {
        assert.ok(state.flags.nightDocument);
        assert.equal(item.line, `${item.followUp.lines[previous]} ${item.nightResponse}`);
        const beforeReceipt = { ...state, flags: { ...state.flags, nightDocument: false } };
        assert.equal(getCase(beforeReceipt).line, item.followUp.lines[previous]);
      }
      return state;
    } });
  }
});

test('night receipt and self-call stay independent of the three endings', () => {
  let state = untilHandoff(6, { inspect: (state, item) => {
    if (item.id === 11) return act(state, 'dial', { number: '107', caseIds: [11] });
    if (state.records.at(-1)?.id === 11) {
      assert.equal(state.flags.nightDocument, false);
      assert.equal(state.event.npc, 'sun');
    }
    if (item.id === 13) assert.match(item.line, /孙姐/);
    return state;
  } });
  state = act(state, 'attach', { key: 'night' });
  state = act(state, 'dial', { number: '880' });
  assert.equal(state.phone.kind, 'ringback-test');
  assert.equal(state.flags.ringback, false);
  assert.equal(getIncomingCall(state), null);
  state = act(state, 'hang-up');
  assert.equal(getIncomingCall(state), 'ringback');
  assert.equal(getEnding(act(state, 'finish')).id, 'routine');
  state = act(state, 'answer-call');
  assert.equal(state.phone.incomingKey, 'ringback');
  assert.equal(state.flags.ringback, true);
  assert.equal(state.flags.nightAttached, true);
  assert.equal(getEnding(act(state, 'finish')).id, 'routine');
});

test('Tuesday close rings once and can be answered or left without changing the shift', () => {
  const receipt = tuesdayClosingReceipt();
  assert.equal(getIncomingCall(receipt), null);
  const summary = act(receipt, 'next');
  assert.equal(summary.phase, 'summary');
  assert.equal(getIncomingCall(summary), 'lab-close');
  assert.equal(summary.phone, null);
  assert.deepEqual(summary.phoneLog, []);
  assert.deepEqual(summary.pending, []);
  assert.deepEqual(summary.events, []);
  assert.equal(act(summary, 'next'), summary);

  const missed = act(JSON.parse(JSON.stringify(summary)), 'advance-day');
  assert.equal(missed.day, 2);
  assert.equal(missed.phase, 'brief');
  assert.equal(getIncomingCall(missed), null);
  assert.deepEqual(missed.phoneLog, []);

  const answered = act(JSON.parse(JSON.stringify(summary)), 'answer-call');
  assert.equal(getIncomingCall(answered), null);
  assert.equal(answered.phone, answered.phoneLog.at(-1));
  assert.equal(answered.phone.kind, 'incoming');
  assert.equal(answered.phone.incomingKey, 'lab-close');
  assert.equal(answered.phone.day, 1);
  assert.equal(answered.phone.number, '204');
  assert.equal(answered.phone.npc, 'chen');
  assert.match(answered.phone.line, /明早一起送/);
  assert.doesNotMatch(answered.phone.line, /R-071|G-241|G-248/);
  assert.deepEqual(answered.records, summary.records);
  assert.deepEqual(answered.flags, summary.flags);
  assert.deepEqual(answered.pending, []);
  assert.equal(act(answered, 'answer-call'), answered);
  assert.equal(act(answered, 'advance-day').day, 2);
});

test('204 registers the G-205 inquiry once only when its order is explicitly brought', () => {
  const { greeting, requests } = PHONE['204'];
  const script = requests[5];
  const inspected = [];
  const handoff = untilHandoff(21, { inspect: (state, item) => {
    if (item.id === 5) {
      assert.equal(act(state, 'dial', { number: '204', report: true, context: true }).phone.line, greeting);
      assert.equal(act(state, 'dial', { number: '204', caseIds: [10] }).phone.line, greeting);
      const requested = act(state, 'dial', { number: '204', caseIds: [5] });
      assert.equal(requested.records, state.records);
      assert.equal(requested.flags, state.flags);
      assert.equal(requested.seen, state.seen);
      assert.equal(requested.pending, state.pending);
      assert.deepEqual(requested.phone, {
        number: '204', npc: 'chen', lines: [script.requested], line: script.requested,
        kind: 'lab-request', caseId: 5, day: 1,
      });
      const reloaded = JSON.parse(JSON.stringify(requested));
      const repeated = act(reloaded, 'dial', { number: '204', caseIds: [5] });
      assert.equal(repeated.phone.line, script.repeat);
      assert.equal(repeated.phone.caseId, 5);
      assert.equal(repeated.phoneLog.filter(({ kind }) => kind === 'lab-request').length, 1);
      inspected.push(item.id);
      return repeated;
    }
    if (item.id === 9) {
      assert.equal(item.line, `${item.followUp.lines.review} ${script.delivery}`);
      assert.equal(act(state, 'dial', { number: '204', caseIds: [5] }).phone.line, script.arrived);
      assert.equal(getCase(state).answer, 'pass');
      inspected.push(item.id);
    }
    return state;
  } });
  assert.deepEqual(inspected, [5, 9]);
  assert.equal(handoff.records.length, 20);
  assert.equal(getEnding(act(handoff, 'finish')).id, 'routine');

  const afterFirst = act(receiptAt(5, 'review'), 'next');
  assert.notEqual(getCase(afterFirst).id, 5);
  assert.equal(act(afterFirst, 'dial', { number: '204', caseIds: [5] }).phone.kind, 'lab-request');
  const afterBoth = act(untilHandoff(21), 'dial', { number: '204', caseIds: [5] });
  assert.equal(afterBoth.phone.line, script.arrived);
  assert.equal(afterBoth.phone.caseId, undefined);
  assert.equal(afterBoth.phoneLog.some(({ kind }) => kind === 'lab-request'), false);
});

test('the G-248 inquiry follows the newest explicit order until both R-071 slips take priority', () => {
  const lab = PHONE['204'];
  const script = lab.requests[10];
  const inspected = [];
  untilHandoff(21, { inspect: (state, item) => {
    if (item.id === 10) {
      assert.equal(act(state, 'dial', { number: '204' }).phone.line, lab.greeting);
      assert.equal(act(state, 'dial', { number: '204', caseIds: [10, 7] }).phone.line, lab.relatedHint);
      const marked = act(state, 'explore', { key: 'r071-241' });
      assert.equal(act(marked, 'dial', { number: '204' }).phone.line, lab.relatedHint);
      assert.equal(act(marked, 'dial', { number: '204', caseIds: [10] }).phone.line, script.requested);
      const requested = act(marked, 'dial', { number: '204', caseIds: [7, 10] });
      assert.equal(requested.phone.caseId, 10);
      assert.equal(requested.phone.day, 2);
      assert.equal(requested.phone.line, script.requested);
      assert.deepEqual(requested.pending, []);
      inspected.push(item.id);
      return requested;
    }
    if (item.id === 14) {
      assert.equal(item.line, `${item.followUp.lines.review} ${script.delivery}`);
      assert.equal(act(state, 'dial', { number: '204', caseIds: [10] }).phone.line, script.arrived);
      const both = act(state, 'explore', { key: 'r071-248' });
      const traced = act(both, 'dial', { number: '204', caseIds: [7, 10] });
      assert.equal(traced.phone.kind, 'trace');
      assert.deepEqual(traced.pending, ['trace']);
      assert.equal(traced.phoneLog.filter(({ kind }) => kind === 'lab-request').length, 1);
      inspected.push(item.id);
    }
    return state;
  } });
  assert.deepEqual(inspected, [10, 14]);
});

test('204 distinguishes the current R-084 report from the two actual R-071 originals', () => {
  const script = PHONE['204'];
  const first = { id: 7, index: 1 };
  const retest = { id: 14, index: 1 };
  const withdrawn = { id: 14, index: 2 };
  const state = receiptAt(14, 'pass');
  const call = (papers) => act(state, 'dial', { number: '204', papers });

  assert.equal(getTraceInquiry(state), null);
  assert.equal(getPhoneReportLookup(state), null);
  for (const [paper, hint] of [[first, script.relatedHint], [withdrawn, script.archiveHint]]) {
    const single = call([paper]);
    assert.equal(single.phone.line, hint);
    assert.equal(single.phone.reportNumber, 'R-071');
    assert.equal(getPhoneReportLookup(JSON.parse(JSON.stringify(single))), 'R-071');
    assert.equal(getTraceInquiry(single), null);
    const { reportNumber, ...legacyPhone } = single.phone;
    assert.equal(getPhoneReportLookup({ ...single, phone: legacyPhone }), reportNumber);
    assert.equal(getPhoneReportLookup({ ...single, seen: [] }), null);
  }
  for (const papers of [[retest], [first, retest], [retest, first], [withdrawn, retest]]) {
    const wrongPair = call(papers);
    assert.equal(wrongPair.phone.line, script.retestHint);
    assert.equal(getPhoneReportLookup(wrongPair), null);
    assert.equal(getTraceInquiry(wrongPair), null);
    assert.deepEqual(wrongPair.pending, []);
  }
  assert.equal(call([{ ...first, index: 0 }, withdrawn]).phone.line, script.archiveHint);
  assert.equal(call([{ ...first, index: null }, { ...withdrawn, index: null }]).phone.line, script.greeting);
  const empty = act(state, 'dial', { number: '204', papers: [], caseIds: [7, 14], report: true });
  assert.equal(empty.phone.line, script.greeting);
  assert.deepEqual(empty.pending, []);

  const beforeArrival = act(receiptAt(10, 'review'), 'dial', { number: '204', papers: [first, withdrawn] });
  assert.equal(beforeArrival.phone.line, script.relatedHint);
  assert.equal(getPhoneReportLookup(beforeArrival), 'R-071');
  assert.deepEqual(archivedReportSources(beforeArrival, 'R-071').map(({ id }) => id), [first.id]);
  assert.equal(getTraceInquiry(beforeArrival), null);
  assert.deepEqual(beforeArrival.pending, []);
  const paired = call([first, withdrawn, { id: 10, index: 2 }]);
  assert.equal(paired.phone.kind, 'trace');
  assert.equal(getPhoneReportLookup(paired), null);
  assert.deepEqual(paired.pending, ['trace']);
  const delivered = act(JSON.parse(JSON.stringify(paired)), 'next');
  assert.equal(delivered.event.key, 'trace');
  assert.equal(delivered.flags.traceDocument, false);
  assert.equal(act(delivered, 'ack-visit').flags.traceDocument, true);

  let marked = act(state, 'explore', { key: 'r071-241' });
  marked = act(marked, 'explore', { key: 'r071-248' });
  const fromLegacySources = act(JSON.parse(JSON.stringify(marked)), 'dial', { number: '204', papers: [] });
  assert.equal(fromLegacySources.phone.kind, 'trace');
  assert.deepEqual(fromLegacySources.phone.papers, [first, withdrawn]);
  const explicitRetest = act(marked, 'dial', { number: '204', papers: [retest] });
  assert.equal(explicitRetest.phone.line, script.retestHint);
  assert.equal(getTraceInquiry(explicitRetest), null);
});

test('the exact R-071 inquiry records both real sources and survives unrelated calls and handoff', () => {
  const state = receiptAt(14, 'pass');
  const papers = [{ id: 7, index: 1 }, { id: 14, index: 2 }];
  let called = act(state, 'dial', { number: '204', papers: papers.toReversed() });
  assert.deepEqual(called.phone.papers, papers);
  assert.equal(called.phone.day, 3);
  const inquiry = getTraceInquiry(called);
  assert.equal(inquiry.day, 3);
  assert.equal(inquiry.number, '204');
  assert.deepEqual(inquiry.sources, archivedReportSources(called, 'R-071'));
  assert.deepEqual(inquiry.sources.map(({ batch, document }) => [batch, document.title]), [
    ['G-241', '随货核验联'], ['G-248', '作废随货联'],
  ]);

  called = act(called, 'dial', { number: '204', papers });
  for (let i = 0; i < 25; i++) called = act(called, 'dial', { number: '555' });
  assert.equal(called.phoneLog.length, 20);
  assert.equal(called.phoneLog.filter(({ kind }) => kind === 'trace').length, 1);
  assert.equal(called.phone.kind, 'unavailable');
  assert.deepEqual(called.pending, ['trace']);
  const restored = restoreRun(JSON.parse(JSON.stringify(called)));
  assert.deepEqual(getTraceInquiry(restored), inquiry);
  const delivered = act(restored, 'next');
  assert.equal(delivered.flags.traceDocument, false);
  const filed = act(delivered, 'ack-visit');
  assert.equal(filed.flags.traceDocument, true);
  const handoff = untilHandoff(21, { initialState: filed });
  const finished = restoreRun(JSON.parse(JSON.stringify(act(handoff, 'finish'))));
  assert.deepEqual(getTraceInquiry(finished), inquiry);
  assert.equal(finished.flags.traceDocument, true);
});

test('saved legacy R-071 calls require real source papers and do not invent their call date', () => {
  const legacyCall = { kind: 'trace', number: '204', lines: [PHONE['204'].inquiry, PHONE['204'].found] };
  const oldSave = restoreRun(JSON.parse(JSON.stringify({ ...receiptAt(14, 'pass'), phoneLog: [legacyCall] })));
  const inquiry = getTraceInquiry(oldSave);
  assert.equal(inquiry.day, null);
  assert.deepEqual(inquiry.sources, archivedReportSources(oldSave, 'R-071'));
  const pruned = Array.from({ length: 25 }).reduce((state) => act(state, 'dial', { number: '555' }), oldSave);
  assert.deepEqual(getTraceInquiry(pruned), inquiry);

  const earlySave = { ...receiptAt(10, 'review'), phoneLog: [legacyCall] };
  assert.equal(getTraceInquiry(earlySave), null);
  const wrongSource = { ...legacyCall, papers: [{ id: 7, index: 1 }, { id: 14, index: 1 }] };
  assert.equal(getTraceInquiry({ ...oldSave, phoneLog: [wrongSource] }), null);
});

test('204 routine requests and 107 follow-ups accept only the relevant pinned page', () => {
  for (const [id, wrongIndex, orderIndex] of [[5, 0, 1], [10, 1, 2]]) {
    const state = receiptAt(id, 'review');
    const wrongPage = act(state, 'dial', { number: '204', papers: [{ id, index: wrongIndex }] });
    assert.equal(wrongPage.phone.line, PHONE['204'].greeting);
    const order = { id, index: orderIndex };
    const requested = act(state, 'dial', { number: '204', papers: [order] });
    assert.equal(requested.phone.kind, 'lab-request');
    assert.equal(requested.phone.caseId, id);
    if (id !== 10) continue;
    const oldSlip = { id: 7, index: 1 };
    assert.equal(act(state, 'dial', { number: '204', papers: [oldSlip, order] }).phone.kind, 'lab-request');
    assert.equal(act(state, 'dial', { number: '204', papers: [order, oldSlip] }).phone.line, PHONE['204'].relatedHint);
  }

  const state = receiptAt(13, 'pass');
  for (const papers of [[{ id: 11, index: 0 }], [{ id: 11, index: 1 }], [{ id: 11, index: null }], [{ id: 13, index: 2 }]]) {
    const wrongPage = act(state, 'dial', { number: '107', papers, caseIds: [11] });
    assert.equal(wrongPage.phone.line, PHONE['107'].greeting);
    assert.deepEqual(wrongPage.pending, []);
  }
  const requested = act(state, 'dial', { number: '107', papers: [{ id: 11, index: 2 }] });
  assert.equal(requested.phone.kind, 'night');
  assert.deepEqual(requested.pending, ['night']);
  const marked = act(state, 'explore', { key: 'g211' });
  assert.equal(act(marked, 'dial', { number: '107', papers: [] }).phone.kind, 'night');
});

test('ordinary lab requests and answered calls remain in the limited phone log after unrelated calls', () => {
  let state = untilHandoff(21, { inspect: (state, item) => [5, 10].includes(item.id)
    ? act(state, 'dial', { number: '204', caseIds: [item.id] }) : state });
  state = act(act(act(state, 'dial', { number: '880' }), 'hang-up'), 'answer-call');
  for (let i = 0; i < 25; i++) state = act(state, 'dial', { number: '555' });
  assert.equal(state.phoneLog.length, 20);
  assert.equal(state.phoneLog.at(-1), state.phone);
  assert.deepEqual(state.phoneLog.filter(({ kind }) => kind === 'lab-request').map(({ caseId }) => caseId), [5, 10]);
  assert.equal(state.phoneLog.find(({ kind }) => kind === 'incoming').incomingKey, 'ringback');
});

test('the 880 recording waits for hang-up and pickup, and answered calls survive later outgoing calls', () => {
  let state = act(tuesdayClosingReceipt(), 'next');
  state = act(state, 'dial', { number: '880' });
  assert.equal(state.phone.kind, 'ringback-test');
  assert.equal(state.phone.npc, null);
  assert.equal(state.phone.lines.length, 1);
  assert.match(state.phone.line, /短音/);
  assert.doesNotMatch(state.phone.line, /听见响就合格/);
  assert.equal(state.flags.ringback, false);
  assert.equal(getIncomingCall(state), 'lab-close');
  assert.equal(state.ringbackArmed, true);
  state = act(JSON.parse(JSON.stringify(state)), 'hang-up');
  assert.deepEqual(state.incomingCalls, ['lab-close', 'ringback']);
  assert.equal(state.ringbackArmed, false);

  state = act(act(state, 'dial', { number: '880' }), 'hang-up');
  assert.deepEqual(state.incomingCalls, ['lab-close', 'ringback']);
  assert.equal(act(state, 'hang-up'), state);
  state = act(state, 'answer-call');
  assert.equal(state.phone.incomingKey, 'lab-close');
  assert.equal(getIncomingCall(state), 'ringback');
  assert.equal(state.flags.ringback, false);
  state = act(JSON.parse(JSON.stringify(state)), 'answer-call');
  assert.equal(state.phone.incomingKey, 'ringback');
  assert.equal(state.phone.npc, 'zhou');
  assert.match(state.phone.line, /听见响就合格/);
  assert.equal(state.flags.ringback, true);
  assert.equal(getIncomingCall(state), null);
  assert.deepEqual(state.pending, []);

  const earlierRecording = state.phone;
  state = act(act(act(state, 'dial', { number: '880' }), 'hang-up'), 'answer-call');
  assert.notEqual(state.phone, earlierRecording);
  assert.equal(state.phoneLog.includes(earlierRecording), false);
  for (let index = 0; index < 25; index++) state = act(state, 'dial', { number: '204' });
  assert.equal(state.phoneLog.length, 20);
  assert.equal(state.phoneLog.at(-1), state.phone);
  assert.deepEqual(state.phoneLog.filter(({ kind }) => kind === 'incoming').map(({ incomingKey }) => incomingKey),
    ['lab-close', 'ringback']);
});

test('a save from before ringing calls has no active line and can still request a new ringback', () => {
  const legacy = untilHandoff(21);
  delete legacy.incomingCalls;
  delete legacy.ringbackArmed;
  assert.equal(getIncomingCall(legacy), null);
  assert.equal(act(legacy, 'hang-up'), legacy);
  assert.equal(act(legacy, 'answer-call'), legacy);
  const callback = act(act(legacy, 'dial', { number: '880' }), 'hang-up');
  assert.equal(getIncomingCall(callback), 'ringback');
  const finished = act(callback, 'finish');
  assert.equal(finished.phase, 'ending');
  assert.equal(getIncomingCall(finished), null);
  assert.deepEqual(finished.incomingCalls, []);
});

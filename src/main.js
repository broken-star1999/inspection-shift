import { createRun, createFollowingRun, restoreRun, dispatch, getCase, getDay, getEnding, getIncomingCall, getPreviousReceipt, getReworkFollowup, getShipmentAcceptance, archive, archivedReportSources, receiptDisposition, TUTORIAL, EVIDENCE } from './engine.js';
import { DAYS, EASTER_EGGS, PHONE, SHIPMENT_ACCEPTANCE, documentExtension } from './content.js';
import { cuffSplitVisible, sampleAppearance, sampleFinding } from './samples.js';
import { bindViewport, toggleFullscreen, stagePoint, playSound, isMuted, setMuted } from './devices.js';
import { captureDeskProjection } from './desk-projection.js';
import { freshInteraction, captureInspectionProgress, restoreInspectionProgress, tutorialActionComplete } from './inspection-progress.js';
import { readFindings } from './inspection-findings.js';
import { intakeComparison, projectComparison, relabelComparison } from './document-comparison.js';
import { handoffComparison } from './handoff-comparison.js';
import * as view from './view.js';
import './style.css';
import './booth.css';
import './inspection.css';
import './view-camera.css';
import './modeled-booth.css';
import './devices.css';
import './sample-inspection.css';

const root = document.querySelector('#game');
const SAVE_KEY = 'nandu-inspection-save-v1';
const COLLECTION_KEY = 'nandu-inspection-endings-v1';
const COMPLETED_KEY = 'nandu-inspection-completed-v1';
const ENDING_IDS = ['routine', 'trace', 'issue'];
const ARRIVAL_PAUSE_MS = 1150;
const NEXT_BATCH_PAUSE_MS = 1650;
const VISIT_HANDOVER_MS = 760;
const ARRIVAL_APPROACH_MS = 465;

function readStorage(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

function writeStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Private storage can be unavailable. */ }
}

function validSave(value) {
  return value?.version === 1 && Number.isInteger(value.day) && value.day >= 0 && value.day < 5 &&
    ['brief', 'case', 'receipt', 'summary', 'handoff', 'ending'].includes(value.phase) &&
    Number.isInteger(value.index) && value.index >= 0 && value.index < 4 && value.flags &&
    Array.isArray(value.records) && Array.isArray(value.seen) && Array.isArray(value.pending) && Array.isArray(value.phoneLog);
}

function readEndingIds() {
  const collection = readStorage(COLLECTION_KEY);
  return Array.isArray(collection) ? collection.filter((id) => ENDING_IDS.includes(id)) : [];
}

function readCompletedShifts() {
  const history = readStorage(COMPLETED_KEY);
  const shifts = new Map();
  if (!Array.isArray(history)) return shifts;
  for (const entry of history) {
    if (!ENDING_IDS.includes(entry?.id) || shifts.has(entry.id) ||
      entry.run?.phase !== 'ending' || !validSave(entry.run)) continue;
    shifts.set(entry.id, entry.run);
  }
  return shifts;
}

function rememberCompletedShift(finished) {
  const { inspectionProgress, ...snapshot } = finished;
  const { id } = getEnding(snapshot);
  const previous = new Map([...completedShifts, ...readCompletedShifts()]);
  previous.delete(id);
  completedShifts = new Map([[id, snapshot], ...previous]);
  endings = [...new Set([...readEndingIds(), ...endings, ...completedShifts.keys()])];
  writeStorage(COMPLETED_KEY, Array.from(completedShifts, ([id, run]) => ({ id, run })));
  writeStorage(COLLECTION_KEY, endings);
}

let saved = readStorage(SAVE_KEY);
if (!validSave(saved)) saved = null;
let completedShifts = readCompletedShifts();
let endings = [...new Set([...readEndingIds(), ...completedShifts.keys()])];
if (saved?.phase === 'ending' && !completedShifts.has(getEnding(saved).id)) rememberCompletedShift(saved);
let run = null;
let reviewingHistory = false;
let panel = null;
let scenery;
let modeledReady = false;
let toastTimer;
let arrivalTimer = 0;
let arrival = null;
let closingShotTimer = 0;
let closingShot = null;
let workspaceScrollTimer = 0;
let drag;
let toolDrag = null;
let toolClickTarget = null;
let stampTouch = null;
let suppressPaperClick = false;
let modalOpener = null;
let archiveReturn = null;
let reportIndex = null;
let correctionDraft = null;
let handoffFocus = null;
let handoffDocument = null;
let handoffPairOpen = false;
let phoneReturn = null;
let ringing = null;
let issuedReceiptId = null;
let presentedEvidence = null;
let interaction = freshInteraction();

root.innerHTML = view.shell();
const status = root.querySelector('#top-status');
const booth = root.querySelector('.booth-layout');
const wallShift = root.querySelector('#wall-shift');
const hud = root.querySelector('#room-hud');
const arrivalStatus = root.querySelector('#arrival-status');
const desktop = root.querySelector('#desk');
const screenLayer = root.querySelector('#screen');
const modalLayer = root.querySelector('#modal');
const toastBox = root.querySelector('.game-toast');
const roomHost = root.querySelector('.canvas-room');
const cargoHost = root.querySelector('.booth-cargo');
const illustratedWorker = roomHost.querySelector('.static-worker');
const modelHost = root.querySelector('.model-world');
const soundToggle = root.querySelector('[data-act="sound"]');
const fullscreenToggle = root.querySelector('[data-act="fullscreen"]');
const phoneFixture = booth.querySelector('.wall-phone');
const phoneFixtureLabel = phoneFixture.querySelector('b');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const gaze = { x: 0, y: 0, targetX: 0, targetY: 0, frame: 0, time: 0 };
let fixtureElements = [...booth.querySelectorAll('[data-fixture]')];
let fixtureLayout = {};

bindViewport(root, ({ fullscreen, immersive, rotated }) => {
  const expanded = fullscreen || immersive;
  fullscreenToggle.setAttribute('aria-pressed', String(expanded));
  fullscreenToggle.setAttribute('aria-label', expanded ? '退出全屏' : '全屏');
  if (rotated) resetGaze();
});

function placeFixtures() {
  const sample = fixtureLayout.sample;
  const sampleBottom = sample ? `${(sample.y + sample.h).toFixed(1)}px` : '';
  for (const element of fixtureElements) {
    const fixture = element.dataset.fixture;
    const rect = fixtureLayout[fixture === 'findings' ? 'pass' : fixture];
    element.toggleAttribute('data-fixture-visible', Boolean(rect));
    if (!rect) continue;
    const { x, y, w, h } = rect;
    element.style.setProperty('--fixture-x', `${x.toFixed(1)}px`);
    element.style.setProperty('--fixture-y', `${y.toFixed(1)}px`);
    element.style.setProperty('--fixture-w', `${w.toFixed(1)}px`);
    element.style.setProperty('--fixture-h', `${h.toFixed(1)}px`);
    if (fixture === 'findings' || element.matches('.stamp')) {
      element.style.setProperty('--fixture-sample-bottom', sampleBottom);
    }
  }
}

function showModeledScene() {
  if (!modeledReady || root.dataset.modeled === 'true' || panel || drag) return;
  if (!arrival && (run?.phase === 'case' || run?.phase === 'receipt' || activeVisit())) return;
  root.dataset.modeled = 'true';
}

function suspendModeledScene() {
  modeledReady = false;
  if (root.dataset.modeled !== 'true') return;
  if (drag) endDrag(drag);
  stampTouch = null;
  delete root.dataset.modeled;
  setScene();
}

async function startScene() {
  const baseUrl = import.meta.env.BASE_URL;
  try {
    const { mountModeledBooth } = await import('./modeled-booth.js');
    scenery = mountModeledBooth(modelHost, {
      baseUrl,
      onLayout(layout) {
        fixtureLayout = layout;
        placeFixtures();
      },
      onReady() {
        modeledReady = true;
        showModeledScene();
      },
      onUnavailable: suspendModeledScene,
    });
  } catch { /* The illustrated booth remains available when 3D is unavailable. */ }
  if (!scenery) {
    try {
      const { mountScenery } = await import('./scenery.js');
      scenery = mountScenery(roomHost, { baseUrl });
    } catch { roomHost.dataset.renderer = 'static'; }
  }
  setScene();
  scenery?.setViewPose(gaze.x, gaze.y);
}

void startScene();

function drawGaze(x, y) {
  gaze.x = x;
  gaze.y = y;
  const distance = Math.max(Math.abs(x), Math.abs(y));
  root.toggleAttribute('data-view-turned', distance > 0);
  root.style.setProperty('--view-x', x.toFixed(4));
  root.style.setProperty('--view-y', y.toFixed(4));
  root.style.setProperty('--view-distance', distance.toFixed(4));
  scenery?.setViewPose(x, y);
}

function resetGaze() {
  if (gaze.frame) cancelAnimationFrame(gaze.frame);
  gaze.frame = 0;
  gaze.time = 0;
  gaze.targetX = 0;
  gaze.targetY = 0;
  if (gaze.x || gaze.y) drawGaze(0, 0);
}

function followGaze(time) {
  gaze.frame = 0;
  if (drag || toolDrag) { gaze.time = 0; return; }
  if (reducedMotion.matches || root.dataset.rotated === 'true') { resetGaze(); return; }
  const elapsed = gaze.time ? Math.min(time - gaze.time, 48) : 16;
  const blend = 1 - Math.exp(-elapsed / 82);
  const x = gaze.x + (gaze.targetX - gaze.x) * blend;
  const y = gaze.y + (gaze.targetY - gaze.y) * blend;
  if (Math.max(Math.abs(x - gaze.targetX), Math.abs(y - gaze.targetY)) < .002) {
    drawGaze(gaze.targetX, gaze.targetY);
    gaze.time = 0;
    return;
  }
  drawGaze(x, y);
  gaze.time = time;
  gaze.frame = requestAnimationFrame(followGaze);
}

function setGazeTarget(x, y) {
  gaze.targetX = Math.max(-1, Math.min(1, x));
  gaze.targetY = Math.max(-1, Math.min(1, y));
  if (!gaze.frame && !drag && !toolDrag) gaze.frame = requestAnimationFrame(followGaze);
}

root.addEventListener('pointerdown', (event) => {
  toolClickTarget = null;
  if (event.pointerType !== 'mouse' && !drag) resetGaze();
}, { capture: true });

root.addEventListener('pointermove', (event) => {
  if (toolDrag) return;
  if (drag && drag.pointerId !== event.pointerId) return;
  if (event.pointerType !== 'mouse') { if (!drag) resetGaze(); return; }
  if (!run || root.dataset.rotated === 'true' || reducedMotion.matches) return;
  const bounds = root.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  setGazeTarget((event.clientX - bounds.x) / bounds.width * 2 - 1, (event.clientY - bounds.y) / bounds.height * 2 - 1);
});
root.addEventListener('pointerleave', () => setGazeTarget(0, 0));
reducedMotion.addEventListener('change', resetGaze);

function animateOnDesk(element, frames, duration) {
  if (!reducedMotion.matches) element?.animate?.(frames, { duration, easing: 'cubic-bezier(.2,.78,.27,1)' });
}

function tutorialStep() {
  return run?.phase === 'case' && getCase(run)?.id === 1 ? TUTORIAL[run.tutorial] : null;
}

function showPencil(item) {
  return item?.id === 8 && run.flags.rollingPencil && !run.flags.pencil;
}

function activeVisit(state = run) {
  return state?.events ? (state.events[0] ?? null) : (state?.event ?? null);
}

function toolsAvailableBetweenBatches() {
  return arrival?.action === 'next' && arrival.stage === 'waiting';
}

function windowCase() {
  return run && !arrival && !activeVisit() ? getCase(run) : null;
}

function filedRework() {
  const followup = run && getReworkFollowup(run);
  return followup && run.flags[`${followup.key}Document`] ? followup : null;
}

function acceptancePaper(state, visit) {
  const acceptance = getShipmentAcceptance(state, visit);
  if (!acceptance) return null;
  const { record, day, title } = acceptance;
  const report = archive(state).find(({ id }) => id === record.id)?.documents.find(({ type }) => type === 'report');
  const reportNumber = report?.fields.find(([label]) => label === '报告编号')?.[1];
  const fields = [['批号', record.batch], ['对应出货单', `${DAYS[record.day]?.title}开单`],
    ...(reportNumber ? [['检验报告编号', reportNumber]] : []),
    ['回签日', DAYS[day]?.title], ['签收单位', SHIPMENT_ACCEPTANCE.receiver], ['验收结论', SHIPMENT_ACCEPTANCE.result]];
  return { ...acceptance, document: { type: 'archive', kind: 'acceptance', title, fields } };
}

function filedBatchPapers() {
  return [filedRework(), acceptancePaper(run)].filter(Boolean);
}

function labRegistrationKey(caseId) {
  return `call:lab-request:${caseId}`;
}

function filedPhonePapers() {
  const hasRegistration = run.phoneLog.some((call) => call?.kind === 'lab-request');
  const filed = hasRegistration ? archive(run) : [];
  return run.phoneLog.flatMap((call) => {
    if (call?.kind === 'incoming') {
      return [[`call:${call.incomingKey}`, {
        type: 'archive', title: call.incomingKey === 'ringback' ? '回铃录音' : '实验室收班来电',
        fields: [['内线', call.number], ['接听', DAYS[call.day]?.title ?? '已登记'], ['通话内容', call.lines.join(' ')]],
      }]];
    }
    if (call?.kind !== 'lab-request') return [];
    const item = filed.find(({ id }) => id === call.caseId);
    if (!item) return [];
    return [[labRegistrationKey(item.id), {
      type: 'archive', kind: 'lab-request', caseId: item.id, title: `实验室电话登记 · ${item.batch}`,
      fields: [['批号', item.batch], ['内线', call.number], ['登记日', DAYS[call.day]?.title ?? '已登记'], ['通话内容', call.lines.join(' ')]],
    }]];
  });
}

function filedSupportingPapers(query, batchPapers = filedBatchPapers()) {
  const term = query.trim().toLowerCase();
  const visits = [
    ...Object.entries(EVIDENCE).filter(([key]) => run.flags[`${key}Document`]),
    ...batchPapers.map(({ key, document }) => [key, document]),
  ];
  const recalls = run.records.filter((record) => record.recallReceipt).map((record) => [
    `recall:${record.id}`, recallPaper(record, record.recallReceipt.day),
  ]);
  return [...visits, ...recalls, ...filedPhonePapers()].filter(([, doc]) =>
    !term || [doc.title, ...doc.fields.flat(), doc.note].some((text) => text?.toLowerCase().includes(term)));
}

function incomingAtWindow() {
  return run && (!arrival || arrival.action === 'next') && !activeVisit() && ['case', 'receipt', 'summary', 'handoff'].includes(run.phase)
    ? getIncomingCall(run) : null;
}

function showRinging(call) {
  if (call) root.dataset.ringing = 'true';
  else delete root.dataset.ringing;
  const label = call ? '接电话' : '内线电话';
  if (phoneFixtureLabel.textContent !== label) phoneFixtureLabel.textContent = label;
  if (call && call !== ringing) playSound('ring');
  ringing = call;
}

function previousInspection(item = windowCase()) {
  if (!item || run.phase !== 'case') return null;
  const previous = getPreviousReceipt(run, item);
  if (!previous) return null;
  const filed = archive(run).find(({ id }) => id === previous.record.id);
  return filed ? { ...previous, documents: filed.documents } : null;
}

function viewedDocument() {
  return interaction.deliveryCheck ?? interaction.previousCurrentDoc ?? interaction.doc;
}

function heldObjects(item) {
  const sampleHeld = panel === 'sample';
  let heldDocuments = [];
  if (panel === 'visit') heldDocuments = [0];
  if (panel === 'docs') {
    const relabel = relabelComparison(item, interaction.relabelCheck);
    if (relabel) heldDocuments = [relabel.registerIndex, relabel.reportIndex, relabel.labelIndex];
    else if (interaction.deliveryCheck !== null) heldDocuments = [interaction.deliveryCheck];
    else if (interaction.previousDoc !== null) heldDocuments = [viewedDocument()];
    else if (interaction.spreadAll && item?.documents.length === 3) heldDocuments = [0, 1, 2];
    else heldDocuments = [interaction.doc, interaction.compare];
  }
  if (sampleHeld && interaction.referenceDoc !== null) heldDocuments = [interaction.referenceDoc];
  return {
    heldDocuments,
    sampleHeld,
  };
}

function visitorAt(state) {
  return activeVisit(state)?.npc ?? (state && getCase(state)?.npc) ?? null;
}

function arrivalApproach(state) {
  const item = activeVisit(state) ? null : getCase(state);
  return { npc: visitorAt(state), sampleFilename: item ? `${sampleAppearance(item.sample).stem}.webp` : null };
}

function recallPaper(record, day) {
  return {
    type: 'archive', kind: 'recall', title: `收货方回执 · ${record.batch}`,
    fields: [['批次', record.batch], ['原出货回执', `${DAYS[record.day]?.title ?? ''}开单`],
      ['回签日', DAYS[day]?.title ?? '已登记'], ['处置', '暂停入库，召回已确认']],
  };
}

function visitDocument(visit, state = run) {
  if (visit?.kind === 'recall') {
    const record = state.records.find(({ id }) => id === visit.caseId);
    return record ? recallPaper(record, state.day) : null;
  }
  if (visit?.kind === 'rework') return getReworkFollowup(state)?.document;
  if (visit?.kind === 'acceptance') return acceptancePaper(state, visit)?.document;
  return visit && EVIDENCE[visit.key];
}

function scenePaperBatch(doc, item, visit) {
  if (visit?.kind === 'recall') return `${doc.fields[0][1]} · ${doc.fields[1][1]}`;
  if (visit?.kind === 'rework') return `${doc.fields[0][1]} · 周二复核`;
  if (visit?.kind === 'acceptance') return `${doc.fields[0][1]} · 收货方回签`;
  return visit ? '回访留底' : doc.fields[0]?.[1] ?? item.batch;
}

function sceneShipment(state, item, waiting) {
  if (state?.phase === 'receipt') {
    const record = state.records.at(-1);
    if (!record) return {};
    const route = receiptDisposition(record);
    const animate = issuedReceiptId === record.id;
    const shipment = { id: record.id, route, animate };
    const movingCargo = ['shipping', 'returned', 'held'].includes(route);
    return {
      cargo: movingCargo ? shipment : null,
      outgoingSlip: waiting ? null : shipment,
    };
  }
  if (!item) return {};
  const prior = getPreviousReceipt(state, item);
  if (prior?.sameLot && ['shipped', 'recallPending'].includes(prior.record.status)) return {};
  return { cargo: { id: item.id, route: 'ready', animate: false } };
}

function setScene() {
  const approaching = arrival?.stage === 'approach';
  const waiting = arrival && !approaching;
  const sceneRun = approaching ? arrival.next : run;
  const visit = waiting ? null : activeVisit(sceneRun);
  const phase = approaching ? 'arriving' : waiting ? 'waiting' : (run?.phase ?? 'home');
  const catPassing = closingShot === 'cat';
  const shutterClosed = !visit && !catPassing && (phase === 'summary' || phase === 'brief' || phase === 'ending');
  if (shutterClosed && phase === 'summary' && root.dataset.shutter === 'open') playSound('shutter');
  root.dataset.shutter = shutterClosed ? 'closed' : 'open';
  if (catPassing) root.dataset.catPassing = 'true';
  else delete root.dataset.catPassing;
  const item = !waiting && !visit && sceneRun ? getCase(sceneRun) : null;
  const npc = closingShot ? null : waiting ? (arrival.keepVisitor ? visitorAt(run) : null)
    : visit?.npc ?? (['brief', 'handoff', 'ending'].includes(phase) ? 'zhou' : item?.npc);
  if (illustratedWorker && root.dataset.modeled !== 'true' && roomHost.dataset.sceneReady !== 'true') {
    if (npc) {
      const image = view.asset(`${npc}.webp`);
      if (illustratedWorker.getAttribute('src') !== image) illustratedWorker.src = image;
    }
    illustratedWorker.hidden = !npc;
  }
  const appearance = item ? sampleAppearance(item.sample) : null;
  const inspection = approaching ? {} : interaction.inspection;
  const packed = item?.sample.kind === 'yellow' && !inspection.unpacked;
  const side = inspection.back && !packed ? '-back' : '';
  const delivered = visitDocument(visit, sceneRun);
  const documents = item?.documents ?? (delivered ? [delivered] : []);
  const forecast = !arrival && (visit || run?.phase === 'receipt') ? windowAdvance(visit ? 'ack-visit' : 'next') : null;
  const shipment = !visit && !closingShot ? sceneShipment(sceneRun, item, waiting) : {};
  view.setRoomCargo(cargoHost, shipment.cargo);
  scenery?.setFrame({ day: sceneRun?.day ?? 0, phase, npc: npc || null, visit: Boolean(visit), shutterClosed, catPassing,
    documents: documents.map((doc) => ({ type: doc.type, title: doc.title, batch: scenePaperBatch(doc, item, visit) })),
    sample: appearance ? { ...inspection, filename: `${appearance.stem}${side}.webp`, kind: item.sample.kind, cuffSplit: cuffSplitVisible(item.sample, inspection) } : null,
    positions: approaching ? {} : interaction.positions, pencil: !arrival && showPencil(item), ...heldObjects(item),
    keepVisitor: arrival?.keepVisitor ?? false, approach: arrival?.approach ?? (needsArrival(forecast) ? arrivalApproach(forecast) : undefined),
    presentedEvidence: phase === 'case' && item?.shownFinding === presentedEvidence ? presentedEvidence : null,
    ...shipment });
}

function render(resumeScroll) {
  const settingDownCloseSheet = run?.phase === 'summary' &&
    (root.dataset.phase === 'receipt' || root.dataset.phase === 'summary') &&
    !screenLayer.querySelector('.shift-close-sheet');
  root.dataset.phase = arrival ? 'waiting' : (run?.phase ?? 'home');
  if (arrival) root.dataset.arrivalStage = arrival.stage;
  else delete root.dataset.arrivalStage;
  const incomingCall = incomingAtWindow();
  showRinging(incomingCall);
  renderArrivalStatus();
  status.innerHTML = run ? `<span>${getDay(run).title}</span><span>第 ${run.day + 1} 天 / 5</span>` : '<span>质检员的一天</span>';
  wallShift.innerHTML = run ? view.wallShift(run) : '';
  soundToggle.setAttribute('aria-pressed', String(!isMuted()));
  soundToggle.setAttribute('aria-label', isMuted() ? '开启音效' : '关闭音效');
  const item = windowCase();
  const step = item ? tutorialStep() : null;
  const deskGuide = step?.key === 'signature' && interaction.signed
    ? { ...step, target: 'order', line: step.orderLine }
    : step;
  const visit = arrival ? null : activeVisit();
  const previous = item && run.phase === 'case' ? getPreviousReceipt(run, item) : null;
  hud.innerHTML = run && !arrival && !closingShot && (run.phase !== 'summary' || visit)
    ? view.room(run, item, deskGuide, item?.pressureLine, visit, previous)
    : '';
  const preview = arrival?.stage === 'approach' && root.dataset.modeled !== 'true' ? arrival.next : null;
  const previewVisit = preview ? activeVisit(preview) : null;
  const previewItem = preview && !previewVisit ? getCase(preview) : null;
  const delivered = visit ? visitDocument(visit) : visitDocument(previewVisit, preview);
  desktop.innerHTML = delivered ? view.visitSlip(delivered, visit ?? previewVisit, panel === 'visit') : item ? view.desk(run, item, deskGuide, {
    ...interaction, pencil: showPencil(item), stampBlocked: Boolean(panel), ...heldObjects(item),
  }) : previewItem ? view.desk(preview, previewItem, null, { ...freshInteraction(), stampBlocked: true }) : '';
  fixtureElements = [...booth.querySelectorAll('[data-fixture]')];
  showModeledScene();
  if (root.dataset.modeled === 'true') placeFixtures();
  const recapScroll = screenLayer.querySelector('.summary-body, .ending-body')?.scrollTop;
  const delayOpen = screenLayer.querySelector('details.ending-delay')?.open;
  screenLayer.innerHTML = run
    ? (arrival || visit || closingShot ? '' : view.overlay(run, run.phase === 'ending' ? getEnding(run) : null, reviewingHistory, incomingCall))
    : view.home(saved, endings, completedShifts.size);
  if (closingShot === 'cat') screenLayer.innerHTML = '<span class="visually-hidden" role="status">窗外，厂猫走过了装货台。</span>';
  if (settingDownCloseSheet) {
    animateOnDesk(screenLayer.querySelector('.shift-close-sheet'), [
      { translate: '.8rem 1.35rem', rotate: '-.9deg', opacity: .65 },
      { translate: '0 0', rotate: '0deg', opacity: 1 },
    ], 300);
  }
  const delayDetails = screenLayer.querySelector('details.ending-delay');
  if (delayDetails && delayOpen) delayDetails.open = true;
  if (recapScroll !== undefined) screenLayer.querySelector('.summary-body, .ending-body')?.scrollTo(0, recapScroll);
  setScene();
  renderModal(item, step);
  if (resumeScroll !== undefined) workspaceBody()?.scrollTo(0, resumeScroll);
  persistRun();
}

function renderArrivalStatus() {
  const someoneWaiting = arrival?.ready && arrival.stage === 'waiting';
  const message = someoneWaiting ? '窗口有人等候'
    : arrival?.stage === 'approach' ? '窗口递件…'
    : arrival?.action?.type === 'receive-recall' ? '等收货方回执…' : arrival ? '等下一位…' : '';
  arrivalStatus.toggleAttribute('data-visitor-waiting', Boolean(someoneWaiting));
  if (arrivalStatus.textContent !== message) arrivalStatus.textContent = message;
}

function renderModal(item = windowCase(), step = item ? tutorialStep() : null) {
  const { compare, inspection, archiveFocus, archiveQuery, pinned, phoneNumber, egg } = interaction;
  const correction = activeCorrection();
  const correctionFindings = correction ? selectedCorrectionFindings(correction, correctionDraft.keys) : null;
  const batchPapers = panel === 'archive' || panel === 'handoff' ? filedBatchPapers() : [];
  const reworkBasis = correction && reworkFinding(correction, batchPapers.find(({ document }) => document.kind === 'rework') ?? null);
  const incomingCall = incomingAtWindow();
  const work = { ...interaction, incomingCall };
  let markup = '';
  if (panel === 'how' || panel === 'rules') markup = view.instructions(panel === 'how');
  if (panel === 'visit' && !arrival) {
    const visit = activeVisit();
    const doc = visitDocument(visit);
    if (doc) markup = view.visitPaper(doc, visit);
  }
  if (panel === 'docs' && item) markup = view.documents(item, viewedDocument(), compare, step, work, previousInspection(item));
  if (panel === 'sample' && item) markup = view.sample(item, inspection, step, work);
  if (panel === 'archive' && run) {
    const sources = archivedReportSources(run, reportIndex ?? archiveQuery);
    const returnTo = archiveReturn?.panel;
    const finished = run.phase === 'ending';
    markup = reportIndex && sources.length
      ? view.archiveReportPanel(reportIndex, sources, pinned, { returnTo, finished })
      : view.archivePanel(archive(run, archiveQuery), filedSupportingPapers(archiveQuery, batchPapers), archiveFocus, pinned,
        archiveQuery, Boolean(correction), run.phase === 'handoff', finished, {
        returnTo,
        reportSuggestion: !correction && sources.length > 1 ? sources[0].number : null,
        canComparePrevious: !archiveReturn && run.phase === 'case' && item && getPreviousReceipt(run, item)?.record.id === archiveFocus,
        correctionFindings: correctionFindings ?? [],
        batchPapers,
        reworkBasis,
      });
  }
  if (panel === 'phone' && run) {
    const filed = archive(run);
    const papers = pinned.flatMap(({ id, index }) => {
      const row = filed.find((item) => item.id === id);
      return row ? [{ id, index, batch: row.batch, document: row.documents[index] ?? null }] : [];
    });
    markup = view.phone(phoneNumber, run.phone, papers, run.day >= 1, run.flags.phoneBack, item, {
      returnTo: phoneReturn?.reportIndex ? 'report-index' : phoneReturn?.panel,
      incomingCall,
    });
  }
  if (panel === 'handoff' && run?.phase === 'handoff') {
    const rows = archive(run).filter(({ record }) => record);
    const pair = handoffComparison(rows, handoffFocus);
    markup = view.handoffPanel(run, EVIDENCE, rows, {
      focus: handoffFocus, documentIndex: handoffDocument, correctionFindings, batchPapers, reworkBasis,
      canCompare: Boolean(pair), comparison: handoffPairOpen ? pair : null,
    });
  }
  if (panel === 'egg' && EASTER_EGGS[egg]) markup = view.egg(egg, item?.id);
  if (panel === 'restart') markup = view.dialog('重新接班', `<p>开一周新的班会覆盖当前值班存档。</p><div class="modal-actions">${view.button('回到上周', 'close')}${view.button('开始新一周', 'start', 'primary')}</div>`);
  if (panel === 'completed-shifts' && !run) {
    const entries = Array.from(completedShifts, ([id, completed]) => {
      const { title, stamp } = getEnding(completed);
      return { id, title, label: stamp };
    });
    markup = view.dialog('交班存根', view.completedShifts(entries), 'completed-shifts-modal');
  }
  if (!markup && !arrival && run?.phase === 'receipt' && !activeVisit()) {
    const record = run.records.at(-1);
    const previous = run.records.find(({ id }) => id === record.priorShipmentId);
    markup = view.receipt(record, previous);
  }

  const focused = document.activeElement;
  const hadModal = Boolean(modalLayer.firstElementChild);
  const focusedData = focused instanceof HTMLElement && modalLayer.contains(focused) ? { ...focused.dataset } : null;
  const previousSurface = modalLayer.querySelector('[data-desk-surface]');
  const previousContent = previousSurface?.querySelector('.desk-surface-content');
  const scroll = previousContent ? [previousContent.scrollLeft, previousContent.scrollTop] : null;
  const previousReference = previousSurface?.querySelector('.sample-reference');
  const previousPaper = previousSurface?.querySelector('.return-previous');
  const wasShowingSignature = previousSurface?.querySelector('[data-tutorial-signature]');
  const archiveIndexScroll = previousSurface?.querySelector('.drawer-list')?.scrollTop;
  const phoneScroll = modalLayer.querySelector('.phone-modal .modal-body')?.scrollTop;
  const handoffIndexScroll = modalLayer.querySelector('.handoff-board')?.scrollTop;
  const handoffDetailScroll = modalLayer.querySelector('.handoff-detail-scroll')?.scrollTop;
  modalLayer.innerHTML = markup;
  const surface = modalLayer.querySelector('[data-desk-surface]');
  if (phoneScroll !== undefined) modalLayer.querySelector('.phone-modal .modal-body')?.scrollTo(0, phoneScroll);
  if (handoffIndexScroll !== undefined) modalLayer.querySelector('.handoff-board')?.scrollTo(0, handoffIndexScroll);
  if (handoffDetailScroll !== undefined) modalLayer.querySelector('.handoff-detail-scroll')?.scrollTo(0, handoffDetailScroll);
  const blockingDialog = Boolean(markup && !surface);
  const screenCoversBooth = Boolean(screenLayer.firstElementChild) && run?.phase !== 'summary';
  booth.inert = blockingDialog || !run || Boolean(closingShot || (arrival && !toolsAvailableBetweenBatches())) || screenCoversBooth;
  screenLayer.inert = Boolean(markup);
  if (!markup) {
    if (hadModal && modalOpener) {
      focusControl(root, modalOpener);
      modalOpener = null;
    }
    return;
  }
  const focusables = [...modalLayer.querySelectorAll('button:not([disabled]), input')];
  const restored = focusedData?.act && focusables.find((element) => Object.entries(focusedData).every(([key, value]) => element.dataset[key] === value));
  const firstAction = focusables.find((element) => element instanceof HTMLButtonElement &&
    element.dataset.act && !element.classList.contains('reference-control') &&
    !['close', 'toggle-findings', 'remove-finding'].includes(element.dataset.act));
  (restored || firstAction || focusables[0])?.focus({ preventScroll: true });
  if (surface && surface.dataset.deskSurface !== previousSurface?.dataset.deskSurface) {
    const object = surface.querySelector('.sheet, .sample-stage .sample-object, .receipt-slip');
    const printsHere = object?.classList.contains('receipt-slip') && !hadModal && root.dataset.modeled === 'true' &&
      issuedReceiptId !== null && run.records.at(-1)?.id === issuedReceiptId;
    if (printsHere && !reducedMotion.matches) {
      object.animate?.([
        { translate: '0 1rem', opacity: 0 },
        { translate: '0 1rem', opacity: 0, offset: .42, easing: 'cubic-bezier(.2,.78,.27,1)' },
        { translate: '0 0', opacity: 1 },
      ], 410);
    } else {
      animateOnDesk(object, [{ translate: '0 1.3rem', rotate: '-1.4deg', opacity: .56 }, { translate: '0 0', rotate: '0deg', opacity: 1 }], 235);
    }
  } else if (surface && surface.dataset.surfacePage !== previousSurface?.dataset.surfacePage) {
    const oldPaper = surface.querySelector('.return-previous');
    let sheet = surface.querySelector('.doc-grid:is(.pair, .spread) > .sheet:last-child, .doc-grid:not(.pair, .spread) > .sheet');
    if (oldPaper) {
      sheet = oldPaper.dataset.previousDoc !== previousPaper?.dataset.previousDoc
        ? oldPaper.querySelector('.sheet') : surface.querySelector('.return-current .sheet');
      if (previousPaper && scroll) surface.querySelector('.desk-surface-content').scrollTo(...scroll);
    }
    animateOnDesk(sheet, [{ translate: '.85rem .3rem', opacity: .65 }, { translate: '0 0', opacity: 1 }], 180);
  } else if (surface && scroll) {
    const content = surface.querySelector('.desk-surface-content');
    [content.scrollLeft, content.scrollTop] = scroll;
    if (archiveIndexScroll !== undefined) surface.querySelector('.drawer-list').scrollTop = archiveIndexScroll;
    const reference = surface.querySelector('.sample-reference');
    if (reference && reference.dataset.referenceDoc !== previousReference?.dataset.referenceDoc) {
      animateOnDesk(reference.querySelector('.sheet'), [{ translate: '.85rem .3rem', opacity: .65 }, { translate: '0 0', opacity: 1 }], 180);
    }
  }
  if (!wasShowingSignature) {
    surface?.querySelector('[data-tutorial-signature]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

function focusControl(scope, data) {
  const control = [...scope.querySelectorAll('button:not([disabled])')].find((element) =>
    Object.entries(data).every(([key, value]) => element.dataset[key] === value));
  control?.focus({ preventScroll: true });
  return control;
}

function toast(message) {
  clearTimeout(toastTimer);
  toastBox.textContent = message;
  toastTimer = message ? setTimeout(() => { toastBox.textContent = ''; }, 2350) : 0;
}

function workspaceContext() {
  const item = windowCase();
  if (!item || run.phase !== 'case') return undefined;
  const previous = previousInspection(item);
  return {
    prior: previous ? { id: previous.record.id, documentCount: previous.documents.length } : null,
    guided: Boolean(tutorialStep()),
    seen: run.seen,
  };
}

function workspaceBody() {
  if (panel === 'docs') return modalLayer.querySelector('.documents-surface .desk-surface-content');
  if (panel === 'sample') return modalLayer.querySelector('.sample-surface .desk-surface-content');
  if (panel === 'phone') return modalLayer.querySelector('.phone-modal .modal-body');
  if (panel === 'handoff') return modalLayer.querySelector('.handoff-detail-scroll');
  if (panel === 'archive') return modalLayer.querySelector('.archive-surface .desk-surface-content');
  return null;
}

function persistRun() {
  if (!run || reviewingHistory) return;
  captureCorrectionScroll();
  const body = workspaceBody();
  const archivedPanel = panel === 'archive' && ['phone', 'docs', 'sample'].includes(archiveReturn?.panel) ? archiveReturn.panel : null;
  const context = body || archivedPanel ? workspaceContext() : undefined;
  const workspacePanel = archivedPanel ?? panel;
  const workspace = context ? {
    ...context, panel: workspacePanel, scrollTop: archivedPanel ? archiveReturn.scrollTop : body?.scrollTop ?? 0,
    returnTo: workspacePanel === 'phone' ? phoneReturn : undefined,
  } : undefined;
  const handoffParent = panel === 'archive' && archiveReturn?.panel === 'handoff' ? archiveReturn : null;
  const pairWorkspace = run.phase === 'handoff' && handoffPairOpen && (panel === 'handoff' || handoffParent) ? {
    id: handoffFocus, documentIndex: handoffDocument, scrollTop: handoffParent?.detailScroll ?? body?.scrollTop ?? 0,
  } : null;
  saved = {
    ...run,
    ...(arrival ? { arrivalAction: arrival.action } : {}),
    ...(run.phase === 'handoff' && correctionDraft ? { correctionDraft } : {}),
    ...(pairWorkspace ? { handoffPair: pairWorkspace } : {}),
    inspectionProgress: captureInspectionProgress(getCase(run), interaction, workspace),
  };
  writeStorage(SAVE_KEY, saved);
}

function persistWorkspaceScroll() {
  clearTimeout(workspaceScrollTimer);
  const body = workspaceBody();
  const workspace = saved?.inspectionProgress?.workspace;
  let scrollTop = workspace?.panel === panel ? workspace?.scrollTop : undefined;
  if (panel === 'handoff' && handoffPairOpen) scrollTop = saved?.handoffPair?.scrollTop;
  else if (activeCorrection()) scrollTop = saved?.correctionDraft?.scrollTop;
  if (!body || scrollTop === undefined || Math.abs(body.scrollTop - scrollTop) < 1) return;
  // Passive scroll saves must not replace newer progress from another tab.
  if (JSON.stringify(readStorage(SAVE_KEY)) === JSON.stringify(saved)) persistRun();
}

modalLayer.addEventListener('scroll', (event) => {
  if (event.target !== workspaceBody()) return;
  clearTimeout(workspaceScrollTimer);
  workspaceScrollTimer = setTimeout(persistWorkspaceScroll, 150);
}, { capture: true, passive: true });
window.addEventListener('pagehide', persistWorkspaceScroll);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) persistWorkspaceScroll();
});

function update(action, redraw = true) {
  if (!run || reviewingHistory) return false;
  const before = run;
  run = dispatch(run, action);
  if (run !== before) {
    if (getCase(before)?.id !== getCase(run)?.id) interaction = freshInteraction(interaction);
    if (run.phase === 'ending') {
      correctionDraft = null;
      rememberCompletedShift(run);
    }
  }
  if (redraw) render();
  return run !== before;
}

function openPanel(name, opener) {
  if (!panel && opener instanceof HTMLElement) modalOpener = { ...opener.dataset };
  const archiveOrigin = panel === 'archive' && (reportIndex || opener?.dataset?.act === 'phone-document');
  if (name === 'phone' && (panel === 'docs' || panel === 'sample' || archiveOrigin)) {
    const body = workspaceBody();
    phoneReturn = { panel, opener: { ...opener.dataset }, scrollTop: body?.scrollTop ?? 0, scrollLeft: body?.scrollLeft ?? 0,
      ...(archiveOrigin ? { reportIndex, archiveReturn, archiveFocus: interaction.archiveFocus, archiveQuery: interaction.archiveQuery } : {}) };
  } else if (panel === 'phone' && name !== 'archive' && name !== 'phone') {
    update({ type: 'hang-up' }, false);
    phoneReturn = null;
  }
  if (name === 'archive' && ['phone', 'handoff', 'docs', 'sample'].includes(panel)) {
    const body = workspaceBody();
    const index = panel === 'handoff' ? modalLayer.querySelector('.handoff-board') : body;
    archiveReturn = { panel, opener: { ...opener.dataset }, scrollTop: index?.scrollTop ?? 0, detailScroll: body?.scrollTop ?? 0,
      scrollLeft: body?.scrollLeft ?? 0 };
  } else if (name !== 'archive' || panel !== 'archive') {
    archiveReturn = null;
  }
  panel = name;
  render();
}

function enter(restore) {
  cancelArrivalPause();
  cancelClosingShot();
  reviewingHistory = false;
  issuedReceiptId = null;
  presentedEvidence = null;
  let workspace;
  let arrivalAction;
  let savedCorrection;
  let savedPair;
  if (restore && saved) {
    const { inspectionProgress, arrivalAction: savedArrival, correctionDraft: draft, handoffPair: pair, ...savedRun } = saved;
    arrivalAction = savedArrival;
    savedCorrection = draft;
    savedPair = pair;
    run = restoreRun(savedRun);
    const restored = restoreInspectionProgress(inspectionProgress, getCase(run), run.seen, workspaceContext());
    ({ workspace, ...interaction } = restored);
  } else {
    const lastCompleted = saved?.phase === 'ending' ? saved : completedShifts.values().next().value;
    run = endings.length ? createFollowingRun(lastCompleted) : createRun();
    interaction = freshInteraction();
  }
  panel = workspace?.panel ?? null;
  if (tutorialStep() && (panel === 'docs' || workspace?.returnTo?.panel === 'docs')) {
    const documents = getCase(run)?.documents;
    readDocument(documents?.[viewedDocument()]);
    readDocument(documents?.[interaction.compare]);
  }
  advanceTutorial();
  phoneReturn = workspace?.returnTo ? { ...workspace.returnTo, opener: { act: workspace.returnTo.panel === 'archive' ? 'phone-document' : 'phone' } } : null;
  if (panel !== 'phone') run = dispatch(run, { type: 'hang-up' });
  modalOpener = panel === 'docs' ? { act: 'doc', i: String(viewedDocument()) }
    : panel ? { act: panel, fixture: panel } : null;
  archiveReturn = null;
  reportIndex = null;
  handoffFocus = null;
  handoffDocument = null;
  handoffPairOpen = false;
  correctionDraft = restoreCorrectionDraft(savedCorrection);
  const next = windowAdvance(arrivalAction);
  if (needsArrival(next)) {
    panel = null;
    pauseBeforeArrival(arrivalAction, next, true, true);
    return;
  }
  if (savedPair && restoreHandoffPair(savedPair)) return;
  if (correctionDraft && !activeVisit()) {
    panel = correctionDraft.fromBoard ? 'handoff' : 'archive';
    modalOpener = { act: panel };
    if (correctionDraft.fromBoard) {
      handoffFocus = correctionDraft.id;
      handoffDocument = correctionDraft.documentIndex;
    } else focusArchiveRow(correctionDraft.id);
    playSound('paper');
    render(correctionDraft.scrollTop);
    if (panel === 'handoff') revealHandoffSelection();
    return;
  }
  const resumeSound = { docs: 'paper', sample: 'slide', phone: 'click' }[panel];
  if (resumeSound) playSound(resumeSound);
  else if (run.phase !== 'summary') playSound(run.phase === 'ending' ? 'paper' : 'shutter');
  render(workspace?.scrollTop);
  if (restore && interaction.benchFindingsOpen) {
    desktop.querySelector('.finding-show[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

function reviewCompletedShift(id) {
  const completed = completedShifts.get(id);
  if (run || panel !== 'completed-shifts' || !completed) return;
  cancelArrivalPause();
  cancelClosingShot();
  run = completed;
  reviewingHistory = true;
  interaction = freshInteraction();
  panel = null;
  modalOpener = null;
  archiveReturn = null;
  reportIndex = null;
  correctionDraft = null;
  phoneReturn = null;
  playSound('paper');
  render();
  focusControl(screenLayer, { act: 'archive' });
}

function cancelArrivalPause() {
  clearTimeout(arrivalTimer);
  arrivalTimer = 0;
  arrival = null;
}

function cancelClosingShot() {
  clearTimeout(closingShotTimer);
  closingShotTimer = 0;
  closingShot = null;
}

function finishShift() {
  if (run?.phase !== 'handoff') return;
  panel = null;
  playSound('bell');
  const ended = update({ type: 'finish' }, false);
  if (ended) toast('');
  if (!ended || !run.flags.cat) {
    render();
    return;
  }
  const still = reducedMotion.matches;
  closingShot = 'cat';
  render();
  closingShotTimer = setTimeout(() => {
    closingShot = 'shutter';
    playSound('shutter');
    render();
    closingShotTimer = setTimeout(() => {
      cancelClosingShot();
      render();
      focusControl(screenLayer, { act: 'archive' });
    }, still ? 0 : 420);
  }, still ? 650 : 1050);
}

function focusNextWindowAction() {
  requestAnimationFrame(() => {
    if (document.activeElement !== document.body) return;
    const target = desktop.querySelector('[data-act="visit-paper"]')
      ?? screenLayer.querySelector('.primary')
      ?? desktop.querySelector('.paper-card');
    target?.focus({ preventScroll: true });
  });
}

function windowAction(value) {
  if (value === 'start-day' || value === 'next' || value === 'ack-visit') return { type: value };
  if (value?.type === 'receive-recall' && Number.isInteger(value.id)) return { type: value.type, id: value.id };
  return null;
}

function windowAdvance(value) {
  const action = windowAction(value);
  if (!run || !action) return null;
  const next = dispatch(run, action);
  return next !== run ? next : null;
}

function needsArrival(next) {
  return next && (next.phase === 'case' || activeVisit(next));
}

function finishWindowAdvance(value, restoreFocus) {
  const action = windowAction(value);
  const visit = action?.type === 'ack-visit' ? activeVisit() : null;
  if (!action || !update(action, false)) return;
  if (visit) {
    interaction.archiveFocus = visit.key;
    interaction.archiveQuery = '';
    if (visit.kind === 'recall') {
      const confirmed = run.records.find(({ id }) => id === visit.caseId)?.status === 'recalled';
      panel = 'handoff';
      modalOpener = { act: 'handoff' };
      handoffFocus = visit.caseId;
      handoffDocument = null;
      handoffPairOpen = false;
      if (!confirmed) toast('这份回执需要再核对');
    } else {
      const paper = { rework: '复核联', acceptance: '到货验收联' }[visit.kind] ?? '留底';
      toast(`${paper}已收入交接簿`);
    }
  }
  render();
  if (visit?.kind === 'recall') {
    revealHandoffSelection(true);
    return;
  }
  if (restoreFocus) focusNextWindowAction();
}

function beginWindowApproach() {
  const { action, restoreFocus } = arrival;
  // A call at the empty window can put a different visitor at the head of the queue.
  const next = windowAdvance(action);
  if (!needsArrival(next)) {
    cancelArrivalPause();
    if (next) finishWindowAdvance(action, restoreFocus);
    else render();
    return;
  }
  arrival.stage = 'approach';
  arrival.next = next;
  arrival.keepVisitor &&= visitorAt(next) === visitorAt(run);
  arrival.approach = arrivalApproach(next);
  arrivalTimer = setTimeout(() => {
    cancelArrivalPause();
    finishWindowAdvance(action, restoreFocus);
  }, ARRIVAL_APPROACH_MS);
  playSound('slide');
  render();
}

function pauseBeforeArrival(action, next, restoreFocus, resumed = false) {
  modalOpener = null;
  const npc = visitorAt(next);
  arrival = {
    action, restoreFocus, stage: 'waiting', keepVisitor: !resumed && npc !== null && npc === visitorAt(run),
    approach: arrivalApproach(next),
  };
  const duration = action === 'next' ? NEXT_BATCH_PAUSE_MS : action === 'ack-visit' ? VISIT_HANDOVER_MS : ARRIVAL_PAUSE_MS;
  arrivalTimer = setTimeout(() => {
    arrivalTimer = 0;
    if (panel && toolsAvailableBetweenBatches()) {
      arrival.ready = true;
      renderArrivalStatus();
      playSound('knock');
    } else beginWindowApproach();
  }, duration - ARRIVAL_APPROACH_MS);
  render();
}

function advanceTutorial() {
  let step = tutorialStep();
  while (step && tutorialActionComplete(step.key, interaction)) {
    if (!update({ type: 'tutorial', key: step.key }, false)) break;
    step = tutorialStep();
  }
}

function readDocument(doc) {
  if (!tutorialStep()) return;
  if (doc?.type === 'label') interaction.labelSeen = true;
  if (doc?.type === 'report') interaction.reportSeen = true;
  if (doc?.type === 'order') interaction.orderSeen = true;
  advanceTutorial();
}

function pairTutorialOrder(item, index) {
  interaction.doc = item.documents.findIndex(({ type }) => type === 'report');
  interaction.compare = index;
}

function chooseDoc(index, opener) {
  const item = run?.phase === 'case' ? windowCase() : null;
  const doc = item?.documents[index];
  if (!doc) return;
  if (panel === 'sample' && !tutorialStep()) {
    interaction.referenceDoc = index;
    playSound('paper');
    render();
    return;
  }
  interaction.clipboardBack = false;
  interaction.deliveryCheck = null;
  interaction.relabelCheck = null;
  if (tutorialStep()?.key === 'signature' && doc.type === 'order') {
    pairTutorialOrder(item, index);
  } else if (panel === 'docs' && interaction.previousDoc !== null) {
    interaction.previousCurrentDoc = index;
  } else if (panel === 'docs' && interaction.compare !== null && !interaction.spreadAll) {
    if (index !== interaction.doc) interaction.compare = index;
  } else {
    interaction.spreadAll = false;
    interaction.doc = index;
    interaction.compare = null;
    interaction.previousDoc = null;
    interaction.previousCurrentDoc = null;
  }
  readDocument(doc);
  playSound('paper');
  openPanel('docs', opener);
}

function updateFindings(findings) {
  interaction.findings = findings;
  interaction.note = findings.at(-1)?.text ?? '';
  if (!findings.length) {
    interaction.showFindings = false;
    interaction.benchFindingsOpen = false;
  }
}

function toggleFinding(finding) {
  const selected = interaction.findings.some(({ key }) => key === finding.key);
  updateFindings(selected ? interaction.findings.filter(({ key }) => key !== finding.key) : [...interaction.findings, finding]);
  return !selected;
}

function presentFinding(key) {
  if (panel || !interaction.benchFindingsOpen || !windowCase()?.pressure) return;
  const finding = interaction.findings.find((entry) => entry.key === key);
  if (!finding) return;
  const scroll = desktop.querySelector('.bench-draft-body')?.scrollTop ?? 0;
  if (!update({ type: 'show-finding', finding }, false)) return;
  presentedEvidence = run.shownFinding;
  playSound('slide');
  render();
  desktop.querySelector('.bench-draft-body')?.scrollTo(0, scroll);
  focusControl(desktop, { act: 'show-finding', key });
  if (root.dataset.modeled !== 'true' && !reducedMotion.matches) {
    const room = roomHost.parentElement;
    room.querySelector('.evidence-transfer')?.remove();
    const slip = document.createElement('span');
    slip.className = 'evidence-transfer';
    slip.setAttribute('aria-hidden', 'true');
    room.append(slip);
    const motion = slip.animate?.([
      { translate: '.8rem .95rem', opacity: .4 },
      { translate: '0 0', opacity: 1, offset: .62 },
      { translate: '0 -.25rem', opacity: 0 },
    ], { duration: 510, easing: 'ease-out' });
    if (motion) motion.onfinish = () => slip.remove();
    else slip.remove();
  }
}

function checkBasis(index, field) {
  if (run?.phase !== 'case' || (panel !== 'docs' && panel !== 'sample')) return;
  const doc = windowCase()?.documents[index];
  const datum = doc?.fields[field];
  if (!datum) return;
  const [label] = datum;
  const finding = paperFieldFinding(doc, index, field);
  const recorded = toggleFinding(finding);
  if (label === '签发' && doc.type === 'report' && tutorialStep()) {
    interaction.signed = true;
    advanceTutorial();
  }
  playSound('click');
  toast(`${recorded ? '已记下' : '已移除'} · ${label}`);
  render();
}

function paperFieldFinding(doc, index, field) {
  const [label, value] = doc.fields[field];
  return { key: `doc:${index}:${field}`, source: doc.title, text: `${label} · ${value}` };
}

function correctableRow(id) {
  return run?.phase === 'handoff' ? archive(run).find((row) => row.id === id && row.record && !row.latestReceipt) : null;
}

function correctionFocus() {
  if (panel === 'handoff') return handoffFocus;
  if (panel === 'archive') return interaction.archiveFocus;
  return null;
}

function activeCorrection() {
  if (!correctionDraft || correctionDraft.id !== correctionFocus()) return null;
  return correctableRow(correctionDraft.id);
}

function reworkFinding(row, rework = filedRework()) {
  if (!rework || row.id !== rework.caseId) return null;
  const facts = rework.document.fields.filter(([label]) => label === '检查记录' || label === '复核结论');
  return { key: rework.key, source: rework.document.title, text: facts.map(([, value]) => value).join('。') };
}

function selectedCorrectionFindings(row, keys = []) {
  if (!row) return [];
  const available = [
    ...row.documents.flatMap((doc, index) => doc.fields.map((_, field) => paperFieldFinding(doc, index, field))),
    ...readFindings(row.record).filter(({ key }) => key.startsWith('sample:') || key.startsWith('compare:')),
  ];
  const rework = reworkFinding(row);
  if (rework) available.push(rework);
  const byKey = new Map(available.map((finding) => [finding.key, finding]));
  return [...new Set(keys)].flatMap((key) => byKey.has(key) ? [byKey.get(key)] : []);
}

function hasHandoffDocument(row, documentIndex) {
  if (!row) return false;
  if (typeof documentIndex === 'string') {
    return filedBatchPapers().some(({ caseId, document }) => caseId === row.id && document.kind === documentIndex);
  }
  return Number.isInteger(documentIndex) && Boolean(row.documents[documentIndex]);
}

function restoreCorrectionDraft(draft) {
  const row = correctableRow(draft?.id);
  if (!row) return null;
  const keys = selectedCorrectionFindings(row, Array.isArray(draft.keys) ? draft.keys : []).map(({ key }) => key);
  const fromBoard = draft.fromBoard === true;
  const legacyBoardDraft = fromBoard && draft.documentIndex === undefined;
  const lastPaper = keys.findLast((key) => key.startsWith('doc:'));
  const documentIndex = legacyBoardDraft ? Number(lastPaper?.split(':')[1] ?? 0) : draft.documentIndex;
  return {
    id: row.id,
    keys,
    fromBoard,
    documentIndex: fromBoard && hasHandoffDocument(row, documentIndex) ? documentIndex : null,
    scrollTop: !legacyBoardDraft && Number.isFinite(draft.scrollTop) ? Math.max(0, draft.scrollTop) : 0,
  };
}

function captureCorrectionScroll() {
  if (!activeCorrection()) return;
  correctionDraft.scrollTop = workspaceBody()?.scrollTop ?? 0;
  correctionDraft.fromBoard = panel === 'handoff';
  correctionDraft.documentIndex = panel === 'handoff' ? handoffDocument : null;
}

function focusArchiveRow(id) {
  captureCorrectionScroll();
  reportIndex = null;
  interaction.archiveFocus = id;
}

function editCorrectionFinding(key, { remove = false, field } = {}) {
  const row = activeCorrection();
  if (!selectedCorrectionFindings(row, [key]).length) return;
  const alreadySelected = correctionDraft.keys.includes(key);
  if (remove && !alreadySelected) return;
  correctionDraft.keys = alreadySelected ? correctionDraft.keys.filter((entry) => entry !== key) : [...correctionDraft.keys, key];
  playSound('click');
  render();
  if (field) {
    focusControl(modalLayer, { ...field.dataset })?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    persistRun();
  }
}

function compareDocs(hint) {
  const item = getCase(run);
  if (panel !== 'docs' || !item || item.documents.length < 2) return;
  const index = interaction.doc;
  const type = item.documents[index].type;
  const guide = tutorialStep();
  if (hint === 'order' && guide?.key === 'signature') {
    pairTutorialOrder(item, item.documents.findIndex(({ type }) => type === 'order'));
  } else {
    const hasOrder = item.documents.some(({ type }) => type === 'order');
    const preferredType = type === 'report' ? (hasOrder && (!guide || guide.key === 'signature') ? 'order' : 'label') : 'report';
    const preferred = item.documents.findIndex((doc, id) => id !== index && doc.type === preferredType);
    interaction.compare = interaction.compare === null ? (preferred >= 0 ? preferred : (index + 1) % item.documents.length) : null;
  }
  readDocument(item.documents[interaction.compare]);
  playSound('slide');
  render();
}

function spreadDocuments() {
  const item = windowCase();
  if (panel !== 'docs' || run?.phase !== 'case' || item?.documents.length !== 3 || tutorialStep() || interaction.previousDoc !== null) return;
  interaction.spreadAll = !interaction.spreadAll;
  playSound('slide');
  render(0);
}

function documentCheckItem() {
  return panel === 'docs' && run?.phase === 'case' && !tutorialStep() ? windowCase() : null;
}

function toggleDeliveryCheck(index) {
  if (!intakeComparison(documentCheckItem(), index)) return;
  interaction.relabelCheck = null;
  interaction.deliveryCheck = interaction.deliveryCheck === index ? null : index;
  playSound('paper');
  render(0);
  focusControl(modalLayer, { act: 'delivery-check', i: String(index) });
}

function toggleRelabelCheck(index) {
  const item = documentCheckItem();
  if (!relabelComparison(item, index) || interaction.previousDoc !== null || interaction.deliveryCheck !== null ||
      !heldObjects(item).heldDocuments.includes(index)) return;
  interaction.relabelCheck = interaction.relabelCheck === index ? null : index;
  playSound('paper');
  render(0);
  focusControl(modalLayer, { act: 'relabel-check', i: String(index) });
}

function openProjectComparison(orderIndex, reportIndex) {
  if (!projectComparison(documentCheckItem(), orderIndex, reportIndex)) return;
  Object.assign(interaction, { doc: orderIndex, compare: reportIndex, deliveryCheck: null, relabelCheck: null,
    spreadAll: false, previousDoc: null, previousCurrentDoc: null, clipboardBack: false });
  playSound('slide');
  render(0);
  focusControl(modalLayer, { act: 'project-evidence', i: String(orderIndex), key: String(reportIndex) });
}

function recordDocumentComparison(kind, documentIndex, target) {
  const item = documentCheckItem();
  if (!item) return;
  let comparison;
  if (kind === 'delivery-evidence') {
    if (interaction.deliveryCheck !== documentIndex) return;
    comparison = intakeComparison(item, documentIndex);
  } else if (kind === 'relabel-evidence') {
    if (interaction.relabelCheck !== documentIndex) return;
    comparison = relabelComparison(item, documentIndex)?.pairs.find(({ side }) => side === target);
  } else {
    if (interaction.deliveryCheck !== null || interaction.previousDoc !== null) return;
    const reportIndex = Number(target);
    const { heldDocuments } = heldObjects(item);
    if (!heldDocuments.includes(documentIndex) || !heldDocuments.includes(reportIndex)) return;
    comparison = projectComparison(item, documentIndex, reportIndex);
  }
  if (!comparison) return;
  const recorded = toggleFinding(comparison.finding);
  playSound('paper');
  toast(recorded ? '已记下纸面记录' : '已取回纸面记录');
  render();
}

function comparePrevious(opener) {
  const item = windowCase();
  const previous = previousInspection(item);
  if (!previous?.documents.length) return;
  if (panel !== 'docs' && (panel !== 'archive' || archiveReturn || interaction.archiveFocus !== previous.record.id)) return;
  interaction.deliveryCheck = null;
  interaction.relabelCheck = null;
  if (panel === 'docs' && interaction.previousDoc !== null) {
    interaction.previousDoc = null;
    interaction.previousCurrentDoc = null;
  } else {
    const type = item.documents[interaction.doc]?.type;
    const matching = previous.documents.findIndex((doc) => doc.type === type);
    const order = previous.documents.findIndex((doc) => doc.type === 'order');
    interaction.previousDoc = matching >= 0 ? matching : Math.max(order, 0);
    interaction.previousCurrentDoc = interaction.doc;
  }
  playSound('paper');
  openPanel('docs', opener);
}

function openSample(opener) {
  if (run?.phase !== 'case' || !windowCase()) return;
  interaction.returnToDocs = panel === 'docs' && !tutorialStep();
  interaction.referenceDoc = interaction.returnToDocs ? viewedDocument() : null;
  playSound('slide');
  openPanel('sample', opener);
}

function toggleReference() {
  if (panel !== 'sample') return;
  const documents = getCase(run)?.documents;
  if (!documents?.length) return;
  if (interaction.referenceDoc !== null) {
    interaction.referenceDoc = null;
  } else if (interaction.returnToDocs) {
    interaction.referenceDoc = viewedDocument();
  } else {
    const report = documents.findIndex((doc) => doc.type === 'report');
    const order = documents.findIndex((doc) => doc.type === 'order');
    interaction.referenceDoc = report >= 0 ? report : Math.max(order, 0);
  }
  playSound('paper');
  render();
}

function checkSample(act) {
  if (panel !== 'sample' || run?.phase !== 'case') return;
  const sample = interaction.inspection;
  const item = windowCase();
  const spec = item?.sample;
  if (!spec) return;
  const packed = spec.kind === 'yellow' && !sample.unpacked;
  const previousFilm = act === 'sample-film' && modalLayer.querySelector('.sample-film-sheet');
  const previousFold = previousFilm ? getComputedStyle(previousFilm).transform : null;
  let sound = 'slide';
  switch (act) {
    case 'sample-flip':
      if (packed || (spec.reading && sample.measured)) return;
      sample.back = !sample.back;
      break;
    case 'sample-film':
      sample.film = !sample.film;
      if (item.id === 2 && sample.film) interaction.filmChecked = true;
      break;
    case 'sample-clasp':
      if (!sample.back || sample.clasp || !sampleAppearance(spec).clasp) return;
      sample.clasp = true;
      sound = 'clasp';
      break;
    case 'sample-tug':
      if (!sample.back || !sample.clasp || sample.tug || !sampleAppearance(spec).clasp) return;
      sample.tug = true;
      sound = ['loose', 'broken'].includes(spec.kind) ? 'claspRelease' : 'tug';
      advanceTutorial();
      break;
    case 'sample-measure':
      if (!spec.reading) return;
      sample.measured = !sample.measured;
      sound = sample.measured ? 'clasp' : 'slide';
      break;
    case 'sample-unpack':
      if (!packed) return;
      sample.unpacked = true;
      sample.back = false;
      sound = 'paper';
      break;
    case 'sample-basis': {
      const recorded = toggleFinding(sampleFinding(spec, sample));
      sound = 'paper';
      toast(recorded ? '已记下检样结果' : '已取回这条查验依据');
      break;
    }
  }
  playSound(sound);
  render();
  const graphic = modalLayer.querySelector('.sample-stage .sample-object');
  if (act === 'sample-flip') {
    animateOnDesk(graphic, [{ transform: 'perspective(600px) rotateY(-57deg)', opacity: .8 }, { transform: 'perspective(600px) rotateY(0deg)', opacity: 1 }], 220);
  } else if (act === 'sample-film' && previousFold) {
    const film = modalLayer.querySelector('.sample-film-sheet');
    if (film) animateOnDesk(film, [{ transform: previousFold }, { transform: getComputedStyle(film).transform }], 225);
  } else if (act === 'sample-unpack') {
    animateOnDesk(graphic, [{ translate: '0 .38rem', opacity: .7 }, { translate: '0 0', opacity: 1 }], 210);
  }
}

function stamp(value) {
  if (arrival || activeVisit() || run?.phase !== 'case') return;
  if (panel) {
    if (['docs', 'sample', 'archive'].includes(panel)) toast('先回到台面，再用开单机盖章');
    return;
  }
  if (update({ type: 'stamp', value, note: interaction.note, findings: interaction.findings }, false)) {
    issuedReceiptId = run.records.at(-1).id;
    clearTimeout(toastTimer);
    toastBox.textContent = '';
    playSound('stamp');
    render();
    scenery?.setPressed?.(value);
  } else toast('先跟老周把这箱查完');
}

function dial() {
  if (!interaction.phoneNumber) return;
  const number = interaction.phoneNumber;
  playSound(number === '880' ? 'dialTone' : 'click');
  update({ type: 'dial', number, papers: interaction.pinned });
  modalLayer.querySelector('.phone-log')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  if (run.phase === 'handoff' && activeVisit()) toast('有人到窗口递留底');
}

function openPhone(opener) {
  if (!run || reviewingHistory) return;
  if (incomingAtWindow()) update({ type: 'answer-call' }, false);
  else if (opener.dataset.key === 'bring-order' && panel === 'docs') {
    const item = windowCase();
    const order = heldObjects(item).heldDocuments.find((index) => item?.documents[index]?.type === 'order');
    if (PHONE['204'].requests[item?.id] && order !== undefined) {
      const displaced = pinPhonePaper(item.id, order);
      if (displaced) toast(`${displaced} 已收回交接簿`);
    }
  }
  playSound('click');
  if (panel === 'archive' && archiveReturn?.panel === 'phone') {
    closePanel();
    return;
  }
  openPanel('phone', opener);
}

function phoneFromDocument(caseId, index, field, opener) {
  if (!run || reviewingHistory) return;
  let doc;
  const item = windowCase();
  if (panel === 'archive' && interaction.archiveFocus === caseId && !activeCorrection()) {
    doc = archive(run).find(({ id }) => id === caseId)?.documents[index];
  } else if (item?.id === caseId && heldObjects(item).heldDocuments.includes(index)) {
    doc = item.documents[index];
  } else if (panel === 'docs' && item && interaction.previousDoc === index) {
    const previous = previousInspection(item);
    if (previous?.record.id === caseId) doc = previous.documents[index];
  }
  const number = documentExtension(doc?.fields[field]);
  if (!number) return;
  interaction.phoneNumber = number;
  const displaced = pinPhonePaper(caseId, index);
  if (displaced) toast(`${displaced} 已收回交接簿`);
  openPhone(opener);
  focusControl(modalLayer, { act: 'dial' });
}

function pinPhonePaper(id, index) {
  const retained = interaction.pinned.filter((paper) => paper.id !== id || (paper.index !== index && paper.index !== null));
  interaction.pinned = [...retained.slice(-1), { id, index }];
  if (retained.length < 2) return null;
  const [older] = retained;
  const row = archive(run).find((item) => item.id === older.id);
  return row ? `${row.batch} ${row.documents[older.index]?.title ?? '批次留底'}` : null;
}

function setPhoneNumber(value) {
  interaction.phoneNumber = value;
  renderModal();
  persistRun();
}

function openArchive(opener) {
  reportIndex = null;
  if (toolsAvailableBetweenBatches() && !panel && opener === booth.querySelector('.wall-archive')) {
    focusArchiveRow(run.records.at(-1)?.id ?? null);
    interaction.archiveQuery = '';
  }
  interaction.archiveFocus ??= archive(run).at(-1)?.id ?? null;
  playSound('paper');
  openPanel('archive', opener);
}

function openReportIndex(number, opener) {
  const sources = archivedReportSources(run, number);
  if (!sources.length) return;
  const current = panel === 'docs' || panel === 'sample' ? windowCase()?.id : interaction.archiveFocus;
  const target = sources.find(({ id }) => id === current) ?? sources.at(-1);
  focusArchiveRow(target.id);
  reportIndex = target.number;
  interaction.archiveQuery = reportIndex;
  playSound('paper');
  openPanel('archive', opener);
  modalLayer.querySelector('.report-index-surface .desk-surface-content')?.scrollTo(0, 0);
}

function openHandoff(opener) {
  if (run?.phase !== 'handoff') return;
  if (handoffFocus === null) {
    const current = archive(run).filter(({ record, latestReceipt }) => record && !latestReceipt);
    handoffFocus = (current.find(({ record }) => record.status === 'recallPending')
      ?? current.find(({ record }) => record.status === 'shipping') ?? current[0])?.id ?? null;
  }
  playSound('paper');
  openPanel('handoff', opener);
  revealHandoffSelection();
}

function restoreHandoffPair(workspace) {
  if (run?.phase !== 'handoff' || activeVisit() || correctionDraft?.id === workspace.id) return false;
  const rows = archive(run).filter(({ record }) => record);
  if (!handoffComparison(rows, workspace.id)) return false;
  const row = rows.find(({ id }) => id === workspace.id);
  panel = 'handoff';
  modalOpener = { act: 'handoff' };
  handoffFocus = row.id;
  handoffDocument = hasHandoffDocument(row, workspace.documentIndex) ? workspace.documentIndex : null;
  handoffPairOpen = true;
  playSound('paper');
  render(Number.isFinite(workspace.scrollTop) ? Math.max(0, workspace.scrollTop) : 0);
  return true;
}

function toggleHandoffPair() {
  if (panel !== 'handoff' || activeCorrection() || !handoffComparison(archive(run).filter(({ record }) => record), handoffFocus)) return;
  handoffPairOpen = !handoffPairOpen;
  playSound('paper');
  render(0);
  focusControl(modalLayer, { act: 'handoff-compare' });
}

function revealHandoffSelection(focus = false) {
  const board = modalLayer.querySelector('.handoff-board');
  const selected = board?.querySelector('[data-act="handoff-focus"][aria-pressed="true"]');
  if (focus) selected?.focus({ preventScroll: true });
  selected?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function selectHandoff(id, reveal) {
  if (panel !== 'handoff' || (handoffFocus === id && !handoffPairOpen)) return;
  if (id !== 'attachments' && !archive(run).some((row) => row.id === id && row.record)) return;
  captureCorrectionScroll();
  handoffPairOpen = false;
  handoffFocus = id;
  const draft = correctionDraft?.id === id ? correctionDraft : null;
  handoffDocument = draft?.documentIndex ?? null;
  playSound('paper');
  render(draft?.scrollTop ?? 0);
  if (reveal) {
    revealHandoffSelection(true);
    if (!modalLayer.querySelector('.handoff-board [aria-pressed="true"]')) {
      focusControl(modalLayer, { act: 'handoff-doc', key: 'receipt' });
    }
  }
}

function revealArchiveReceipt(revealIndex) {
  if (revealIndex) {
    modalLayer.querySelector('.drawer-list [aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  modalLayer.querySelector('.archive-surface .desk-surface-content')?.scrollTo(0, activeCorrection() ? correctionDraft.scrollTop : 0);
}

function closePanel() {
  captureCorrectionScroll();
  let previousPanel = run && panel === 'archive' ? archiveReturn : null;
  if (panel === 'phone') {
    update({ type: 'hang-up' }, false);
    previousPanel = phoneReturn;
    phoneReturn = null;
  }
  panel = previousPanel?.panel ?? null;
  archiveReturn = previousPanel?.archiveReturn ?? null;
  reportIndex = previousPanel?.reportIndex ?? null;
  if (panel === 'archive' && previousPanel.archiveFocus != null) {
    interaction.archiveFocus = previousPanel.archiveFocus;
    interaction.archiveQuery = previousPanel.archiveQuery;
  }
  if (arrival?.ready && !panel) {
    beginWindowApproach();
    return;
  }
  const toBoard = previousPanel?.panel === 'handoff';
  render(toBoard ? previousPanel.detailScroll : previousPanel?.scrollTop);
  if (previousPanel) {
    if (toBoard) modalLayer.querySelector('.handoff-board')?.scrollTo(0, previousPanel.scrollTop);
    else {
      const body = workspaceBody();
      if (body) body.scrollLeft = previousPanel.scrollLeft ?? 0;
      else modalLayer.querySelector('.modal-body')?.scrollTo(0, previousPanel.scrollTop);
    }
    const opener = focusControl(modalLayer, previousPanel.opener);
    if (opener?.dataset.act === 'phone-document') opener.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  } else if (run?.phase === 'summary' && document.activeElement === document.body) focusControl(screenLayer, { act: 'advance-day' });
}

root.addEventListener('click', (event) => {
  const target = event.target.closest('[data-act]');
  if (!target || target.matches(':disabled')) return;
  if (target === toolClickTarget && event.detail > 0) return;
  const { act, key } = target.dataset;
  const index = Number(target.dataset.i);
  if (act === 'doc' && suppressPaperClick) return;
  if (act.startsWith('sample-')) { checkSample(act); return; }
  switch (act) {
    case 'how': case 'rules': openPanel(act, target); break;
    case 'completed-shifts': if (!run && completedShifts.size) openPanel('completed-shifts', target); break;
    case 'review-shift': reviewCompletedShift(key); break;
    case 'sound': setMuted(!isMuted()); playSound('click'); render(); break;
    case 'fullscreen': void toggleFullscreen(root); break;
    case 'new': if (saved && saved.phase !== 'ending') openPanel('restart', target); else enter(false); break;
    case 'start': enter(false); break;
    case 'resume': enter(true); break;
    case 'home': {
      const fromHistory = reviewingHistory;
      cancelArrivalPause();
      cancelClosingShot();
      run = null;
      reviewingHistory = false;
      phoneReturn = null;
      resetGaze();
      closePanel();
      if (fromHistory) focusControl(screenLayer, { act: 'completed-shifts' });
      break;
    }
    case 'start-day': {
      const next = !arrival && windowAdvance(act);
      if (!next) break;
      playSound('shutter');
      if (activeVisit(next)?.kind === 'rework') pauseBeforeArrival(act, next, event.detail === 0);
      else finishWindowAdvance(act, event.detail === 0);
      break;
    }
    case 'advance-day': playSound('paper'); update({ type: 'advance-day' }); break;
    case 'visit-paper':
      if (!arrival && visitDocument(activeVisit())) {
        playSound('paper');
        openPanel('visit', target);
      }
      break;
    case 'next':
    case 'event-next':
    case 'receive-recall': {
      if (act === 'event-next' && (panel !== 'visit' || key !== activeVisit()?.key)) break;
      const action = act === 'receive-recall' ? { type: act, id: index } : act === 'next' ? 'next' : 'ack-visit';
      const next = !arrival && windowAdvance(action);
      if (!next) break;
      captureCorrectionScroll();
      panel = null;
      archiveReturn = null;
      if (act !== 'next') playSound('paper');
      else if (needsArrival(next) || !getIncomingCall(next)) playSound('bell');
      if (needsArrival(next)) pauseBeforeArrival(action, next, event.detail === 0);
      else finishWindowAdvance(action, event.detail === 0);
      break;
    }
    case 'doc': case 'reference-doc': if (run) chooseDoc(index, target); break;
    case 'basis': checkBasis(index, Number(target.dataset.field)); break;
    case 'toggle-findings':
      if (run?.phase !== 'case') break;
      interaction.showFindings = !interaction.showFindings;
      render();
      if (interaction.showFindings) modalLayer.querySelector('#working-findings')?.scrollIntoView({ block: 'nearest' });
      break;
    case 'bench-findings':
      if (panel || run?.phase !== 'case') break;
      interaction.benchFindingsOpen = !interaction.benchFindingsOpen;
      render();
      focusControl(desktop, { act: 'bench-findings' });
      break;
    case 'show-finding': presentFinding(key); break;
    case 'remove-finding': {
      if (run?.phase !== 'case') break;
      const inBenchDraft = Boolean(target.closest('.bench-draft'));
      updateFindings(interaction.findings.filter((finding) => finding.key !== key));
      playSound('paper');
      render();
      if (inBenchDraft && !focusControl(desktop, { act: 'bench-findings' })) {
        focusControl(desktop, { act: 'sample', fixture: 'sample' });
      }
      break;
    }
    case 'compare': compareDocs(key); break;
    case 'compare-all': spreadDocuments(); break;
    case 'delivery-check': toggleDeliveryCheck(index); break;
    case 'relabel-check': toggleRelabelCheck(index); break;
    case 'project-pair': openProjectComparison(index, Number(key)); break;
    case 'delivery-evidence': case 'project-evidence': case 'relabel-evidence': recordDocumentComparison(act, index, key); break;
    case 'previous-compare': comparePrevious(target); break;
    case 'previous-doc': {
      const previous = previousInspection();
      if (panel !== 'docs' || interaction.previousDoc === null || !previous?.documents[index]) break;
      interaction.previousDoc = index;
      playSound('paper');
      render();
      break;
    }
    case 'sample': openSample(target); break;
    case 'reference': toggleReference(); break;
    case 'reference-back':
      if (panel === 'sample' && interaction.returnToDocs) {
        playSound('paper');
        openPanel('docs', target);
      }
      break;
    case 'stamp': stamp(key); break;
    case 'archive': if (run) openArchive(target); break;
    case 'report-search': openReportIndex(key, target); break;
    case 'archive-call': {
      if (panel !== 'phone') break;
      const registration = labRegistrationKey(index);
      if (!filedPhonePapers().some(([entry]) => entry === registration)) break;
      focusArchiveRow(registration);
      interaction.archiveQuery = '';
      openArchive(target);
      revealArchiveReceipt(true);
      break;
    }
    case 'report-index-back':
      if (panel === 'archive' && reportIndex) {
        reportIndex = null;
        playSound('paper');
        render();
        revealArchiveReceipt(true);
      }
      break;
    case 'archive-receipt': case 'phone-paper': {
      if (!run?.seen.includes(index)) break;
      focusArchiveRow(index);
      interaction.archiveQuery = '';
      openArchive(target);
      revealArchiveReceipt(true);
      if (act === 'phone-paper' && target.dataset.doc !== undefined) {
        const docIndex = Number(target.dataset.doc);
        const sheet = modalLayer.querySelector(`.archive-detail .sheet[data-doc-index="${docIndex}"]`);
        sheet?.scrollIntoView({ block: 'start', inline: 'nearest' });
        if (sheet) focusControl(sheet, { act: 'archive-pin' });
      }
      break;
    }
    case 'archive-focus': case 'archive-followup': case 'archive-evidence':
      focusArchiveRow(act === 'archive-evidence' ? key : index);
      if (act === 'archive-followup' && !archive(run, interaction.archiveQuery).some((row) => row.id === index)) {
        interaction.archiveQuery = '';
      }
      playSound('paper');
      render();
      revealArchiveReceipt(act === 'archive-followup');
      break;
    case 'archive-pin': {
      if (!run?.seen.includes(index) || run.phase === 'ending') break;
      const docIndex = Number(target.dataset.doc);
      const row = archive(run).find(({ id }) => id === index);
      if (!Number.isInteger(docIndex) || !row?.documents[docIndex]) break;
      const pinned = interaction.pinned;
      const selected = pinned.find((paper) => paper.id === index && paper.index === docIndex);
      const displaced = selected ? null : pinPhonePaper(index, docIndex);
      if (selected) interaction.pinned = pinned.filter((paper) => paper !== selected);
      if (displaced) toast(`新单据已放到电话旁，${displaced} 已收回交接簿`);
      else toast(selected ? '单据已收回交接簿' : '单据已放到电话旁');
      playSound('paper');
      render();
      if (panel === 'phone' && !selected) {
        focusControl(modalLayer, { act: 'phone-paper', i: String(index), doc: String(docIndex) })?.scrollIntoView({ block: 'nearest' });
      }
      break;
    }
    case 'edit-record': {
      if (panel === 'handoff' && handoffPairOpen) break;
      const row = correctableRow(correctionFocus());
      if (!row) break;
      const editing = activeCorrection();
      if (editing) correctionDraft = null;
      else {
        const fromBoard = panel === 'handoff';
        if (fromBoard && handoffDocument === null && row.documents.length) handoffDocument = 0;
        correctionDraft = { id: row.id, keys: [], fromBoard, documentIndex: fromBoard ? handoffDocument : null, scrollTop: 0 };
      }
      playSound('paper');
      render(panel === 'handoff' && !editing ? 0 : undefined);
      break;
    }
    case 'correction-basis': editCorrectionFinding(`doc:${index}:${Number(target.dataset.field)}`, { field: target }); break;
    case 'correction-original': editCorrectionFinding(key); break;
    case 'correction-remove': editCorrectionFinding(key, { remove: true }); break;
    case 'recheck': {
      const row = activeCorrection();
      if (!row) break;
      const findings = selectedCorrectionFindings(row, correctionDraft.keys);
      if (update({ type: 'recheck', id: row.id, value: key, findings }, false)) {
        correctionDraft = null;
        if (panel === 'handoff') {
          handoffDocument = null;
          render(0);
          revealHandoffSelection(true);
        } else {
          render();
          revealArchiveReceipt(false);
        }
        playSound('stamp');
        const status = run.records.find(({ id }) => id === row.id)?.status;
        if (status !== 'recallPending') toast('更正已留底');
      }
      break;
    }
    case 'phone': openPhone(target); break;
    case 'phone-document': phoneFromDocument(Number(key), index, Number(target.dataset.field), target); break;
    case 'phone-answer':
      if (panel === 'phone' && incomingAtWindow()) { playSound('click'); update({ type: 'answer-call' }); }
      break;
    case 'phone-digit':
      if (interaction.phoneNumber.length < 5) setPhoneNumber(interaction.phoneNumber + key);
      playSound('click');
      break;
    case 'phone-clear': setPhoneNumber(interaction.phoneNumber.slice(0, -1)); break;
    case 'phone-select': setPhoneNumber(key); break;
    case 'phone-back': update({ type: 'explore', key: 'phone-back' }); break;
    case 'dial': dial(); break;
    case 'clipboard-back': {
      if (panel !== 'docs' || !EASTER_EGGS.cat.slots.includes(windowCase()?.id)) break;
      interaction.clipboardBack = !interaction.clipboardBack;
      if (interaction.clipboardBack) update({ type: 'explore', key: 'cat' }, false);
      playSound('paper');
      render(0);
      const face = modalLayer.querySelector(interaction.clipboardBack ? '.clipboard-back-face' : '.sheet-clipboard');
      animateOnDesk(face, [
        { transform: 'perspective(620px) rotateY(-62deg)', opacity: .64 },
        { transform: 'perspective(620px) rotateY(0deg)', opacity: 1 },
      ], 235);
      break;
    }
    case 'egg': update({ type: 'explore', key }, false); interaction.egg = key; playSound('paper'); openPanel('egg', target); break;
    case 'handoff': openHandoff(target); break;
    case 'handoff-compare': toggleHandoffPair(); break;
    case 'handoff-focus': selectHandoff(index, !target.closest('.handoff-board')); break;
    case 'handoff-attachments': selectHandoff('attachments', false); break;
    case 'handoff-doc': {
      if (panel !== 'handoff') break;
      const row = archive(run).find((entry) => entry.id === handoffFocus && entry.record);
      const documentIndex = key === 'receipt' ? null : key ?? index;
      if (!row || (documentIndex !== null && !hasHandoffDocument(row, documentIndex)) || handoffDocument === documentIndex) break;
      handoffDocument = documentIndex;
      playSound('paper');
      render(0);
      break;
    }
    case 'attach': update({ type: 'attach', key, value: !run.flags[`${key}Attached`] }); playSound('paper'); break;
    case 'finish': finishShift(); break;
    case 'shade': if (event.target === target) closePanel(); break;
    case 'close': if (!panel && run?.phase === 'receipt') return; closePanel(); break;
  }
});

root.addEventListener('touchstart', (event) => {
  const button = event.target.closest('[data-act="stamp"]');
  stampTouch = root.dataset.modeled === 'true' && button && !button.disabled && event.touches.length === 1
    ? event.touches[0]
    : null;
}, { passive: true });

function withinStampTap(start, touch) {
  return start.identifier === touch.identifier && Math.hypot(start.clientX - touch.clientX, start.clientY - touch.clientY) <= 12;
}

root.addEventListener('touchmove', (event) => {
  if (stampTouch && (event.touches.length !== 1 || !withinStampTap(stampTouch, event.touches[0]))) {
    stampTouch = null;
  }
}, { passive: true });

root.addEventListener('touchend', (event) => {
  const start = stampTouch;
  stampTouch = null;
  const end = event.changedTouches[0];
  if (!start || !end || event.touches.length || !withinStampTap(start, end)) return;
  const button = start.target.closest('[data-act="stamp"]');
  if (!button || button.disabled || !button.contains(document.elementFromPoint(end.clientX, end.clientY))) return;
  // Touch browsers can suppress the first synthesized click after a drag.
  event.preventDefault();
  stamp(button.dataset.key);
}, { passive: false });

root.addEventListener('touchcancel', () => { stampTouch = null; });

root.addEventListener('submit', (event) => {
  if (event.target.dataset.form !== 'archive') return;
  event.preventDefault();
  interaction.archiveQuery = String(new FormData(event.target).get('query') ?? '').slice(0, 60);
  focusArchiveRow(archive(run, interaction.archiveQuery).at(-1)?.id ?? filedSupportingPapers(interaction.archiveQuery).at(-1)?.[0] ?? null);
  render();
});

document.addEventListener('keydown', (event) => {
  if (event.defaultPrevented || event.isComposing) return;
  const target = event.target;
  if (event.repeat && event.key === 'Enter' && target instanceof HTMLButtonElement &&
      target.matches('[data-act="stamp"], [data-act="next"], [data-act="visit-paper"], [data-act="event-next"], .sample-hotspot[data-drag]')) {
    event.preventDefault();
    return;
  }
  if (event.key === 'Tab' && modalLayer.querySelector('[aria-modal="true"]')) {
    const controls = [...modalLayer.querySelectorAll('button:not(:disabled), input:not(:disabled)')];
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  if (event.key === 'Escape' && panel) { event.preventDefault(); closePanel(); }
  const editable = target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select'));
  if (!run || editable || event.ctrlKey || event.metaKey || event.altKey) return;
  if (panel === 'phone' && /^\d$/.test(event.key)) {
    if (interaction.phoneNumber.length < 5) setPhoneNumber(interaction.phoneNumber + event.key);
    return;
  }
  if (!event.repeat && ['1', '2', '3'].includes(event.key)) stamp(['pass', 'fail', 'review'][Number(event.key) - 1]);
});

modalLayer.addEventListener('pointerdown', (event) => {
  const handle = event.target.closest('.sample-stage [data-drag]');
  if (!handle || event.button !== 0 || !event.isPrimary || toolDrag || drag) return;
  const stage = handle.closest('.sample-stage');
  const origin = stagePoint(root, event.clientX, event.clientY);
  toolDrag = {
    handle, stage, origin, pointerId: event.pointerId, distance: 0,
    kind: handle.dataset.drag, action: handle.dataset.act,
    slot: stage.querySelector('[data-gauge-target]'), measured: stage.classList.contains('measured'),
  };
  handle.setPointerCapture(event.pointerId);
});

function isOverGauge(event, slot) {
  if (!slot) return false;
  const bounds = slot.getBoundingClientRect();
  return event.clientX >= bounds.left && event.clientX <= bounds.right &&
    event.clientY >= bounds.top && event.clientY <= bounds.bottom;
}

window.addEventListener('pointermove', (event) => {
  if (!toolDrag || event.pointerId !== toolDrag.pointerId) return;
  const { stage, origin, kind, slot } = toolDrag;
  const point = stagePoint(root, event.clientX, event.clientY);
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const distance = Math.hypot(dx, dy);
  toolDrag.distance = Math.max(toolDrag.distance, distance);
  if (kind === 'clasp') stage.style.setProperty('--clasp-pull', `${Math.min(18, distance).toFixed(1)}px`);
  if (kind === 'wrapper') stage.style.setProperty('--wrap-pull', `${Math.min(26, distance).toFixed(1)}px`);
  if (kind === 'gauge' && toolDrag.distance >= 9) {
    stage.dataset.toolDrag = kind;
    stage.toggleAttribute('data-gauge-over', isOverGauge(event, slot));
    stage.style.setProperty('--tool-dx', `${dx.toFixed(1)}px`);
    stage.style.setProperty('--tool-dy', `${dy.toFixed(1)}px`);
  }
});

function endToolDrag(event) {
  if (!toolDrag || (event.type !== 'blur' && event.pointerId !== toolDrag.pointerId)) return;
  const { handle, stage, distance, kind, action, slot, measured } = toolDrag;
  toolDrag = null;
  delete stage.dataset.toolDrag;
  stage.removeAttribute('data-gauge-over');
  for (const property of ['--clasp-pull', '--wrap-pull', '--tool-dx', '--tool-dy']) stage.style.removeProperty(property);
  if (event.type === 'pointerup' && distance >= 9) {
    toolClickTarget = handle;
    const completed = kind === 'gauge' ? Boolean(slot) && isOverGauge(event, slot) !== measured
      : kind === 'wrapper' ? distance >= 18 : true;
    if (completed && stage.isConnected) checkSample(action);
  }
  setGazeTarget(gaze.targetX, gaze.targetY);
}

window.addEventListener('pointerup', endToolDrag);
window.addEventListener('pointercancel', endToolDrag);
window.addEventListener('lostpointercapture', endToolDrag);
window.addEventListener('blur', endToolDrag);

desktop.addEventListener('pointerdown', (event) => {
  const paper = event.target.closest('[data-drag="paper"]');
  if (!paper || event.button !== 0 || run?.phase !== 'case') return;
  const index = Number(paper.dataset.i);
  const projection = root.dataset.modeled === 'true' ? scenery?.captureDeskProjection?.() : null;
  const project = projection ?? captureDeskProjection(desktop) ?? ((x, y) => stagePoint(root, x, y));
  drag = { paper, index, pointerId: event.pointerId, project, origin: project(event.clientX, event.clientY), offset: interaction.positions[index] ?? { x: 0, y: 0 }, moved: false };
});

window.addEventListener('pointermove', (event) => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const point = drag.project(event.clientX, event.clientY);
  const x = point.x - drag.origin.x;
  const y = point.y - drag.origin.y;
  if (!drag.moved && Math.hypot(x, y) < 7) return;
  if (!drag.moved) {
    drag.paper.classList.add('moving');
    playSound('paper');
  }
  drag.moved = true;
  const offset = { x: Math.max(-90, Math.min(90, drag.offset.x + x)), y: Math.max(-35, Math.min(40, drag.offset.y + y)) };
  interaction.positions[drag.index] = offset;
  drag.paper.style.setProperty('--paper-x', `${offset.x}px`);
  drag.paper.style.setProperty('--paper-y', `${offset.y}px`);
  scenery?.setPaperOffset?.(drag.index, offset);
});

function endDrag(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  if (drag.moved) {
    drag.paper.classList.remove('moving');
    persistRun();
    suppressPaperClick = true;
    setTimeout(() => { suppressPaperClick = false; }, 0);
  }
  drag = null;
  setGazeTarget(gaze.targetX, gaze.targetY);
}

window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);
window.addEventListener('blur', () => {
  if (drag) endDrag(drag);
  resetGaze();
});
render();

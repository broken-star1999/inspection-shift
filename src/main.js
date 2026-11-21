import { createRun, createFollowingRun, restoreRun, dispatch, getCase, getDay, getEnding, getIncomingCall, getPreviousReceipt, getReworkFollowup, getShipmentAcceptance, getShipmentException, archive, archivedReportSources, canShowFinding, canRecheckReceipt, getWindowSupplementRequest, receiptDisposition, TUTORIAL, EVIDENCE, TRACE_CASE_ID, TRACE_FINDING } from './engine.js';
import { DAYS, EASTER_EGGS, PHONE, SHIPMENT_ACCEPTANCE, SHIPMENT_EXCEPTION, documentExtension } from './content.js';
import { cuffSplitVisible, sampleAppearance, sampleFinding } from './samples.js';
import { bindViewport, toggleFullscreen, stagePoint, playSound, isMuted, setMuted } from './devices.js';
import { captureDeskProjection } from './desk-projection.js';
import { freshInteraction, captureInspectionProgress, restoreInspectionProgress, tutorialActionComplete } from './inspection-progress.js';
import { readFindings } from './inspection-findings.js';
import { reportWorkspace } from './report-workspace.js';
import { completedShiftHistory, collectedEndingIds, createWeekId } from './completed-shifts.js';
import { cartonFinding, intakeComparison, projectComparison, relabelComparison, thicknessComparison } from './document-comparison.js';
import { handoffComparison } from './handoff-comparison.js';
import * as view from './view.js';
import './style.css';
import './booth.css';
import './inspection.css';
import './view-camera.css';
import './modeled-booth.css';
import './devices.css';
import './sample-inspection.css';
import './carton-inspector.css';

const root = document.querySelector('#game');
const SAVE_KEY = 'nandu-inspection-save-v1';
const COLLECTION_KEY = 'nandu-inspection-endings-v1';
const COMPLETED_KEY = 'nandu-inspection-completed-v1';
const ARRIVAL_PAUSE_MS = 1150;
const NEXT_BATCH_PAUSE_MS = 1650;
const VISIT_HANDOVER_MS = 760;
const ARRIVAL_APPROACH_MS = 465;
const PAPER_PAIR_HOLD_MS = 250;

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

function rememberCompletedShift(finished) {
  const stored = readStorage(COMPLETED_KEY);
  const storedEndings = readStorage(COLLECTION_KEY);
  completedShifts = completedShiftHistory(stored, { memory: completedShifts, finished });
  endings = collectedEndingIds(Array.isArray(storedEndings) ? [...storedEndings, ...endings] : endings, completedShifts);
  const entries = Array.from(completedShifts, ([id, run]) => ({ id, run }));
  if (JSON.stringify(entries) !== JSON.stringify(stored)) writeStorage(COMPLETED_KEY, entries);
  writeStorage(COLLECTION_KEY, endings);
}

let saved = readStorage(SAVE_KEY);
if (!validSave(saved)) saved = null;
let completedShifts = completedShiftHistory(readStorage(COMPLETED_KEY));
let endings = collectedEndingIds(readStorage(COLLECTION_KEY), completedShifts);
if (saved?.phase === 'ending') rememberCompletedShift(saved);
let run = null;
let reviewingHistory = false;
let historyNavigation = null;
let panel = null;
let scenery;
let modeledReady = false;
let toastTimer;
let arrivalTimer = 0;
let arrival = null;
let lastToolFocus = null;
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
let archivePaper = null;
let correctionDraft = null;
let handoffFocus = null;
let handoffDocument = null;
let handoffPairOpen = false;
let recallPairReturn = null;
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
const windowGlance = document.createElement('button');
windowGlance.id = 'window-glance';
windowGlance.className = 'window-glance';
windowGlance.type = 'button';
windowGlance.dataset.act = 'window-glance';
const desktop = root.querySelector('#desk');
const screenLayer = root.querySelector('#screen');
const modalLayer = root.querySelector('#modal');
const toastBox = root.querySelector('.game-toast');
const roomHost = root.querySelector('.canvas-room');
const cargoHost = root.querySelector('.booth-cargo');
const illustratedWorker = roomHost.querySelector('.static-worker');
const modelHost = root.querySelector('.model-world');
const homeShortcut = root.querySelector('.home-shortcut');
const soundToggle = root.querySelector('[data-act="sound"]');
const fullscreenToggle = root.querySelector('[data-act="fullscreen"]');
const phoneFixture = booth.querySelector('.wall-phone');
const phoneFixtureLabel = phoneFixture.querySelector('b');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const gaze = { x: 0, y: 0, targetX: 0, targetY: 0, frame: 0, time: 0 };
let fixtureElements = [...booth.querySelectorAll('[data-fixture]')];
let fixtureLayout = {};

bindViewport(root, ({ fullscreen, immersive, rotated }) => {
  if (drag) endDrag({ type: 'pointercancel', pointerId: drag.pointerId });
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
  if (drag) endDrag({ type: 'pointercancel', pointerId: drag.pointerId });
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
  suppressPaperClick = false;
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

function exceptionPaper(state, visit) {
  const exception = getShipmentException(state, visit);
  if (!exception) return null;
  const { record, day, title } = exception;
  const fields = [
    ['批号', record.batch], ['对应出货单', `${DAYS[record.day]?.title}开单`],
    ['复核记录', record.reason], ['收货处置', SHIPMENT_EXCEPTION.result],
    ['登记日', DAYS[day]?.title], ['复核单位', SHIPMENT_EXCEPTION.receiver],
  ];
  return { ...exception, document: { type: 'archive', kind: 'exception', title, fields } };
}

function filedWindowSupplement() {
  const request = run && getWindowSupplementRequest(run);
  if (!request) return null;
  const { record, proof } = request;
  const fields = [
    ['批号', record.batch], ['登记日', DAYS[record.day]?.title], ['经手', '罗诚 · 仓管'],
    ['窗口点收', proof.text], ['待补', '本批检验报告'], ['开单时去向', '黄线隔离'],
  ];
  return { caseId: record.id, key: `supplement:${record.id}`, document: {
    type: 'archive', kind: 'supplement', title: '补件登记联', fields,
  } };
}

function filedBatchPapers() {
  const trace = run.flags.traceDocument
    ? { caseId: TRACE_CASE_ID, key: 'trace', document: { ...EVIDENCE.trace, kind: 'trace' } } : null;
  return [filedRework(), acceptancePaper(run), exceptionPaper(run), trace, filedWindowSupplement()].filter(Boolean);
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
    ...Object.entries(EVIDENCE).filter(([key]) => run.flags[`${key}Document`] && !batchPapers.some((paper) => paper.key === key)),
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
  if (!filed) return null;
  const supplement = item.id === 9 ? filedWindowSupplement()?.document : null;
  return { ...previous, documents: supplement ? [...filed.documents, supplement] : filed.documents };
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
  if (sampleHeld && !interaction.thicknessOpen && interaction.referenceDoc !== null) heldDocuments = [interaction.referenceDoc];
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
  if (visit?.kind === 'exception') return exceptionPaper(state, visit)?.document;
  return visit && EVIDENCE[visit.key];
}

function scenePaperBatch(doc, item, visit) {
  if (visit?.kind === 'recall') return `${doc.fields[0][1]} · ${doc.fields[1][1]}`;
  if (visit?.kind === 'rework') return `${doc.fields[0][1]} · 周二复核`;
  if (visit?.kind === 'acceptance') return `${doc.fields[0][1]} · 收货方回签`;
  if (visit?.kind === 'exception') return `${doc.fields[0][1]} · 到货复核`;
  return visit ? '回访留底' : doc.fields[0]?.[1] ?? item.batch;
}

function sceneShipment(state, item, waiting) {
  if (state?.phase === 'receipt') {
    const record = state.records.at(-1);
    if (!record) return {};
    const route = receiptDisposition(record);
    const animate = issuedReceiptId === record.id;
    const shipment = { id: record.id, route, animate, staged: !waiting, inspectable: Boolean(getCase(state)?.carton) };
    const movingCargo = ['shipping', 'returned', 'held'].includes(route);
    return {
      cargo: movingCargo ? shipment : null,
      outgoingSlip: waiting ? null : shipment,
    };
  }
  if (!item) return {};
  const prior = getPreviousReceipt(state, item);
  if (prior?.sameLot && ['shipped', 'recallPending'].includes(prior.record.status)) return {};
  return { cargo: { id: item.id, route: 'ready', animate: false, inspectable: Boolean(item.carton) } };
}

function setScene() {
  const approaching = arrival?.stage === 'approach';
  const waiting = arrival && !approaching;
  const waitingNpc = waiting && arrival.ready ? visitorAt(windowAdvance(arrival.action)) : null;
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
  const npc = closingShot ? null : waiting ? (waitingNpc ?? (arrival.keepVisitor ? visitorAt(run) : null))
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
    keepVisitor: arrival?.keepVisitor ?? false, visitorWaiting: Boolean(waitingNpc),
    approach: arrival?.approach ?? (needsArrival(forecast) ? arrivalApproach(forecast) : undefined),
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
  homeShortcut.hidden = !run || run.phase === 'ending';
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
  const openEndingDetails = [...screenLayer.querySelectorAll('.ending-card details')].map(({ open }) => open);
  const historyLabel = reviewedWeekLabel();
  screenLayer.innerHTML = run
    ? (arrival || visit || closingShot ? '' : view.overlay(run, run.phase === 'ending' ? getEnding(run) : null, historyLabel, incomingCall))
    : view.home(saved, endings, completedShifts.size);
  if (closingShot === 'cat') screenLayer.innerHTML = '<span class="visually-hidden" role="status">窗外，厂猫走过了装货台。</span>';
  if (settingDownCloseSheet) {
    animateOnDesk(screenLayer.querySelector('.shift-close-sheet'), [
      { translate: '.8rem 1.35rem', rotate: '-.9deg', opacity: .65 },
      { translate: '0 0', rotate: '0deg', opacity: 1 },
    ], 300);
  }
  screenLayer.querySelectorAll('.ending-card details').forEach((details, index) => { details.open = openEndingDetails[index] === true; });
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

function syncWindowGlance() {
  const available = arrival?.ready && toolsAvailableBetweenBatches() && ['archive', 'phone'].includes(panel);
  arrivalStatus.classList.toggle('visually-hidden', Boolean(available));
  if (!available) {
    if (arrival) arrival.glancing = false;
    root.removeAttribute('data-window-glance');
    windowGlance.remove();
    return;
  }
  root.toggleAttribute('data-window-glance', Boolean(arrival.glancing));
  windowGlance.textContent = arrival.glancing
    ? (panel === 'phone' ? '回到电话' : '继续看单')
    : '窗口有人等候 · 抬头看';
  if (!windowGlance.isConnected) modalLayer.append(windowGlance);
  const dialog = modalLayer.querySelector('[aria-modal="true"]');
  dialog?.setAttribute('aria-owns', windowGlance.id);
  booth.inert = Boolean(dialog || arrival.glancing);
}

function toggleWindowGlance() {
  if (!windowGlance.isConnected) return;
  arrival.glancing = !arrival.glancing;
  syncWindowGlance();
  const returnTo = modalLayer.contains(lastToolFocus) ? lastToolFocus : modalLayer.querySelector('[data-act="close"]');
  (arrival.glancing ? windowGlance : returnTo)?.focus({ preventScroll: true });
}

function renderModal(item = windowCase(), step = item ? tutorialStep() : null) {
  const { compare, inspection, archiveFocus, archiveQuery, pinned, phoneNumber, egg } = interaction;
  const correction = activeCorrection();
  const correctionFindings = correction ? selectedCorrectionFindings(correction, correctionDraft.keys) : null;
  const batchPapers = panel === 'archive' || panel === 'handoff' ? filedBatchPapers() : [];
  const supportingBasis = correction && filedCorrectionBasis(correction);
  const incomingCall = incomingAtWindow();
  const work = { ...interaction, incomingCall, returningWeek: run?.sampleSet === 4 };
  let markup = '';
  if (panel === 'how' || panel === 'rules') markup = view.instructions(panel === 'how');
  if (panel === 'visit' && !arrival) {
    const visit = activeVisit();
    const doc = visitDocument(visit);
    if (doc) markup = view.visitPaper(doc, visit);
  }
  if (panel === 'docs' && item) markup = view.documents(item, viewedDocument(), compare, step, work, previousInspection(item));
  if (panel === 'sample' && item) markup = view.sample(item, inspection, step, work);
  if (panel === 'carton' && item?.carton) markup = view.carton(item, work);
  if (panel === 'archive' && run) {
    const sources = archivedReportSources(run, reportIndex ?? archiveQuery);
    const returnTo = archiveReturn?.panel;
    const finished = run.phase === 'ending';
    const historyLabel = reviewedWeekLabel();
    const original = archivePaper && archivedPaper(archivePaper.id, archivePaper.index);
    markup = original ? view.archiveSourcePaper(original, pinned, { returnTo: reportIndex ? 'report-index' : returnTo, finished, historyLabel })
      : reportIndex && sources.length
      ? view.archiveReportPanel(reportIndex, sources, pinned, { returnTo, finished, historyLabel })
      : view.archivePanel(archive(run, archiveQuery), filedSupportingPapers(archiveQuery, batchPapers), archiveFocus, pinned,
        archiveQuery, Boolean(correction), run.phase === 'handoff', finished, {
        returnTo, historyLabel,
        receivingIssue: finished ? getEnding(run).issues.find(({ id }) => id === archiveFocus) : null,
        windowCorrection: !arrival && canRecheckReceipt(run, archiveFocus),
        reportSuggestion: !correction && sources.length > 1 ? sources[0].number : null,
        canComparePrevious: !archiveReturn && run.phase === 'case' && item && getPreviousReceipt(run, item)?.record.id === archiveFocus,
        correctionFindings: correctionFindings ?? [],
        batchPapers,
        supportingBasis,
      });
  }
  if (panel === 'phone' && run) {
    const filed = archive(run);
    const papers = pinned.flatMap(({ id, index }) => {
      const row = filed.find((item) => item.id === id);
      return row ? [{ id, index, batch: row.batch, document: row.documents[index] ?? null }] : [];
    });
    markup = view.phone(phoneNumber, run.phone, papers, run.day >= 1, run.flags.phoneBack, item, {
      returnTo: phoneReturn?.archivePaper ? 'archive-paper' : phoneReturn?.reportIndex ? 'report-index' : phoneReturn?.panel,
      incomingCall,
    });
  }
  if (panel === 'handoff' && run?.phase === 'handoff') {
    const rows = archive(run).filter(({ record }) => record);
    const pair = handoffComparison(rows, handoffFocus);
    markup = view.handoffPanel(run, EVIDENCE, rows, {
      focus: handoffFocus, documentIndex: handoffDocument, correctionFindings, batchPapers, supportingBasis,
      canCompare: Boolean(pair), comparison: handoffPairOpen ? pair : null,
    });
  }
  if (panel === 'egg' && EASTER_EGGS[egg]) markup = view.egg(egg, item?.id);
  if (panel === 'restart') markup = view.dialog('重新接班', `<p>开一周新的班会覆盖当前值班存档。</p><div class="modal-actions">${view.button('回到上周', 'close')}${view.button('开始新一周', 'start', 'primary')}</div>`);
  if (panel === 'completed-shifts' && !run) {
    const entries = Array.from(completedShifts, ([id, completed], index) => {
      const { title, counts } = getEnding(completed);
      return {
        id, title, counts, completedAt: completed.completedAt,
        label: weekLabel(completedShifts.size - index), lastOpened: id === historyNavigation?.lastOpened,
      };
    });
    markup = view.dialog('交班存根', view.completedShifts(entries, endings.length), 'completed-shifts-modal');
  }
  if (!markup && !arrival && run?.phase === 'receipt' && !activeVisit()) {
    const record = run.records.at(-1);
    const previous = run.records.find(({ id }) => id === record.priorShipmentId);
    const next = windowAdvance('next');
    const supplement = filedWindowSupplement();
    markup = view.receipt(record, previous, activeVisit(next) ? null : next?.phase, {
      supplementKey: supplement?.caseId === record.id ? supplement.key : null,
      canCorrect: canRecheckReceipt(run, record.id),
    });
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
  syncWindowGlance();
  if (!markup) {
    if (hadModal && modalOpener) {
      focusControl(root, modalOpener);
      modalOpener = null;
    }
    return;
  }
  const focusables = [...modalLayer.querySelectorAll('button:not([disabled]), input')];
  const restored = focusedData?.act && focusables.find((element) => Object.entries(focusedData).every(([key, value]) => element.dataset[key] === value));
  const firstAction = surface?.querySelector('.receipt-surface [data-act="next"]') ?? focusables.find((element) => element instanceof HTMLButtonElement &&
    element.dataset.act && !element.classList.contains('reference-control') &&
    !['close', 'toggle-findings', 'remove-finding'].includes(element.dataset.act));
  (arrival?.glancing ? windowGlance : restored || firstAction || focusables[0])?.focus({ preventScroll: true });
  if (surface && surface.dataset.deskSurface !== previousSurface?.dataset.deskSurface) {
    const object = surface.querySelector('.sheet, .sample-stage .sample-object, .receipt-slip');
    const printsHere = object?.classList.contains('receipt-slip') && !hadModal && root.dataset.modeled === 'true' &&
      issuedReceiptId !== null && run.records.at(-1)?.id === issuedReceiptId;
    if (printsHere && !reducedMotion.matches) {
      object.animate?.([
        { translate: '0 .66rem', opacity: .92, easing: 'cubic-bezier(.2,.78,.27,1)' },
        { translate: '0 0', opacity: 1 },
      ], 310);
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
  if (panel === 'carton') return modalLayer.querySelector('.carton-surface .desk-surface-content');
  if (panel === 'phone') return modalLayer.querySelector('.phone-modal .modal-body');
  if (panel === 'handoff') return modalLayer.querySelector('.handoff-detail-scroll');
  if (panel === 'archive') return modalLayer.querySelector('.archive-surface .desk-surface-content');
  if (!panel && run?.phase === 'receipt' && !arrival) return modalLayer.querySelector('.receipt-surface .desk-surface-content');
  return null;
}

function persistRun() {
  if (!run || reviewingHistory) return;
  captureCorrectionScroll();
  const body = workspaceBody();
  const item = getCase(run);
  const lookup = reportWorkspace(run, {
    caseId: item?.id, panel, reportIndex, archivePaper, archiveFocus: interaction.archiveFocus,
    archiveQuery: interaction.archiveQuery, archiveReturn, phoneReturn, scrollTop: body?.scrollTop, scrollLeft: body?.scrollLeft,
  });
  const originalWork = lookup && [lookup.archiveReturn, lookup.phoneReturn?.archiveReturn, lookup.phoneReturn]
    .find((origin) => ['docs', 'sample'].includes(origin?.panel));
  const archived = originalWork ?? (panel === 'archive' && ['phone', 'docs', 'sample'].includes(archiveReturn?.panel) ? archiveReturn : null);
  const context = body || archived ? workspaceContext() : undefined;
  const workspacePanel = archived?.panel ?? panel;
  const workspace = context ? {
    ...context, panel: workspacePanel, scrollTop: archived ? archived.scrollTop : body?.scrollTop ?? 0,
    returnTo: workspacePanel === 'phone' ? phoneReturn : undefined,
  } : undefined;
  const pairWorkspace = recallPairReturn ?? handoffPairWorkspace();
  saved = {
    ...run,
    ...(arrival ? { arrivalAction: arrival.action } : {}),
    ...(correctionDraft && (run.phase === 'handoff' || (!arrival && canRecheckReceipt(run, correctionDraft.id))) ? { correctionDraft } : {}),
    ...(pairWorkspace ? { handoffPair: pairWorkspace } : {}),
    ...(lookup ? { reportWorkspace: lookup } : {}),
    inspectionProgress: captureInspectionProgress(item, interaction, workspace),
  };
  writeStorage(SAVE_KEY, saved);
}

function persistWorkspaceScroll() {
  clearTimeout(workspaceScrollTimer);
  const body = workspaceBody();
  const workspace = saved?.inspectionProgress?.workspace;
  let scrollTop = workspace?.panel === panel ? workspace?.scrollTop : undefined;
  const lookup = saved?.reportWorkspace?.panel === panel ? saved.reportWorkspace : null;
  if (lookup) scrollTop = lookup.scrollTop;
  if (panel === 'handoff' && handoffPairOpen) scrollTop = saved?.handoffPair?.scrollTop;
  else if (activeCorrection()) scrollTop = saved?.correctionDraft?.scrollTop;
  if (!body || scrollTop === undefined) return;
  const sameColumn = !lookup || Math.abs(body.scrollLeft - lookup.scrollLeft) < 1;
  if (Math.abs(body.scrollTop - scrollTop) < 1 && sameColumn) return;
  // Passive scroll saves must not replace newer progress from another tab.
  if (JSON.stringify(readStorage(SAVE_KEY)) === JSON.stringify(saved)) persistRun();
}

modalLayer.addEventListener('scroll', (event) => {
  if (event.target !== workspaceBody()) return;
  clearTimeout(workspaceScrollTimer);
  workspaceScrollTimer = setTimeout(persistWorkspaceScroll, 150);
}, { capture: true, passive: true });
modalLayer.addEventListener('focusin', (event) => {
  if (event.target !== windowGlance) lastToolFocus = event.target;
});
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
    if (before.phase === 'receipt' && run.phase !== 'receipt') correctionDraft = null;
    if (run.phase === 'ending') {
      correctionDraft = null;
      run = { ...run, completedAt: Date.now() };
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
      ...(archiveOrigin ? { reportIndex, archivePaper, archiveReturn, archiveFocus: interaction.archiveFocus, archiveQuery: interaction.archiveQuery } : {}) };
  } else if (panel === 'phone' && name !== 'archive' && name !== 'phone') {
    update({ type: 'hang-up' }, false);
    phoneReturn = null;
  }
  const archiveParent = panel ?? (opener?.closest('.receipt-surface') ? 'receipt' : null);
  if (name === 'archive' && ['phone', 'handoff', 'docs', 'sample', 'receipt'].includes(archiveParent)) {
    const body = workspaceBody();
    const index = panel === 'handoff' ? modalLayer.querySelector('.handoff-board') : body;
    archiveReturn = { panel: archiveParent, opener: { ...opener.dataset }, scrollTop: index?.scrollTop ?? 0, detailScroll: body?.scrollTop ?? 0,
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
  recallPairReturn = null;
  reviewingHistory = false;
  historyNavigation = null;
  issuedReceiptId = null;
  presentedEvidence = null;
  let workspace;
  let arrivalAction;
  let savedCorrection;
  let savedPair;
  let lookup;
  if (restore && saved) {
    const { inspectionProgress, arrivalAction: savedArrival, correctionDraft: draft, handoffPair: pair, reportWorkspace: savedLookup, ...savedRun } = saved;
    arrivalAction = savedArrival;
    savedCorrection = draft;
    savedPair = pair;
    run = restoreRun(savedRun);
    const restored = restoreInspectionProgress(inspectionProgress, getCase(run), run.seen, workspaceContext());
    ({ workspace, ...interaction } = restored);
    lookup = reportWorkspace(run, savedLookup);
  } else {
    const lastCompleted = saved?.phase === 'ending' ? saved : completedShifts.values().next().value;
    const newWeek = endings.length ? createFollowingRun(lastCompleted) : createRun();
    run = { ...newWeek, weekId: createWeekId() };
    interaction = freshInteraction();
  }
  panel = lookup?.panel ?? workspace?.panel ?? null;
  if (tutorialStep() && (panel === 'docs' || workspace?.returnTo?.panel === 'docs')) {
    const documents = getCase(run)?.documents;
    readDocument(documents?.[viewedDocument()]);
    readDocument(documents?.[interaction.compare]);
  }
  advanceTutorial();
  phoneReturn = lookup ? lookup.phoneReturn : workspace?.returnTo
    ? { ...workspace.returnTo, opener: { act: workspace.returnTo.panel === 'archive' ? 'phone-document' : 'phone' } } : null;
  if (panel !== 'phone') run = dispatch(run, { type: 'hang-up' });
  modalOpener = panel === 'docs' ? { act: 'doc', i: String(viewedDocument()) }
    : panel ? { act: panel, fixture: panel } : null;
  archiveReturn = lookup?.archiveReturn ?? null;
  reportIndex = lookup?.reportIndex ?? null;
  archivePaper = lookup?.archivePaper ?? null;
  if (lookup) {
    interaction.archiveFocus = lookup.archiveFocus;
    interaction.archiveQuery = lookup.archiveQuery;
  }
  handoffFocus = null;
  handoffDocument = null;
  handoffPairOpen = false;
  correctionDraft = restoreCorrectionDraft(savedCorrection);
  const next = windowAdvance(arrivalAction);
  const visit = activeVisit();
  const recallId = visit?.kind === 'recall' ? visit.caseId : windowAction(arrivalAction)?.id;
  if (Number.isInteger(recallId)) recallPairReturn = pairForRecall(savedPair, recallId);
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
    } else {
      focusArchiveRow(correctionDraft.id);
      if (run.phase === 'receipt') {
        archiveReturn = {
          panel: 'receipt', opener: { act: 'archive-receipt', i: String(correctionDraft.id) },
          scrollTop: correctionDraft.receiptScrollTop,
        };
      }
    }
    playSound('paper');
    render(correctionDraft.scrollTop);
    if (panel === 'handoff') revealHandoffSelection();
    return;
  }
  const resumeSound = { docs: 'paper', sample: 'slide', carton: 'slide', phone: 'click' }[panel];
  if (resumeSound) playSound(resumeSound);
  else if (run.phase !== 'summary') playSound(run.phase === 'ending' ? 'paper' : 'shutter');
  render(lookup?.scrollTop ?? workspace?.scrollTop);
  if (lookup) {
    const body = workspaceBody();
    if (body) body.scrollLeft = lookup.scrollLeft;
  }
  if (restore && interaction.benchFindingsOpen) {
    desktop.querySelector('.finding-show[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

function weekLabel(number) {
  return `第 ${number} 份存根`;
}

function reviewedWeekLabel() {
  if (!reviewingHistory) return '';
  const index = [...completedShifts.keys()].indexOf(run.weekId);
  return index < 0 ? '交班存根' : weekLabel(completedShifts.size - index);
}

function reviewCompletedShift(id) {
  const completed = completedShifts.get(id);
  if (run || panel !== 'completed-shifts' || !completed) return;
  cancelArrivalPause();
  cancelClosingShot();
  historyNavigation = { ...historyNavigation, listScroll: modalLayer.querySelector('.completed-shifts-modal .modal-body')?.scrollTop ?? 0 };
  run = completed;
  reviewingHistory = true;
  interaction = freshInteraction();
  if (historyNavigation.query) interaction.archiveQuery = historyNavigation.query;
  const rows = archive(run, interaction.archiveQuery);
  interaction.archiveFocus = rows.find(({ id }) => id === historyNavigation.caseId)?.id ?? rows.at(-1)?.id ?? null;
  panel = null;
  modalOpener = null;
  archiveReturn = null;
  reportIndex = null;
  archivePaper = null;
  correctionDraft = null;
  phoneReturn = null;
  playSound('paper');
  render();
  focusControl(screenLayer, { act: 'archive' });
}

function returnToHistory() {
  if (!reviewingHistory) return;
  const id = run.weekId;
  historyNavigation = { ...historyNavigation, query: interaction.archiveQuery, caseId: interaction.archiveFocus, lastOpened: id };
  run = null;
  reviewingHistory = false;
  panel = 'completed-shifts';
  modalOpener = { act: 'completed-shifts' };
  render();
  modalLayer.querySelector('.completed-shifts-modal .modal-body')?.scrollTo(0, historyNavigation.listScroll);
  focusControl(modalLayer, { act: 'review-shift', key: id });
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
      const returnPair = recallPairReturn;
      recallPairReturn = null;
      if (!confirmed) toast('这份回执需要再核对');
      if (returnPair && restoreHandoffPair(returnPair)) {
        revealHandoffSelection(true);
        return;
      }
      panel = 'handoff';
      modalOpener = { act: 'handoff' };
      handoffFocus = visit.caseId;
      handoffDocument = null;
      handoffPairOpen = false;
    } else {
      const paper = { rework: '返工复核联', acceptance: '到货验收联', exception: '到货复核联' }[visit.kind] ?? '留底';
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
      syncWindowGlance();
      setScene();
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
  if (panel || !interaction.benchFindingsOpen) return;
  const finding = interaction.findings.find((entry) => entry.key === key);
  if (!finding || !canShowFinding(windowCase(), finding)) return;
  const scroll = desktop.querySelector('.bench-draft-body')?.scrollTop ?? 0;
  if (!update({ type: 'show-finding', finding }, false)) return;
  presentedEvidence = run.shownFinding;
  toast('');
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
  if (!run || arrival || reviewingHistory || (run.phase !== 'handoff' && !canRecheckReceipt(run, id))) return null;
  return archive(run).find((row) => row.id === id && row.record && !row.latestReceipt) ?? null;
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

function filedCorrectionBasis(row) {
  if (row.id === TRACE_CASE_ID && run.flags.traceDocument) {
    return { kind: 'trace', label: '引用实验室原件', finding: TRACE_FINDING };
  }
  const exception = getShipmentException(run);
  if (row.id === exception?.caseId) {
    return {
      kind: 'exception', label: '引用到货复核联',
      finding: { key: exception.key, source: SHIPMENT_EXCEPTION.title, text: exception.record.reason },
    };
  }
  const rework = filedRework();
  if (!rework || row.id !== rework.caseId) return null;
  const facts = rework.document.fields.filter(([label]) => label === '检查记录' || label === '复核结论');
  return {
    kind: 'rework', label: '引用复核联',
    finding: { key: rework.key, source: rework.document.title, text: facts.map(([, value]) => value).join('。') },
  };
}

function selectedCorrectionFindings(row, keys = []) {
  if (!row) return [];
  const available = [
    ...row.documents.flatMap((doc, index) => doc.fields.map((_, field) => paperFieldFinding(doc, index, field))),
    ...readFindings(row.record).filter(({ key }) => key.startsWith('sample:') || key.startsWith('compare:') || key.startsWith('box:')),
  ];
  const supporting = filedCorrectionBasis(row);
  if (supporting) available.push(supporting.finding);
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
    ...(run.phase === 'receipt' && Number.isFinite(draft.receiptScrollTop) ? { receiptScrollTop: Math.max(0, draft.receiptScrollTop) } : {}),
  };
}

function captureCorrectionScroll() {
  if (!activeCorrection()) return;
  correctionDraft.scrollTop = workspaceBody()?.scrollTop ?? 0;
  correctionDraft.fromBoard = panel === 'handoff';
  correctionDraft.documentIndex = panel === 'handoff' ? handoffDocument : null;
  if (archiveReturn?.panel === 'receipt') correctionDraft.receiptScrollTop = archiveReturn.scrollTop;
}

function focusArchiveRow(id) {
  captureCorrectionScroll();
  reportIndex = null;
  archivePaper = null;
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

function setDocumentPair(left, right) {
  Object.assign(interaction, { doc: left, compare: right, deliveryCheck: null, relabelCheck: null,
    spreadAll: false, previousDoc: null, previousCurrentDoc: null, clipboardBack: false });
}

function openProjectComparison(orderIndex, reportIndex) {
  if (!projectComparison(documentCheckItem(), orderIndex, reportIndex)) return;
  setDocumentPair(orderIndex, reportIndex);
  playSound('slide');
  render(0);
  focusControl(modalLayer, { act: 'project-evidence', i: String(orderIndex), key: String(reportIndex) });
}

function openDeskPair(left, right, opener) {
  setDocumentPair(left, right);
  playSound('slide');
  openPanel('docs', opener);
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
    const supplement = previous.documents.findIndex((doc) => doc.kind === 'supplement');
    const order = previous.documents.findIndex((doc) => doc.type === 'order');
    interaction.previousDoc = [matching, supplement, order, 0].find((index) => index >= 0);
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

function checkCarton(action, opener) {
  const item = windowCase();
  if (run?.phase !== 'case' || !item?.carton) return;
  if (action === 'carton') {
    if (panel && panel !== 'docs') return;
    playSound('slide');
    openPanel('carton', opener);
    return;
  }
  if (panel !== 'carton') return;
  if (action === 'carton-turn') {
    interaction.cartonBottom = !interaction.cartonBottom;
    playSound('slide');
    render();
    animateOnDesk(modalLayer.querySelector('.carton-model'), [
      { rotate: 'x -24deg', opacity: .7 }, { rotate: 'x 0deg', opacity: 1 },
    ], 235);
  } else {
    const finding = cartonFinding(item, interaction.cartonBottom);
    if (!finding) return;
    toggleFinding(finding);
    playSound('click');
    render();
  }
}

function toggleReference() {
  if (panel !== 'sample') return;
  const documents = getCase(run)?.documents;
  if (!documents?.length) return;
  const fromThickness = interaction.thicknessOpen;
  interaction.thicknessOpen = false;
  if (interaction.referenceDoc !== null && !fromThickness) {
    interaction.referenceDoc = null;
  } else if (interaction.referenceDoc === null) {
    const report = documents.findIndex((doc) => doc.type === 'report');
    const sketch = documents.findIndex((doc) => doc.kind === 'mold-sketch');
    const order = documents.findIndex((doc) => doc.type === 'order');
    interaction.referenceDoc = interaction.returnToDocs ? viewedDocument() : [sketch, report, order, 0].find((index) => index >= 0);
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
      if (sample.back || !['film', 'crack'].includes(spec.kind)) return;
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
      if (!sample.measured) interaction.thicknessOpen = false;
      sound = sample.measured ? 'clasp' : 'slide';
      break;
    case 'sample-thickness':
      if (tutorialStep() || !thicknessComparison(item, sample)) return;
      interaction.thicknessOpen = !interaction.thicknessOpen;
      sound = 'paper';
      break;
    case 'sample-thickness-basis': {
      if (tutorialStep() || !interaction.thicknessOpen) return;
      const comparison = thicknessComparison(item, sample);
      if (!comparison) return;
      const recorded = toggleFinding(comparison.finding);
      sound = 'paper';
      toast(recorded ? '已记下厚度对照' : '已取回这组厚度对照');
      break;
    }
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
  if (act === 'sample-thickness' && interaction.thicknessOpen) {
    modalLayer.querySelector('.sample-inspector')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
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
    if (['docs', 'sample', 'carton', 'archive'].includes(panel)) toast('先回到台面，再用开单机盖章');
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
  const activeArchivePaper = archivePaper ? archivePaper.id === caseId && archivePaper.index === index : interaction.archiveFocus === caseId;
  if (panel === 'archive' && activeArchivePaper && !activeCorrection()) {
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
  archivePaper = null;
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

function archivedPaper(id, index) {
  const row = archive(run).find((item) => item.id === id);
  const document = row?.documents[index];
  if (!document) return null;
  const day = row.record?.day ?? DAYS.findIndex(({ cases }) => cases.some((item) => item.id === id));
  return { id, index, batch: row.batch, day, document };
}

function openArchivePaper(id, index, opener) {
  if (!run || !Number.isInteger(index)) return;
  if (panel === 'archive' && reportIndex && !archivePaper) {
    if (!archivedReportSources(run, reportIndex).some((source) => source.id === id && source.index === index)) return;
    const body = workspaceBody();
    archivePaper = { id, index, scrollTop: body?.scrollTop ?? 0, scrollLeft: body?.scrollLeft ?? 0 };
    playSound('paper');
    render(0);
  } else if (panel === 'phone' && interaction.pinned.some((paper) => paper.id === id && paper.index === index) && archivedPaper(id, index)) {
    focusArchiveRow(id);
    interaction.archiveQuery = '';
    archivePaper = { id, index, scrollTop: 0, scrollLeft: 0 };
    playSound('paper');
    openPanel('archive', opener);
  }
}

function openHandoff(opener) {
  if (run?.phase !== 'handoff') return;
  const exception = opener?.dataset.key === 'exception' ? getShipmentException(run) : null;
  if (exception) {
    handoffFocus = exception.caseId;
    handoffDocument = 'exception';
    handoffPairOpen = false;
  } else if (handoffFocus === null) {
    const current = archive(run).filter(({ record, latestReceipt }) => record && !latestReceipt);
    handoffFocus = (current.find(({ record }) => record.status === 'recallPending')
      ?? current.find(({ record }) => record.status === 'shipping') ?? current[0])?.id ?? null;
  }
  playSound('paper');
  openPanel('handoff', opener);
  revealHandoffSelection();
}

function handoffPairWorkspace() {
  if (!handoffPairOpen || run?.phase !== 'handoff') return null;
  const parent = panel === 'archive' && archiveReturn?.panel === 'handoff' ? archiveReturn : null;
  if (panel !== 'handoff' && !parent) return null;
  return {
    id: handoffFocus,
    documentIndex: handoffDocument,
    scrollTop: parent?.detailScroll ?? workspaceBody()?.scrollTop ?? 0,
  };
}

function pairForRecall(workspace, caseId) {
  if (!workspace || run?.phase !== 'handoff') return null;
  const comparison = handoffComparison(archive(run), workspace.id);
  return comparison && [comparison.earlier.id, comparison.later.id].includes(caseId) ? workspace : null;
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

function selectHandoff(id, reveal, documentIndex) {
  if (panel !== 'handoff' || (handoffFocus === id && !handoffPairOpen && documentIndex === undefined)) return;
  const row = id === 'attachments' ? null : archive(run).find((entry) => entry.id === id && entry.record);
  if (id !== 'attachments' && !row) return;
  captureCorrectionScroll();
  handoffPairOpen = false;
  handoffFocus = id;
  const draft = correctionDraft?.id === id ? correctionDraft : null;
  handoffDocument = hasHandoffDocument(row, documentIndex) ? documentIndex : draft?.documentIndex ?? null;
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
  if (panel === 'archive' && reportIndex && archivePaper) {
    const { id, index, scrollTop, scrollLeft } = archivePaper;
    archivePaper = null;
    playSound('paper');
    render(scrollTop);
    workspaceBody()?.scrollTo(scrollLeft, scrollTop);
    focusControl(modalLayer, { act: 'report-index-paper', i: String(id), doc: String(index) });
    return;
  }
  let previousPanel = run && panel === 'archive' ? archiveReturn : null;
  if (panel === 'phone') {
    update({ type: 'hang-up' }, false);
    previousPanel = phoneReturn;
    phoneReturn = null;
  }
  const toReceipt = previousPanel?.panel === 'receipt';
  panel = toReceipt ? null : previousPanel?.panel ?? null;
  if (toReceipt) modalOpener = null;
  archiveReturn = previousPanel?.archiveReturn ?? null;
  reportIndex = previousPanel?.reportIndex ?? null;
  archivePaper = previousPanel?.archivePaper ?? null;
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
    const opener = previousPanel.opener && focusControl(modalLayer, previousPanel.opener);
    if (opener?.dataset.act === 'phone-document') opener.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  } else if (run?.phase === 'summary' && document.activeElement === document.body) focusControl(screenLayer, { act: 'advance-day' });
}

root.addEventListener('click', (event) => {
  const target = event.target.closest('[data-act]');
  if (!target || target.matches(':disabled')) return;
  if (target === toolClickTarget && event.detail > 0) return;
  const { act, key } = target.dataset;
  const index = Number(target.dataset.i);
  if (act === 'doc' && suppressPaperClick && event.detail > 0) return;
  if (act.startsWith('sample-')) { checkSample(act); return; }
  switch (act) {
    case 'carton': case 'carton-turn': case 'carton-note': checkCarton(act, target); break;
    case 'window-glance': toggleWindowGlance(); break;
    case 'how': case 'rules': openPanel(act, target); break;
    case 'completed-shifts':
      if (!run && completedShifts.size) {
        historyNavigation = null;
        openPanel('completed-shifts', target);
      }
      break;
    case 'review-shift': reviewCompletedShift(key); break;
    case 'history-index': returnToHistory(); break;
    case 'sound': setMuted(!isMuted()); playSound('click'); render(); break;
    case 'fullscreen': void toggleFullscreen(root); break;
    case 'new': if (saved && saved.phase !== 'ending') openPanel('restart', target); else enter(false); break;
    case 'start': enter(false); break;
    case 'resume': enter(true); break;
    case 'shift-home': case 'home': {
      const fromHistory = reviewingHistory;
      const fromShift = Boolean(run && !fromHistory && run.phase !== 'ending');
      if (fromShift) persistRun();
      cancelArrivalPause();
      cancelClosingShot();
      run = null;
      reviewingHistory = false;
      historyNavigation = null;
      recallPairReturn = null;
      phoneReturn = null;
      toast('');
      resetGaze();
      closePanel();
      if (fromHistory) focusControl(screenLayer, { act: 'completed-shifts' });
      else if (fromShift) focusControl(screenLayer, { act: 'resume' });
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
    case 'receipt-basis': {
      const facts = modalLayer.querySelector('.receipt-surface .receipt-findings');
      if (!facts || !target.closest('.receipt-surface')) break;
      facts.tabIndex = -1;
      facts.focus({ preventScroll: true });
      facts.scrollIntoView({ block: 'start', inline: 'nearest' });
      break;
    }
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
      if (act === 'receive-recall') {
        recallPairReturn = pairForRecall(handoffPairWorkspace(), index);
        toast('');
      }
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
    case 'report-index-paper': openArchivePaper(index, Number(target.dataset.doc), target); break;
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
        archivePaper = null;
        playSound('paper');
        render();
        revealArchiveReceipt(true);
      }
      break;
    case 'archive-receipt': case 'phone-paper': {
      if (!run?.seen.includes(index)) break;
      if (act === 'phone-paper' && target.dataset.doc !== undefined) {
        openArchivePaper(index, Number(target.dataset.doc), target);
        break;
      }
      focusArchiveRow(index);
      interaction.archiveQuery = '';
      openArchive(target);
      revealArchiveReceipt(true);
      break;
    }
    case 'archive-focus': case 'archive-followup': case 'archive-evidence':
      if (act === 'archive-evidence' && !panel && target.closest('.receipt-surface')) {
        if (filedWindowSupplement()?.key !== key) break;
        focusArchiveRow(key);
        interaction.archiveQuery = '';
        openArchive(target);
        revealArchiveReceipt(true);
        break;
      }
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
        if (fromBoard && handoffDocument === null && row.documents.length) {
          handoffDocument = row.id === TRACE_CASE_ID && hasHandoffDocument(row, 'trace') ? 'trace' : 0;
        }
        correctionDraft = { id: row.id, keys: [], fromBoard, documentIndex: fromBoard ? handoffDocument : null, scrollTop: 0 };
      }
      playSound('paper');
      render(!editing && (panel === 'handoff' || run.phase === 'receipt') ? 0 : undefined);
      if (!editing && run.phase === 'receipt') {
        const finding = modalLayer.querySelector('.correction-original');
        if (finding) {
          finding.focus({ preventScroll: true });
          finding.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          persistRun();
        }
      }
      break;
    }
    case 'correction-basis': editCorrectionFinding(`doc:${index}:${Number(target.dataset.field)}`, { field: target }); break;
    case 'correction-original': editCorrectionFinding(key); break;
    case 'correction-remove': editCorrectionFinding(key, { remove: true }); break;
    case 'recheck': {
      const row = activeCorrection();
      if (!row) break;
      const findings = selectedCorrectionFindings(row, correctionDraft.keys);
      const atWindow = run.phase === 'receipt';
      if (update({ type: atWindow ? 'recheck-receipt' : 'recheck', id: row.id, value: key, findings }, false)) {
        correctionDraft = null;
        const needsRecall = run.records.find(({ id }) => id === row.id)?.status === 'recallPending';
        if (atWindow) {
          issuedReceiptId = row.id;
          toast('');
          closePanel();
          scenery?.setPressed?.(key);
        } else if (panel === 'handoff') {
          handoffDocument = null;
          render(0);
          revealHandoffSelection(!needsRecall);
          if (needsRecall) modalLayer.querySelector('.handoff-detail-recall')?.focus({ preventScroll: true });
        } else {
          render();
          revealArchiveReceipt(false);
        }
        playSound('stamp');
        if (!atWindow && !needsRecall) toast('更正已留底');
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
    case 'handoff-focus': selectHandoff(index, !target.closest('.handoff-board'), target.dataset.doc); break;
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
  if (arrival?.glancing) {
    if (event.key === 'Escape') { event.preventDefault(); toggleWindowGlance(); }
    if (event.key === 'Tab') { event.preventDefault(); windowGlance.focus({ preventScroll: true }); }
    return;
  }
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
    peeled: stage.classList.contains('peeled'), filmTravel: 0,
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
  if (kind === 'film') {
    const { peeled } = toolDrag;
    const outward = dx * .6 - dy * .8;
    const travel = Math.max(0, Math.min(30, peeled ? -outward : outward));
    toolDrag.filmTravel = travel;
    stage.style.setProperty('--film-drag', peeled ? 1 - travel / 30 : travel / 30);
  }
  if (kind === 'gauge' && toolDrag.distance >= 9) {
    stage.dataset.toolDrag = kind;
    stage.toggleAttribute('data-gauge-over', isOverGauge(event, slot));
    stage.style.setProperty('--tool-dx', `${dx.toFixed(1)}px`);
    stage.style.setProperty('--tool-dy', `${dy.toFixed(1)}px`);
  }
});

function endToolDrag(event) {
  if (!toolDrag || (event.type !== 'blur' && event.pointerId !== toolDrag.pointerId)) return;
  const { handle, stage, distance, kind, action, slot, measured, filmTravel } = toolDrag;
  toolDrag = null;
  delete stage.dataset.toolDrag;
  stage.removeAttribute('data-gauge-over');
  for (const property of ['--clasp-pull', '--wrap-pull', '--tool-dx', '--tool-dy']) stage.style.removeProperty(property);
  if (event.type === 'pointerup' && distance >= 9) {
    toolClickTarget = handle;
    let completed = true;
    if (kind === 'gauge') completed = Boolean(slot) && isOverGauge(event, slot) !== measured;
    if (kind === 'wrapper') completed = distance >= 18;
    if (kind === 'film') completed = filmTravel >= 18;
    if (completed && stage.isConnected) checkSample(action);
  }
  if (kind === 'film') {
    const film = stage.isConnected && filmTravel > 0 ? stage.querySelector('.sample-film-sheet') : null;
    const from = film ? getComputedStyle(film).transform : null;
    stage.style.removeProperty('--film-drag');
    if (film) animateOnDesk(film, [{ transform: from }, { transform: getComputedStyle(film).transform }], 160);
  }
  setGazeTarget(gaze.targetX, gaze.targetY);
}

window.addEventListener('pointerup', endToolDrag);
window.addEventListener('pointercancel', endToolDrag);
window.addEventListener('lostpointercapture', endToolDrag);
window.addEventListener('blur', endToolDrag);

function captureDeskPaperTargets(source, modeledProjection) {
  if (panel || tutorialStep()) return [];
  const papers = [...desktop.querySelectorAll('[data-drag="paper"]:enabled:not([data-lifted])')].filter((paper) => paper !== source);
  if (modeledProjection) {
    const faces = scenery.capturePaperTargets?.() ?? [];
    return faces.flatMap(({ index, contains }) => {
      const paper = papers.find((entry) => Number(entry.dataset.i) === index);
      return paper ? [{ paper, contains: (event) => contains(modeledProjection(event.clientX, event.clientY)) }] : [];
    });
  }
  return papers.flatMap((paper) => {
    const box = paper.getBoundingClientRect();
    if (!box.width || !box.height) return [];
    const marginX = box.width * .10;
    const marginY = box.height * .10;
    return [{ paper, contains: ({ clientX, clientY }) => clientX > box.left + marginX && clientX < box.right - marginX &&
      clientY > box.top + marginY && clientY < box.bottom - marginY }];
  });
}

function paperDropTarget(work, event) {
  if (panel || run?.phase !== 'case' || !work.paper.isConnected) return null;
  const hits = work.targets.filter(({ paper, contains }) => paper.isConnected && contains(event));
  return hits.length === 1 ? hits[0].paper : null;
}

function markPaperDrop(work, target) {
  if (work.target === target) return;
  clearTimeout(work.pairTimer);
  work.target?.removeAttribute('data-pair-drop');
  work.target = target;
  work.pairReady = false;
  if (!target) return;
  target.dataset.pairDrop = 'near';
  work.pairTimer = setTimeout(() => {
    if (drag !== work || !work.paper.isConnected || !target.isConnected || panel) return;
    work.pairReady = true;
    target.dataset.pairDrop = 'ready';
    playSound('click');
  }, PAPER_PAIR_HOLD_MS);
}

function moveDeskPaper(work, offset, lift = 0) {
  work.paper.style.setProperty('--paper-x', `${offset.x}px`);
  work.paper.style.setProperty('--paper-y', `${offset.y}px`);
  scenery?.setPaperOffset?.(work.index, offset, lift);
}

desktop.addEventListener('pointerdown', (event) => {
  const paper = event.target.closest('[data-drag="paper"]');
  if (!paper || event.button !== 0 || !event.isPrimary || drag || toolDrag || run?.phase !== 'case') return;
  const index = Number(paper.dataset.i);
  const projection = root.dataset.modeled === 'true' ? scenery?.captureDeskProjection?.() : null;
  const project = projection ?? captureDeskProjection(desktop) ?? ((x, y) => stagePoint(root, x, y));
  const offset = interaction.positions[index] ?? { x: 0, y: 0 };
  drag = { paper, index, pointerId: event.pointerId, project, origin: project(event.clientX, event.clientY),
    offset, resting: offset, moved: false, targets: captureDeskPaperTargets(paper, projection), target: null, pairReady: false };
});

window.addEventListener('pointermove', (event) => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  if (!drag.paper.isConnected) {
    endDrag({ type: 'pointercancel', pointerId: event.pointerId });
    return;
  }
  const point = drag.project(event.clientX, event.clientY);
  const x = point.x - drag.origin.x;
  const y = point.y - drag.origin.y;
  if (!drag.moved && Math.hypot(x, y) < 7) return;
  if (!drag.moved) {
    drag.paper.classList.add('moving');
    playSound('paper');
  }
  drag.moved = true;
  const next = { x: drag.offset.x + x, y: drag.offset.y + y };
  drag.resting = { x: Math.max(-90, Math.min(90, next.x)), y: Math.max(-35, Math.min(40, next.y)) };
  const target = paperDropTarget(drag, event);
  markPaperDrop(drag, target);
  const preview = drag.targets.length ? { x: Math.max(-380, Math.min(380, next.x)), y: Math.max(-65, Math.min(65, next.y)) } : drag.resting;
  moveDeskPaper(drag, preview, drag.targets.length ? .05 : 0);
});

function endDrag(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const work = drag;
  const released = event.type === 'pointerup';
  const pair = released && work.pairReady && paperDropTarget(work, event) === work.target ? work.target : null;
  markPaperDrop(work, null);
  drag = null;
  if (work.moved && work.paper.isConnected) {
    work.paper.classList.remove('moving');
    suppressPaperClick = true;
    const offset = released && !pair ? work.resting : work.offset;
    moveDeskPaper(work, offset);
    if (pair) openDeskPair(Number(pair.dataset.i), work.index, work.paper);
    else if (released) {
      interaction.positions[work.index] = offset;
      persistRun();
    }
  }
  setGazeTarget(gaze.targetX, gaze.targetY);
}

window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);
window.addEventListener('blur', () => {
  if (drag) endDrag({ type: 'pointercancel', pointerId: drag.pointerId });
  resetGaze();
});
render();

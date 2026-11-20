import { createRun, createFollowingRun, restoreRun, dispatch, getCase, getDay, getEnding, getIncomingCall, getPreviousReceipt, archive, TUTORIAL, EVIDENCE } from './engine.js';
import { DAYS, EASTER_EGGS } from './content.js';
import { sampleAppearance, sampleObservation } from './samples.js';
import { bindViewport, toggleFullscreen, stagePoint, playSound, isMuted, setMuted } from './devices.js';
import { captureDeskProjection } from './desk-projection.js';
import { freshInteraction, captureInspectionProgress, restoreInspectionProgress } from './inspection-progress.js';
import { readFindings } from './inspection-findings.js';
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
let workspaceScrollTimer = 0;
let drag;
let toolDrag = null;
let toolClickTarget = null;
let stampTouch = null;
let suppressPaperClick = false;
let modalOpener = null;
let archiveReturn = null;
let correctionDraft = null;
let phoneReturn = null;
let ringing = null;
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
    if (fixture === 'findings' && fixtureLayout.sample) {
      const sample = fixtureLayout.sample;
      element.style.setProperty('--fixture-sample-bottom', `${(sample.y + sample.h).toFixed(1)}px`);
    }
  }
}

function showModeledScene() {
  if (!modeledReady || root.dataset.modeled === 'true' || panel || drag) return;
  if (!arrivalTimer && (run?.phase === 'case' || run?.phase === 'receipt' || activeVisit())) return;
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

function windowCase() {
  return run && !arrivalTimer && !activeVisit() ? getCase(run) : null;
}

function filedSupportingPapers(query) {
  const term = query.trim().toLowerCase();
  const visits = Object.entries(EVIDENCE).filter(([key]) => run.flags[`${key}Document`]);
  const recalls = run.records.filter((record) => record.recallReceipt).map((record) => [
    `recall:${record.id}`, recallPaper(record, record.recallReceipt.day),
  ]);
  const calls = run.phoneLog.filter((call) => call?.kind === 'incoming').map((call) => [
    `call:${call.incomingKey}`,
    {
      type: 'archive',
      title: call.incomingKey === 'ringback' ? '回铃录音' : '实验室收班来电',
      fields: [['内线', call.number], ['接听', DAYS[call.day]?.title ?? '已登记'], ['通话内容', call.lines.join(' ')]],
    },
  ]);
  return [...visits, ...recalls, ...calls].filter(([, doc]) =>
    !term || [doc.title, ...doc.fields.flat(), doc.note].some((text) => text?.toLowerCase().includes(term)));
}

function incomingAtWindow() {
  return run && !arrivalTimer && !activeVisit() && ['case', 'receipt', 'summary', 'handoff'].includes(run.phase)
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
  return interaction.previousCurrentDoc ?? interaction.doc;
}

function heldObjects(item) {
  const sampleHeld = panel === 'sample';
  let heldDocuments = [];
  if (panel === 'docs') {
    if (interaction.previousDoc !== null) heldDocuments = [viewedDocument()];
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
  return visit && EVIDENCE[visit.key];
}

function setScene() {
  const approaching = arrival?.stage === 'approach';
  const waiting = arrival && !approaching;
  const sceneRun = approaching ? arrival.next : run;
  const visit = waiting ? null : activeVisit(sceneRun);
  const phase = approaching ? 'arriving' : waiting ? 'waiting' : (run?.phase ?? 'home');
  const item = !waiting && !visit && sceneRun ? getCase(sceneRun) : null;
  const npc = waiting ? (arrival.keepVisitor ? visitorAt(run) : null)
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
  scenery?.setFrame({ day: sceneRun?.day ?? 0, phase, npc: npc || null, visit: Boolean(visit),
    documents: documents.map((doc) => ({ type: doc.type, title: doc.title,
      batch: visit?.kind === 'recall' ? `${doc.fields[0][1]} · ${doc.fields[1][1]}` : visit ? '回访留底' : doc.fields[0]?.[1] ?? item.batch })),
    sample: appearance ? { ...inspection, filename: `${appearance.stem}${side}.webp`, kind: item.sample.kind } : null,
    positions: approaching ? {} : interaction.positions, pencil: !arrival && showPencil(item), ...heldObjects(item),
    keepVisitor: arrival?.keepVisitor ?? false, approach: arrival?.approach ?? (needsArrival(forecast) ? arrivalApproach(forecast) : undefined) });
}

function render(resumeScroll) {
  root.dataset.phase = arrivalTimer ? 'waiting' : (run?.phase ?? 'home');
  if (arrival) root.dataset.arrivalStage = arrival.stage;
  else delete root.dataset.arrivalStage;
  const incomingCall = incomingAtWindow();
  showRinging(incomingCall);
  const waitMessage = arrival?.stage === 'approach' ? '窗口递件…'
    : arrival?.action?.type === 'receive-recall' ? '等收货方回执…' : arrival ? '等下一位…' : '';
  if (arrivalStatus.textContent !== waitMessage) arrivalStatus.textContent = waitMessage;
  status.innerHTML = run ? `<span>${getDay(run).title}</span><span>第 ${run.day + 1} 天 / 5</span>` : '<span>质检员的一天</span>';
  wallShift.innerHTML = run ? view.wallShift(run) : '';
  soundToggle.setAttribute('aria-pressed', String(!isMuted()));
  soundToggle.setAttribute('aria-label', isMuted() ? '开启音效' : '关闭音效');
  const item = windowCase();
  const step = item ? tutorialStep() : null;
  const visit = arrivalTimer ? null : activeVisit();
  const previous = item && run.phase === 'case' ? getPreviousReceipt(run, item) : null;
  const teaching = item?.id === 2 && !interaction.inspection.film ? '先对箱签和报告。检查镜片时，可以掀开检样的膜角。' : '';
  hud.innerHTML = run && !arrivalTimer ? view.room(run, item, step, teaching, item?.pressureLine, visit, previous) : '';
  const preview = arrival?.stage === 'approach' && root.dataset.modeled !== 'true' ? arrival.next : null;
  const previewVisit = preview ? activeVisit(preview) : null;
  const previewItem = preview && !previewVisit ? getCase(preview) : null;
  const delivered = visit ? visitDocument(visit) : visitDocument(previewVisit, preview);
  desktop.innerHTML = delivered ? view.visitSlip(delivered) : item ? view.desk(run, item, step, {
    ...interaction, pencil: showPencil(item), stampBlocked: Boolean(panel), ...heldObjects(item),
  }) : previewItem ? view.desk(preview, previewItem, null, { ...freshInteraction(), stampBlocked: true }) : '';
  fixtureElements = [...booth.querySelectorAll('[data-fixture]')];
  showModeledScene();
  if (root.dataset.modeled === 'true') placeFixtures();
  const recapScroll = screenLayer.querySelector('.summary-body, .ending-body')?.scrollTop;
  const delayOpen = screenLayer.querySelector('details.ending-delay')?.open;
  screenLayer.innerHTML = run
    ? (arrivalTimer || visit ? '' : view.overlay(run, run.phase === 'ending' ? getEnding(run) : null, reviewingHistory, incomingCall))
    : view.home(saved, endings, completedShifts.size);
  const delayDetails = screenLayer.querySelector('details.ending-delay');
  if (delayDetails && delayOpen) delayDetails.open = true;
  if (recapScroll !== undefined) screenLayer.querySelector('.summary-body, .ending-body')?.scrollTo(0, recapScroll);
  setScene();
  renderModal(item, step);
  if (resumeScroll !== undefined) workspaceBody()?.scrollTo(0, resumeScroll);
  persistRun();
}

function renderModal(item = windowCase(), step = item ? tutorialStep() : null) {
  const { compare, inspection, archiveFocus, archiveQuery, archiveEditing, pinned, phoneNumber, egg } = interaction;
  const incomingCall = incomingAtWindow();
  const work = { ...interaction, incomingCall };
  let markup = '';
  if (panel === 'how' || panel === 'rules') markup = view.instructions(panel === 'how');
  if (panel === 'docs' && item) markup = view.documents(item, viewedDocument(), compare, step, work, previousInspection(item));
  if (panel === 'sample' && item) markup = view.sample(item, inspection, step, work);
  if (panel === 'archive' && run) {
    markup = view.archivePanel(archive(run, archiveQuery), filedSupportingPapers(archiveQuery), archiveFocus, pinned,
      archiveQuery, archiveEditing, run.phase === 'handoff', run.phase === 'ending', {
        returnTo: archiveReturn?.panel,
        canComparePrevious: !archiveReturn && run.phase === 'case' && item && getPreviousReceipt(run, item)?.record.id === archiveFocus,
        correctionFindings: archiveEditing ? selectedCorrectionFindings(correctableRow(archiveFocus), correctionDraft?.keys) : [],
      });
  }
  if (panel === 'phone' && run) {
    const filed = archive(run);
    const papers = pinned.map((id) => filed.find((row) => row.id === id)).filter(Boolean);
    markup = view.phone(phoneNumber, run.phone, papers, run.day >= 1, run.flags.phoneBack, item, {
      returnTo: phoneReturn?.panel,
      incomingCall,
    });
  }
  if (panel === 'handoff' && run?.phase === 'handoff') {
    const records = archive(run).filter(({ record, latestReceipt }) => record && !latestReceipt).map(({ record }) => record);
    markup = view.handoffPanel(run, EVIDENCE, records);
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
  if (!markup && !arrival && run?.phase === 'receipt' && !activeVisit()) markup = view.receipt(run.records.at(-1));

  const focused = document.activeElement;
  const hadModal = Boolean(modalLayer.firstElementChild);
  const focusedData = focused instanceof HTMLElement && modalLayer.contains(focused) ? { ...focused.dataset } : null;
  const previousSurface = modalLayer.querySelector('[data-desk-surface]');
  const previousContent = previousSurface?.querySelector('.desk-surface-content');
  const scroll = previousContent ? [previousContent.scrollLeft, previousContent.scrollTop] : null;
  const previousReference = previousSurface?.querySelector('.sample-reference');
  const previousPaper = previousSurface?.querySelector('.return-previous');
  const archiveIndexScroll = previousSurface?.querySelector('.drawer-list')?.scrollTop;
  const phoneScroll = modalLayer.querySelector('.phone-modal .modal-body')?.scrollTop;
  const handoffScroll = modalLayer.querySelector('.handoff-modal .modal-body')?.scrollTop;
  modalLayer.innerHTML = markup;
  const surface = modalLayer.querySelector('[data-desk-surface]');
  if (phoneScroll !== undefined) modalLayer.querySelector('.phone-modal .modal-body')?.scrollTo(0, phoneScroll);
  if (handoffScroll !== undefined) modalLayer.querySelector('.handoff-modal .modal-body')?.scrollTo(0, handoffScroll);
  const blockingDialog = Boolean(markup && !surface);
  booth.inert = blockingDialog || !run || Boolean(arrivalTimer || screenLayer.firstElementChild);
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
    animateOnDesk(object, [{ translate: '0 1.3rem', rotate: '-1.4deg', opacity: .56 }, { translate: '0 0', rotate: '0deg', opacity: 1 }], 235);
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
  toastTimer = setTimeout(() => { toastBox.textContent = ''; }, 2350);
}

function workspaceContext() {
  const item = windowCase();
  if (!item || run.phase !== 'case') return undefined;
  const previous = previousInspection(item);
  return {
    prior: previous ? { id: previous.record.id, documentCount: previous.documents.length } : null,
    guided: Boolean(tutorialStep()),
  };
}

function workspaceBody() {
  if (panel === 'docs') return modalLayer.querySelector('.documents-surface .desk-surface-content');
  if (panel === 'sample') return modalLayer.querySelector('.sample-surface .desk-surface-content');
  if (panel === 'phone') return modalLayer.querySelector('.phone-modal .modal-body');
  if (panel === 'archive' && interaction.archiveEditing) return modalLayer.querySelector('.archive-surface .desk-surface-content');
  return null;
}

function persistRun() {
  if (!run || reviewingHistory) return;
  captureCorrectionScroll();
  const body = workspaceBody();
  const archivedPhone = panel === 'archive' && archiveReturn?.panel === 'phone';
  const context = body || archivedPhone ? workspaceContext() : undefined;
  const workspacePanel = archivedPhone ? 'phone' : panel;
  const workspace = context ? {
    ...context, panel: workspacePanel, scrollTop: body?.scrollTop ?? archiveReturn?.scrollTop ?? 0,
    returnTo: workspacePanel === 'phone' ? phoneReturn : undefined,
  } : undefined;
  saved = {
    ...run,
    ...(arrival ? { arrivalAction: arrival.action } : {}),
    ...(run.phase === 'handoff' && correctionDraft ? { correctionDraft } : {}),
    inspectionProgress: captureInspectionProgress(getCase(run), interaction, workspace),
  };
  writeStorage(SAVE_KEY, saved);
}

function persistWorkspaceScroll() {
  clearTimeout(workspaceScrollTimer);
  const body = workspaceBody();
  const workspace = saved?.inspectionProgress?.workspace;
  const scrollTop = panel === 'archive' ? saved?.correctionDraft?.scrollTop : workspace?.panel === panel ? workspace.scrollTop : undefined;
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
  if (name === 'phone' && (panel === 'docs' || panel === 'sample')) {
    const body = workspaceBody();
    phoneReturn = { panel, opener: { ...opener.dataset }, scrollTop: body?.scrollTop ?? 0, scrollLeft: body?.scrollLeft ?? 0 };
  } else if (panel === 'phone' && name !== 'archive' && name !== 'phone') {
    update({ type: 'hang-up' }, false);
    phoneReturn = null;
  }
  if (name === 'archive' && (panel === 'phone' || panel === 'handoff')) {
    archiveReturn = { panel, opener: { ...opener.dataset }, scrollTop: modalLayer.querySelector('.modal-body')?.scrollTop ?? 0 };
  } else if (name !== 'archive' || panel !== 'archive') {
    archiveReturn = null;
  }
  panel = name;
  render();
}

function enter(restore) {
  cancelArrivalPause();
  reviewingHistory = false;
  let workspace;
  let arrivalAction;
  let savedCorrection;
  if (restore && saved) {
    const { inspectionProgress, arrivalAction: savedArrival, correctionDraft: draft, ...savedRun } = saved;
    arrivalAction = savedArrival;
    savedCorrection = draft;
    run = restoreRun(savedRun);
    const restored = restoreInspectionProgress(inspectionProgress, getCase(run), run.seen, workspaceContext());
    ({ workspace, ...interaction } = restored);
  } else {
    const lastCompleted = saved?.phase === 'ending' ? saved : completedShifts.values().next().value;
    run = endings.length ? createFollowingRun(lastCompleted) : createRun();
    interaction = freshInteraction();
  }
  panel = workspace?.panel ?? null;
  phoneReturn = workspace?.returnTo ? { ...workspace.returnTo, opener: { act: 'phone' } } : null;
  if (panel !== 'phone') run = dispatch(run, { type: 'hang-up' });
  modalOpener = panel === 'docs' ? { act: 'doc', i: String(viewedDocument()) }
    : panel ? { act: panel, fixture: panel } : null;
  archiveReturn = null;
  correctionDraft = restoreCorrectionDraft(savedCorrection);
  const next = windowAdvance(arrivalAction);
  if (needsArrival(next)) {
    panel = null;
    pauseBeforeArrival(arrivalAction, next, true, true);
    return;
  }
  if (correctionDraft && !activeVisit()) {
    panel = 'archive';
    focusArchiveRow(correctionDraft.id);
    modalOpener = { act: correctionDraft.fromBoard ? 'handoff' : 'archive' };
    if (correctionDraft.fromBoard) {
      archiveReturn = { panel: 'handoff', opener: { act: 'archive-receipt', i: String(correctionDraft.id) }, scrollTop: 0 };
    }
    playSound('paper');
    render(correctionDraft.scrollTop);
    return;
  }
  const resumeSound = { docs: 'paper', sample: 'slide', phone: 'click' }[panel];
  playSound(resumeSound ?? (run.phase === 'ending' ? 'paper' : 'shutter'));
  render(workspace?.scrollTop);
}

function reviewCompletedShift(id) {
  const completed = completedShifts.get(id);
  if (run || panel !== 'completed-shifts' || !completed) return;
  cancelArrivalPause();
  run = completed;
  reviewingHistory = true;
  interaction = freshInteraction();
  panel = null;
  modalOpener = null;
  archiveReturn = null;
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

function focusNextWindowAction() {
  requestAnimationFrame(() => {
    if (document.activeElement !== document.body) return;
    const target = desktop.querySelector('[data-act="event-next"]')
      ?? screenLayer.querySelector('.primary')
      ?? desktop.querySelector('.paper-card');
    target?.focus({ preventScroll: true });
  });
}

function windowAction(value) {
  if (value === 'next' || value === 'ack-visit') return { type: value };
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
    interaction.archiveEditing = false;
    if (visit.kind === 'recall') {
      const confirmed = run.records.find(({ id }) => id === visit.caseId)?.status === 'recalled';
      panel = 'handoff';
      modalOpener = { act: 'handoff' };
      if (!confirmed) toast('这份回执需要再核对');
    } else toast('留底已收入交接簿');
  }
  render();
  if (visit?.kind === 'recall') {
    focusControl(modalLayer, { act: 'archive-receipt', i: String(visit.caseId) })?.scrollIntoView({ block: 'nearest' });
    return;
  }
  if (restoreFocus) focusNextWindowAction();
}

function pauseBeforeArrival(action, next, restoreFocus, resumed = false) {
  modalOpener = null;
  const npc = visitorAt(next);
  arrival = {
    action, next, stage: 'waiting', keepVisitor: !resumed && npc !== null && npc === visitorAt(run),
    approach: arrivalApproach(next),
  };
  const duration = action === 'ack-visit' ? VISIT_HANDOVER_MS : ARRIVAL_PAUSE_MS;
  arrivalTimer = setTimeout(() => {
    arrival.stage = 'approach';
    arrivalTimer = setTimeout(() => {
      cancelArrivalPause();
      finishWindowAdvance(action, restoreFocus);
    }, ARRIVAL_APPROACH_MS);
    playSound('slide');
    render();
  }, duration - ARRIVAL_APPROACH_MS);
  render();
}

function advanceSignature() {
  if (!interaction.orderSeen || !interaction.signed) return;
  const advanced = update({ type: 'tutorial', key: 'signature' }, false);
  if (advanced && interaction.inspection.tug) update({ type: 'tutorial', key: 'sample' }, false);
}

function readDocument(doc) {
  if (doc?.type === 'label' || doc?.type === 'report') update({ type: 'tutorial', key: doc.type }, false);
  if (doc?.type === 'order' && tutorialStep()?.key === 'signature') interaction.orderSeen = true;
  advanceSignature();
}

function chooseDoc(index, opener) {
  const doc = run?.phase === 'case' && windowCase()?.documents[index];
  if (!doc) return;
  if (panel === 'sample' && !tutorialStep()) {
    interaction.referenceDoc = index;
    playSound('paper');
    render();
    return;
  }
  if (panel === 'docs' && interaction.previousDoc !== null) {
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

function checkBasis(index, field) {
  if (run?.phase !== 'case' || (panel !== 'docs' && panel !== 'sample')) return;
  const doc = windowCase()?.documents[index];
  const datum = doc?.fields[field];
  if (!datum) return;
  const [label] = datum;
  const finding = paperFieldFinding(doc, index, field);
  const { key } = finding;
  const selected = interaction.findings.some((finding) => finding.key === key);
  updateFindings(selected
    ? interaction.findings.filter((finding) => finding.key !== key)
    : [...interaction.findings, finding]);
  if (label.includes('签发') && tutorialStep()?.key === 'signature') {
    interaction.signed = true;
    advanceSignature();
  }
  playSound('click');
  toast(`${selected ? '已移除' : '已记下'} · ${label}`);
  render();
}

function paperFieldFinding(doc, index, field) {
  const [label, value] = doc.fields[field];
  return { key: `doc:${index}:${field}`, source: doc.title, text: `${label} · ${value}` };
}

function correctableRow(id) {
  return run?.phase === 'handoff' ? archive(run).find((row) => row.id === id && row.record && !row.latestReceipt) : null;
}

function selectedCorrectionFindings(row, keys = []) {
  if (!row) return [];
  const available = [
    ...row.documents.flatMap((doc, index) => doc.fields.map((_, field) => paperFieldFinding(doc, index, field))),
    ...readFindings(row.record).filter(({ key }) => key.startsWith('sample:')),
  ];
  const byKey = new Map(available.map((finding) => [finding.key, finding]));
  return [...new Set(keys)].flatMap((key) => byKey.has(key) ? [byKey.get(key)] : []);
}

function restoreCorrectionDraft(draft) {
  const row = correctableRow(draft?.id);
  if (!row) return null;
  return {
    id: row.id,
    keys: selectedCorrectionFindings(row, Array.isArray(draft.keys) ? draft.keys : []).map(({ key }) => key),
    fromBoard: draft.fromBoard === true,
    scrollTop: Number.isFinite(draft.scrollTop) ? Math.max(0, draft.scrollTop) : 0,
  };
}

function captureCorrectionScroll() {
  if (panel !== 'archive' || !interaction.archiveEditing || correctionDraft?.id !== interaction.archiveFocus) return;
  correctionDraft.scrollTop = workspaceBody()?.scrollTop ?? 0;
  correctionDraft.fromBoard = archiveReturn?.panel === 'handoff';
}

function focusArchiveRow(id) {
  captureCorrectionScroll();
  interaction.archiveFocus = id;
  interaction.archiveEditing = correctionDraft?.id === id && Boolean(correctableRow(id));
}

function editCorrectionFinding(key, { remove = false, field } = {}) {
  if (!interaction.archiveEditing || panel !== 'archive' || correctionDraft?.id !== interaction.archiveFocus) return;
  const row = correctableRow(correctionDraft.id);
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

function compareDocs() {
  const item = getCase(run);
  if (!item || item.documents.length < 2) return;
  const index = interaction.doc;
  const type = item.documents[index].type;
  const preferredType = type === 'report' ? (tutorialStep()?.key === 'signature' ? 'order' : 'label') : 'report';
  const preferred = item.documents.findIndex((doc, id) => id !== index && doc.type === preferredType);
  interaction.compare = interaction.compare === null ? (preferred >= 0 ? preferred : (index + 1) % item.documents.length) : null;
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

function comparePrevious(opener) {
  const item = windowCase();
  const previous = previousInspection(item);
  if (!previous?.documents.length) return;
  if (panel !== 'docs' && (panel !== 'archive' || archiveReturn || interaction.archiveFocus !== previous.record.id)) return;
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

function sampleFinding(spec, inspection) {
  if (inspection.measured && spec.reading) {
    return { key: 'sample:measure', source: '量规实测', text: spec.reading };
  }
  const { back, tug, film, unpacked } = inspection;
  if (spec.kind === 'yellow' && !unpacked) {
    return { key: 'sample:package', source: '外包装', text: sampleObservation(spec, inspection) };
  }
  const operation = back ? (tug ? '轻拉检查' : '背面') : film ? '揭膜后' : unpacked ? '拆袋后' : '正面';
  return {
    key: `sample:${operation}`,
    source: `${sampleAppearance(spec).name} · ${operation}`,
    text: sampleObservation(spec, inspection),
  };
}

function checkSample(act) {
  if (panel !== 'sample' || run?.phase !== 'case') return;
  const sample = interaction.inspection;
  const spec = windowCase()?.sample;
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
    case 'sample-film': sample.film = !sample.film; break;
    case 'sample-clasp':
      if (!sample.back || sample.clasp || !sampleAppearance(spec).clasp) return;
      sample.clasp = true;
      sound = 'clasp';
      break;
    case 'sample-tug':
      if (!sample.back || !sample.clasp || sample.tug || !sampleAppearance(spec).clasp) return;
      sample.tug = true;
      sound = ['loose', 'broken'].includes(spec.kind) ? 'claspRelease' : 'tug';
      update({ type: 'tutorial', key: 'sample' }, false);
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
      const finding = sampleFinding(spec, sample);
      updateFindings([...interaction.findings.filter(({ key }) => key !== finding.key), finding]);
      if (!packed && interaction.referenceDoc === null && !interaction.returnToDocs) panel = null;
      toast('已记下检样结果');
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
  if (arrivalTimer || activeVisit() || run?.phase !== 'case') return;
  if (panel) {
    if (['docs', 'sample', 'archive'].includes(panel)) toast('先回到台面，再用开单机盖章');
    return;
  }
  if (update({ type: 'stamp', value, note: interaction.note, findings: interaction.findings }, false)) {
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
  update({ type: 'dial', number, caseIds: interaction.pinned });
  modalLayer.querySelector('.phone-log')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  if (run.phase === 'handoff' && activeVisit()) toast('有人到窗口递留底');
}

function openPhone(opener) {
  if (!run || reviewingHistory) return;
  if (incomingAtWindow()) update({ type: 'answer-call' }, false);
  playSound('click');
  openPanel('phone', opener);
}

function setPhoneNumber(value) {
  interaction.phoneNumber = value;
  renderModal();
  persistRun();
}

function openArchive(opener) {
  interaction.archiveFocus ??= archive(run).at(-1)?.id ?? null;
  interaction.archiveEditing = correctionDraft?.id === interaction.archiveFocus && Boolean(correctableRow(interaction.archiveFocus));
  playSound('paper');
  openPanel('archive', opener);
}

function revealArchiveReceipt(revealIndex) {
  if (revealIndex) {
    modalLayer.querySelector('.drawer-list [aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  modalLayer.querySelector('.archive-surface .desk-surface-content')?.scrollTo(0, interaction.archiveEditing ? correctionDraft?.scrollTop ?? 0 : 0);
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
  archiveReturn = null;
  render(previousPanel?.scrollTop);
  if (previousPanel) {
    const body = workspaceBody();
    if (body) body.scrollLeft = previousPanel.scrollLeft ?? 0;
    else modalLayer.querySelector('.modal-body')?.scrollTo(0, previousPanel.scrollTop);
    const opener = focusControl(modalLayer, previousPanel.opener);
    if (previousPanel.panel === 'handoff') opener?.scrollIntoView({ block: 'nearest' });
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
      run = null;
      reviewingHistory = false;
      phoneReturn = null;
      resetGaze();
      closePanel();
      if (fromHistory) focusControl(screenLayer, { act: 'completed-shifts' });
      break;
    }
    case 'start-day': playSound('shutter'); update({ type: 'start-day' }); break;
    case 'advance-day': playSound('paper'); update({ type: 'advance-day' }); break;
    case 'next':
    case 'event-next':
    case 'receive-recall': {
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
    case 'compare': compareDocs(); break;
    case 'compare-all': spreadDocuments(); break;
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
    case 'archive-receipt':
      if (!run?.seen.includes(index)) break;
      focusArchiveRow(index);
      interaction.archiveQuery = '';
      openArchive(target);
      revealArchiveReceipt(true);
      break;
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
      const pinned = interaction.pinned;
      const removing = pinned.includes(index);
      const displaced = !removing && pinned.length === 2 ? archive(run).find(({ id }) => id === pinned[0]) : null;
      interaction.pinned = removing ? pinned.filter((id) => id !== index) : [...pinned.slice(-1), index];
      if (displaced) toast(`新单据已放到电话旁，${displaced.batch} 已收回交接簿`);
      else toast(removing ? '单据已收回交接簿' : '单据已放到电话旁');
      playSound('paper');
      render();
      if (panel === 'phone' && !removing) {
        focusControl(modalLayer, { act: 'archive-receipt', i: String(index) })?.scrollIntoView({ block: 'nearest' });
      }
      break;
    }
    case 'edit-record': {
      const row = panel === 'archive' && correctableRow(interaction.archiveFocus);
      if (!row) break;
      interaction.archiveEditing = !interaction.archiveEditing;
      correctionDraft = interaction.archiveEditing ? { id: row.id, keys: [], fromBoard: false, scrollTop: 0 } : null;
      playSound('paper');
      render();
      break;
    }
    case 'correction-basis': editCorrectionFinding(`doc:${index}:${Number(target.dataset.field)}`, { field: target }); break;
    case 'correction-original': editCorrectionFinding(key); break;
    case 'correction-remove': editCorrectionFinding(key, { remove: true }); break;
    case 'recheck': {
      if (!interaction.archiveEditing || panel !== 'archive' || correctionDraft?.id !== interaction.archiveFocus) break;
      const row = correctableRow(correctionDraft.id);
      if (!row) break;
      const findings = selectedCorrectionFindings(row, correctionDraft.keys);
      if (update({ type: 'recheck', id: row.id, value: key, findings }, false)) {
        interaction.archiveEditing = false;
        correctionDraft = null;
        render();
        modalLayer.querySelector('.archive-surface .desk-surface-content')?.scrollTo(0, 0);
        playSound('stamp');
        const status = run.records.find(({ id }) => id === row.id)?.status;
        if (status !== 'recallPending') toast('更正已留底');
      }
      break;
    }
    case 'phone': openPhone(target); break;
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
    case 'egg': update({ type: 'explore', key }, false); interaction.egg = key; playSound('paper'); openPanel('egg', target); break;
    case 'handoff': openPanel('handoff', target); break;
    case 'attach': update({ type: 'attach', key, value: !run.flags[`${key}Attached`] }); playSound('paper'); break;
    case 'finish': panel = null; playSound('bell'); update({ type: 'finish' }); break;
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
      target.matches('[data-act="stamp"], [data-act="next"], [data-act="event-next"], .sample-hotspot[data-drag]')) {
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

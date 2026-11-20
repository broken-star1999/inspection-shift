import { createRun, dispatch, getCase, getDay, getEnding, archive, TUTORIAL, EVIDENCE } from './engine.js';
import { EASTER_EGGS } from './content.js';
import { sampleAppearance, sampleObservation } from './samples.js';
import { bindViewport, toggleFullscreen, stagePoint, playSound, isMuted, setMuted } from './devices.js';
import { captureDeskProjection } from './desk-projection.js';
import { freshInteraction, captureInspectionProgress, restoreInspectionProgress } from './inspection-progress.js';
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
const ARRIVAL_PAUSE_MS = 1150;

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

let saved = readStorage(SAVE_KEY);
if (!validSave(saved)) saved = null;
const collection = readStorage(COLLECTION_KEY);
let endings = Array.isArray(collection) ? collection.filter((key) => ['routine', 'trace', 'issue'].includes(key)) : [];
let run = null;
let panel = null;
let scenery;
let toastTimer;
let arrivalTimer = 0;
let drag;
let suppressPaperClick = false;
let modalOpener = null;
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
const modelHost = root.querySelector('.model-world');
const soundToggle = root.querySelector('[data-act="sound"]');
const fullscreenToggle = root.querySelector('[data-act="fullscreen"]');
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
    const rect = fixtureLayout[element.dataset.fixture];
    element.toggleAttribute('data-fixture-visible', Boolean(rect));
    if (!rect) continue;
    const { x, y, w, h } = rect;
    element.style.setProperty('--fixture-x', `${x.toFixed(1)}px`);
    element.style.setProperty('--fixture-y', `${y.toFixed(1)}px`);
    element.style.setProperty('--fixture-w', `${w.toFixed(1)}px`);
    element.style.setProperty('--fixture-h', `${h.toFixed(1)}px`);
  }
}

async function startScene() {
  const baseUrl = import.meta.env.BASE_URL;
  try {
    const { mountModeledBooth } = await import('./modeled-booth.js');
    scenery = mountModeledBooth(modelHost, { baseUrl, onLayout: (layout) => { fixtureLayout = layout; placeFixtures(); } });
    if (scenery) root.dataset.modeled = 'true';
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
  if (drag) { gaze.time = 0; return; }
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
  if (!gaze.frame && !drag) gaze.frame = requestAnimationFrame(followGaze);
}

root.addEventListener('pointerdown', (event) => {
  if (event.pointerType !== 'mouse' && !drag) resetGaze();
}, { capture: true });

root.addEventListener('pointermove', (event) => {
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

function activeVisit() {
  return run?.events ? (run.events[0] ?? null) : (run?.event ?? null);
}

function windowCase() {
  return run && !arrivalTimer && !activeVisit() ? getCase(run) : null;
}

function filedVisitPapers(query) {
  const term = query.trim().toLowerCase();
  return Object.entries(EVIDENCE).filter(([key, doc]) => {
    if (!run.flags[`${key}Document`]) return false;
    return !term || [doc.title, ...doc.fields.flat(), doc.note].some((text) => text?.toLowerCase().includes(term));
  });
}

function heldObjects() {
  return {
    heldDocuments: panel === 'docs' ? [interaction.doc, interaction.compare] : [],
    sampleHeld: panel === 'sample',
  };
}

function setScene() {
  const visit = arrivalTimer ? null : activeVisit();
  const phase = arrivalTimer ? 'waiting' : (run?.phase ?? 'home');
  const item = windowCase();
  const npc = visit?.npc ?? (['brief', 'handoff', 'ending'].includes(phase) ? 'zhou' : item?.npc);
  const appearance = item ? sampleAppearance(item.sample) : null;
  const side = interaction.inspection.back ? '-back' : '';
  scenery?.setFrame({ day: run?.day ?? 0, phase, npc: npc || null,
    documents: item?.documents.map((doc) => ({ type: doc.type, title: doc.title, batch: doc.fields[0]?.[1] ?? item.batch })) ?? [],
    sample: appearance ? { ...interaction.inspection, filename: `${appearance.stem}${side}.webp`, kind: item.sample.kind } : null,
    positions: interaction.positions, pencil: showPencil(item), ...heldObjects() });
}

function render() {
  persistRun();
  root.dataset.phase = arrivalTimer ? 'waiting' : (run?.phase ?? 'home');
  const waitMessage = arrivalTimer ? '等下一位…' : '';
  if (arrivalStatus.textContent !== waitMessage) arrivalStatus.textContent = waitMessage;
  status.innerHTML = run ? `<span>${getDay(run).title}</span><span>第 ${run.day + 1} 天 / 5</span>` : '<span>质检员的一天</span>';
  wallShift.innerHTML = run ? view.wallShift(run) : '';
  soundToggle.setAttribute('aria-pressed', String(!isMuted()));
  soundToggle.setAttribute('aria-label', isMuted() ? '开启音效' : '关闭音效');
  const item = windowCase();
  const step = item ? tutorialStep() : null;
  const visit = arrivalTimer ? null : activeVisit();
  const teaching = item?.id === 2 && !interaction.inspection.film ? '先对箱签和报告。检查镜片时，可以掀开检样的膜角。' : '';
  hud.innerHTML = run && !arrivalTimer ? view.room(run, item, step, teaching, item?.pressureLine, visit) : '';
  desktop.innerHTML = item ? view.desk(run, item, step, { ...interaction, pencil: showPencil(item), ...heldObjects() }) : '';
  fixtureElements = [...booth.querySelectorAll('[data-fixture]')];
  if (root.dataset.modeled === 'true') placeFixtures();
  screenLayer.innerHTML = run
    ? (arrivalTimer || visit ? '' : view.overlay(run, run.phase === 'ending' ? getEnding(run) : null))
    : view.home(saved?.phase === 'ending' ? null : saved, endings);
  setScene();
  renderModal(item, step);
}

function renderModal(item = windowCase(), step = item ? tutorialStep() : null) {
  const { doc, compare, inspection, archiveFocus, archiveQuery, archiveEditing, pinned, phoneNumber, egg } = interaction;
  let markup = '';
  if (panel === 'how' || panel === 'rules') markup = view.instructions(panel === 'how');
  if (panel === 'docs' && item) markup = view.documents(item, doc, compare, step, interaction);
  if (panel === 'sample' && item) markup = view.sample(item, inspection, step, interaction);
  if (panel === 'archive' && run) markup = view.archivePanel(archive(run, archiveQuery), filedVisitPapers(archiveQuery), archiveFocus, pinned, archiveQuery, archiveEditing, run.phase === 'handoff');
  if (panel === 'phone' && run) markup = view.phone(phoneNumber, run.phone, archive(run).filter(({ id }) => pinned.includes(id)), run.day >= 1, run.flags.phoneBack);
  if (panel === 'handoff' && run?.phase === 'handoff') markup = view.handoffPanel(run, EVIDENCE);
  if (panel === 'egg' && EASTER_EGGS[egg]) markup = view.egg(egg, item?.id);
  if (panel === 'restart') markup = view.dialog('重新接班', `<p>开一周新的班会覆盖当前值班存档。</p><div class="modal-actions">${view.button('回到上周', 'close')}${view.button('开始新一周', 'start', 'primary')}</div>`);
  if (!markup && run?.phase === 'receipt' && !activeVisit()) markup = view.receipt(run.records.at(-1));

  const focused = document.activeElement;
  const hadModal = Boolean(modalLayer.firstElementChild);
  const focusedData = focused instanceof HTMLElement && modalLayer.contains(focused) ? { ...focused.dataset } : null;
  const previousSurface = modalLayer.querySelector('[data-desk-surface]');
  const previousContent = previousSurface?.querySelector('.desk-surface-content');
  const scroll = previousContent ? [previousContent.scrollLeft, previousContent.scrollTop] : null;
  const archiveIndexScroll = previousSurface?.querySelector('.drawer-list')?.scrollTop;
  modalLayer.innerHTML = markup;
  const surface = modalLayer.querySelector('[data-desk-surface]');
  const blockingDialog = Boolean(markup && !surface);
  booth.inert = blockingDialog || !run || Boolean(arrivalTimer || screenLayer.firstElementChild);
  screenLayer.inert = Boolean(markup);
  if (!markup) {
    if (hadModal && modalOpener) {
      const matching = [...root.querySelectorAll('button:not([disabled])')].find((element) =>
        Object.entries(modalOpener).every(([key, value]) => element.dataset[key] === value));
      matching?.focus({ preventScroll: true });
      modalOpener = null;
    }
    return;
  }
  const focusables = [...modalLayer.querySelectorAll('button:not([disabled]), input')];
  const restored = focusedData?.act && focusables.find((element) => Object.entries(focusedData).every(([key, value]) => element.dataset[key] === value));
  const firstAction = focusables.find((element) => element instanceof HTMLButtonElement &&
    element.dataset.act && !['close', 'toggle-findings', 'remove-finding'].includes(element.dataset.act));
  (restored || firstAction || focusables[0])?.focus({ preventScroll: true });
  if (surface && surface.dataset.deskSurface !== previousSurface?.dataset.deskSurface) {
    const object = surface.querySelector('.sheet, .sample-stage .sample-object, .receipt-slip');
    animateOnDesk(object, [{ translate: '0 1.3rem', rotate: '-1.4deg', opacity: .56 }, { translate: '0 0', rotate: '0deg', opacity: 1 }], 235);
  } else if (surface && surface.dataset.surfacePage !== previousSurface?.dataset.surfacePage) {
    const sheet = surface.querySelector('.doc-grid.pair .sheet:last-child, .doc-grid:not(.pair) .sheet');
    animateOnDesk(sheet, [{ translate: '.85rem .3rem', opacity: .65 }, { translate: '0 0', opacity: 1 }], 180);
  } else if (surface && scroll) {
    const content = surface.querySelector('.desk-surface-content');
    [content.scrollLeft, content.scrollTop] = scroll;
    if (archiveIndexScroll !== undefined) surface.querySelector('.drawer-list').scrollTop = archiveIndexScroll;
  }
}

function toast(message) {
  clearTimeout(toastTimer);
  toastBox.textContent = message;
  toastTimer = setTimeout(() => { toastBox.textContent = ''; }, 2350);
}

function persistRun() {
  if (!run) return;
  saved = { ...run, inspectionProgress: captureInspectionProgress(getCase(run), interaction) };
  writeStorage(SAVE_KEY, saved);
}

function update(action, redraw = true) {
  if (!run) return false;
  const before = run;
  run = dispatch(run, action);
  if (run !== before) {
    if (getCase(before)?.id !== getCase(run)?.id) interaction = freshInteraction(interaction);
    if (run.phase === 'ending') {
      const id = getEnding(run).id;
      if (!endings.includes(id)) endings = [...endings, id];
      writeStorage(COLLECTION_KEY, endings);
    }
  }
  if (redraw) render();
  return run !== before;
}

function openPanel(name, opener) {
  if (!panel && opener instanceof HTMLElement) modalOpener = { ...opener.dataset };
  panel = name;
  render();
}

function enter(restore) {
  cancelArrivalPause();
  if (restore && saved) {
    const { inspectionProgress, ...savedRun } = saved;
    run = savedRun;
    interaction = restoreInspectionProgress(inspectionProgress, getCase(run), run.seen);
  } else {
    run = createRun();
    interaction = freshInteraction();
  }
  panel = null;
  modalOpener = null;
  playSound('shutter');
  render();
}

function cancelArrivalPause() {
  clearTimeout(arrivalTimer);
  arrivalTimer = 0;
}

function focusNextWindowAction() {
  requestAnimationFrame(() => {
    if (document.activeElement !== document.body) return;
    const target = hud.querySelector('[data-act="event-next"]')
      ?? screenLayer.querySelector('.primary')
      ?? desktop.querySelector('.paper-card');
    target?.focus({ preventScroll: true });
  });
}

function pauseBeforeArrival(restoreFocus) {
  modalOpener = null;
  arrivalTimer = setTimeout(() => {
    arrivalTimer = 0;
    playSound('bell');
    render();
    if (restoreFocus) focusNextWindowAction();
  }, ARRIVAL_PAUSE_MS);
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
  const doc = getCase(run)?.documents[index];
  if (!doc) return;
  if (panel === 'docs' && interaction.compare !== null) {
    if (index !== interaction.doc) interaction.compare = index;
  } else {
    interaction.doc = index;
    interaction.compare = null;
  }
  readDocument(doc);
  playSound('paper');
  openPanel('docs', opener);
}

function updateFindings(findings) {
  interaction.findings = findings;
  interaction.note = findings.at(-1)?.text ?? '';
  if (!findings.length) interaction.showFindings = false;
}

function checkBasis(index, field) {
  const doc = getCase(run)?.documents[index];
  const datum = doc?.fields[field];
  if (!datum) return;
  const [label, value] = datum;
  const key = `doc:${index}:${field}`;
  const selected = interaction.findings.some((finding) => finding.key === key);
  updateFindings(selected
    ? interaction.findings.filter((finding) => finding.key !== key)
    : [...interaction.findings, { key, source: doc.title, text: `${label} · ${value}` }]);
  if (label.includes('签发') && tutorialStep()?.key === 'signature') {
    interaction.signed = true;
    advanceSignature();
  }
  playSound('click');
  toast(`${selected ? '已移除' : '已记下'} · ${label}`);
  render();
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

function sampleFinding(spec, inspection) {
  if (inspection.measured && spec.reading) {
    return { key: 'sample:measure', source: '量规实测', text: spec.reading };
  }
  const { back, tug, film, unpacked } = inspection;
  const operation = back ? (tug ? '轻拉检查' : '背面') : film ? '揭膜后' : unpacked ? '拆袋后' : '正面';
  return {
    key: `sample:${operation}`,
    source: `${sampleAppearance(spec).name} · ${operation}`,
    text: sampleObservation(spec, inspection),
  };
}

function checkSample(act) {
  const sample = interaction.inspection;
  const spec = getCase(run)?.sample;
  if (!spec) return;
  const previousFilm = act === 'sample-film' && modalLayer.querySelector('.sample-film-sheet');
  const previousFold = previousFilm ? getComputedStyle(previousFilm).transform : null;
  switch (act) {
    case 'sample-flip': sample.back = !sample.back; break;
    case 'sample-film': sample.film = !sample.film; break;
    case 'sample-clasp': sample.clasp = true; break;
    case 'sample-tug': sample.tug = true; update({ type: 'tutorial', key: 'sample' }, false); break;
    case 'sample-measure': sample.measured = !sample.measured; break;
    case 'sample-unpack': sample.unpacked = true; break;
    case 'sample-basis': {
      const finding = sampleFinding(spec, sample);
      updateFindings([...interaction.findings.filter(({ key }) => key !== finding.key), finding]);
      panel = null;
      toast('已记下检样结果');
      break;
    }
  }
  playSound(act === 'sample-clasp' || act === 'sample-tug' ? 'click' : 'slide');
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
  if (arrivalTimer || (panel && !['docs', 'sample', 'archive'].includes(panel)) || activeVisit() || run?.phase !== 'case') return;
  if (update({ type: 'stamp', value, note: interaction.note, findings: interaction.findings }, false)) {
    panel = null;
    clearTimeout(toastTimer);
    toastBox.textContent = '';
    playSound('stamp');
    render();
    scenery?.setPressed?.(value);
  } else toast('先跟老周把这箱查完');
}

function dial() {
  if (!interaction.phoneNumber) return;
  playSound('ring');
  const number = interaction.phoneNumber;
  update({ type: 'dial', number, caseIds: interaction.pinned });
  if (run.phase === 'handoff' && activeVisit()) toast('有人到窗口递留底');
}

function setPhoneNumber(value) {
  interaction.phoneNumber = value;
  persistRun();
  renderModal();
}

function openArchive(opener) {
  interaction.archiveFocus ??= archive(run).at(-1)?.id ?? null;
  interaction.archiveEditing = false;
  playSound('paper');
  openPanel('archive', opener);
}

function closePanel() {
  panel = null;
  render();
}

root.addEventListener('click', (event) => {
  const target = event.target.closest('[data-act]');
  if (!target || target.matches(':disabled')) return;
  const { act, key } = target.dataset;
  const index = Number(target.dataset.i);
  if (act === 'doc' && suppressPaperClick) return;
  if (act.startsWith('sample-')) { checkSample(act); return; }
  switch (act) {
    case 'how': case 'rules': openPanel(act, target); break;
    case 'sound': setMuted(!isMuted()); playSound('click'); render(); break;
    case 'fullscreen': void toggleFullscreen(root); break;
    case 'new': if (saved && saved.phase !== 'ending') openPanel('restart', target); else enter(false); break;
    case 'start': enter(false); break;
    case 'resume': enter(true); break;
    case 'home': cancelArrivalPause(); run = null; resetGaze(); closePanel(); break;
    case 'start-day': playSound('shutter'); update({ type: 'start-day' }); break;
    case 'advance-day': playSound('paper'); update({ type: 'advance-day' }); break;
    case 'next': {
      if (arrivalTimer || !update({ type: 'next' }, false)) break;
      panel = null;
      if (run.phase === 'case' || activeVisit()) pauseBeforeArrival(event.detail === 0);
      else {
        playSound('bell');
        render();
        if (event.detail === 0) focusNextWindowAction();
      }
      break;
    }
    case 'event-next': {
      const visit = activeVisit();
      if (arrivalTimer || !visit || !update({ type: 'ack-visit' }, false)) break;
      interaction.archiveFocus = visit.key;
      interaction.archiveQuery = '';
      interaction.archiveEditing = false;
      panel = null;
      playSound('paper');
      toast('留底已收入交接簿');
      if (run.phase === 'case' || activeVisit()) pauseBeforeArrival(event.detail === 0);
      else {
        render();
        if (event.detail === 0) focusNextWindowAction();
      }
      break;
    }
    case 'doc': if (run) chooseDoc(index, target); break;
    case 'basis': checkBasis(index, Number(target.dataset.field)); break;
    case 'toggle-findings':
      interaction.showFindings = !interaction.showFindings;
      render();
      if (interaction.showFindings) modalLayer.querySelector('#working-findings')?.scrollIntoView({ block: 'nearest' });
      break;
    case 'remove-finding':
      updateFindings(interaction.findings.filter((finding) => finding.key !== key));
      playSound('paper');
      render();
      break;
    case 'compare': compareDocs(); break;
    case 'sample': playSound('slide'); openPanel('sample', target); break;
    case 'stamp': stamp(key); break;
    case 'archive': if (run) openArchive(target); break;
    case 'archive-focus': case 'archive-followup': case 'archive-evidence':
      interaction.archiveFocus = act === 'archive-evidence' ? key : index;
      if (act === 'archive-followup' && !archive(run, interaction.archiveQuery).some((row) => row.id === index)) {
        interaction.archiveQuery = '';
      }
      interaction.archiveEditing = false;
      playSound('paper');
      render();
      if (act === 'archive-followup') modalLayer.querySelector('.drawer-list [aria-pressed="true"]')?.scrollIntoView({ block: 'nearest' });
      modalLayer.querySelector('.archive-surface .desk-surface-content')?.scrollTo(0, 0);
      break;
    case 'archive-pin': {
      const pinned = interaction.pinned;
      interaction.pinned = pinned.includes(index) ? pinned.filter((id) => id !== index) : [...pinned.slice(-1), index];
      toast(interaction.pinned.includes(index) ? '单据已放到电话旁' : '单据已收回交接簿');
      playSound('paper');
      render();
      break;
    }
    case 'edit-record': interaction.archiveEditing = !interaction.archiveEditing; render(); break;
    case 'recheck': {
      interaction.archiveEditing = false;
      if (update({ type: 'recheck', id: interaction.archiveFocus, value: key })) {
        modalLayer.querySelector('.archive-surface .desk-surface-content')?.scrollTo(0, 0);
        playSound('stamp');
        toast('更正已留底');
      }
      break;
    }
    case 'phone': playSound('click'); openPanel('phone', target); break;
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

let stampTouch = null;
root.addEventListener('touchstart', (event) => {
  const button = event.target.closest('[data-act="stamp"]');
  stampTouch = root.dataset.modeled === 'true' && button && !button.disabled && event.touches.length === 1
    ? event.touches[0]
    : null;
}, { passive: true });

root.addEventListener('touchend', (event) => {
  const start = stampTouch;
  stampTouch = null;
  const end = event.changedTouches[0];
  if (!start || !end || event.touches.length || start.identifier !== end.identifier) return;
  if (Math.hypot(start.clientX - end.clientX, start.clientY - end.clientY) > 12) return;
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
  interaction.archiveFocus = archive(run, interaction.archiveQuery).at(-1)?.id ?? filedVisitPapers(interaction.archiveQuery).at(-1)?.[0] ?? null;
  interaction.archiveEditing = false;
  render();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Tab' && modalLayer.querySelector('[aria-modal="true"]')) {
    const controls = [...modalLayer.querySelectorAll('button:not(:disabled), input:not(:disabled)')];
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  if (event.key === 'Escape' && panel) { event.preventDefault(); closePanel(); }
  if (!run || event.target instanceof HTMLInputElement || event.ctrlKey || event.metaKey || event.altKey) return;
  if (panel === 'phone' && /^\d$/.test(event.key) && interaction.phoneNumber.length < 5) {
    setPhoneNumber(interaction.phoneNumber + event.key);
  } else if (['1', '2', '3'].includes(event.key)) stamp(['pass', 'fail', 'review'][Number(event.key) - 1]);
});

desktop.addEventListener('pointerdown', (event) => {
  const paper = event.target.closest('[data-drag="paper"]');
  if (!paper || event.button !== 0 || run?.phase !== 'case') return;
  const index = Number(paper.dataset.i);
  const project = scenery?.captureDeskProjection?.() ?? captureDeskProjection(desktop) ?? ((x, y) => stagePoint(root, x, y));
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

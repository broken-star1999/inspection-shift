import { createRun, dispatch, getCase, getDay, getEnding, archive, TUTORIAL, EVIDENCE } from './engine.js';
import { EASTER_EGGS } from './content.js';
import { bindViewport, toggleFullscreen, stagePoint, playSound, isMuted, setMuted } from './devices.js';
import * as view from './view.js';
import './style.css';
import './devices.css';

const root = document.querySelector('#game');
const SAVE_KEY = 'nandu-inspection-save-v1';
const COLLECTION_KEY = 'nandu-inspection-endings-v1';

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
let eventIndex = 0;
let scenery;
let toastTimer;
let drag;
let suppressPaperClick = false;
let modalOpener = null;
let interaction = freshInteraction();

function freshInteraction() {
  return { note: '', positions: {}, doc: 0, compare: null, signed: false, orderSeen: false,
    inspection: { back: false, film: false, clasp: false, tug: false, measured: false },
    archiveFocus: null, archiveQuery: '', archiveEditing: false, pinned: [], phoneNumber: '', egg: null };
}

root.innerHTML = view.shell();
const status = root.querySelector('#top-status');
const hud = root.querySelector('#room-hud');
const desktop = root.querySelector('#desk');
const screenLayer = root.querySelector('#screen');
const modalLayer = root.querySelector('#modal');
const toastBox = root.querySelector('.game-toast');
const roomHost = root.querySelector('.canvas-room');
const soundToggle = root.querySelector('[data-act="sound"]');
const fullscreenToggle = root.querySelector('[data-act="fullscreen"]');

bindViewport(root, ({ fullscreen, immersive }) => {
  const expanded = fullscreen || immersive;
  fullscreenToggle.setAttribute('aria-pressed', String(expanded));
  fullscreenToggle.setAttribute('aria-label', expanded ? '退出全屏' : '全屏');
});

import('./scenery.js').then(({ mountScenery }) => {
  scenery = mountScenery(roomHost, { baseUrl: import.meta.env.BASE_URL });
  setScene();
}).catch(() => { roomHost.dataset.renderer = 'static'; });

function tutorialStep() {
  return run?.phase === 'case' && getCase(run)?.id === 1 ? TUTORIAL[run.tutorial] : null;
}

function setScene() {
  const event = run?.events?.[eventIndex];
  const phase = run?.phase ?? 'home';
  const npc = event?.npc ?? (['brief', 'handoff', 'ending'].includes(phase) ? 'zhou' : run && getCase(run)?.npc);
  scenery?.setFrame({ day: run?.day ?? 0, phase, npc: npc || null });
}

function render() {
  root.dataset.phase = run?.phase ?? 'home';
  status.innerHTML = run ? `<span>${getDay(run).title}</span><span>第 ${run.day + 1} 天 / 5</span>` : '<span>质检员的一天</span>';
  soundToggle.setAttribute('aria-pressed', String(!isMuted()));
  soundToggle.setAttribute('aria-label', isMuted() ? '开启音效' : '关闭音效');
  const item = run ? getCase(run) : null;
  const step = tutorialStep();
  const teaching = item?.id === 2 && !interaction.inspection.film ? '先对箱签和报告。检查镜片时，可以掀开检样的膜角。' : '';
  hud.innerHTML = run ? view.room(run, item, step, teaching, item?.pressureLine, eventIndex) : '';
  desktop.innerHTML = item ? view.desk(run, item, step, { ...interaction,
    pencil: item.id === 8 && run.flags.rollingPencil && !run.flags.pencil }) : '';
  const event = run?.events?.[eventIndex];
  screenLayer.innerHTML = run ? (event && !item ? view.visitOverlay(event) : view.overlay(run, run.phase === 'ending' ? getEnding(run) : null)) : view.home(saved?.phase === 'ending' ? null : saved, endings);
  setScene();
  renderModal(item, step);
}

function renderModal(item = run ? getCase(run) : null, step = tutorialStep()) {
  const { doc, compare, inspection, archiveFocus, archiveQuery, archiveEditing, pinned, phoneNumber, egg } = interaction;
  let markup = '';
  if (panel === 'how' || panel === 'rules') markup = view.instructions(panel === 'how');
  if (panel === 'docs' && item) markup = view.documents(item, doc, compare, step, interaction);
  if (panel === 'sample' && item) markup = view.sample(item, inspection, step);
  if (panel === 'archive' && run) markup = view.archivePanel(archive(run, archiveQuery), archiveFocus, pinned, archiveQuery, archiveEditing, run.phase === 'handoff');
  if (panel === 'phone' && run) markup = view.phone(phoneNumber, run.phone, archive(run).filter(({ id }) => pinned.includes(id)), run.day >= 1, run.flags.phoneBack);
  if (panel === 'handoff' && run?.phase === 'handoff') markup = view.handoffPanel(run, EVIDENCE);
  if (panel === 'egg' && EASTER_EGGS[egg]) markup = view.egg(egg, item?.id);
  if (panel === 'restart') markup = view.dialog('重新接班', `<p>开一周新的班会覆盖当前值班存档。</p><div class="modal-actions">${view.button('回到上周', 'close')}${view.button('开始新一周', 'start', 'primary')}</div>`);
  if (!markup && run?.phase === 'receipt' && !run.events?.[eventIndex]) markup = view.receipt(run.records.at(-1));

  const focused = document.activeElement;
  const hadModal = Boolean(modalLayer.firstElementChild);
  const focusedData = focused instanceof HTMLElement && modalLayer.contains(focused) ? { ...focused.dataset } : null;
  modalLayer.innerHTML = markup;
  for (const background of [hud, desktop, screenLayer]) background.inert = Boolean(markup);
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
  (restored || focusables.find((element) => element instanceof HTMLButtonElement && element.dataset.act && element.dataset.act !== 'close') || focusables[0])?.focus({ preventScroll: true });
}

function toast(message) {
  clearTimeout(toastTimer);
  toastBox.textContent = message;
  toastTimer = setTimeout(() => { toastBox.textContent = ''; }, 2350);
}

function update(action, redraw = true) {
  if (!run) return false;
  const before = run;
  run = dispatch(run, action);
  if (run !== before) {
    if (run.events !== before.events) eventIndex = 0;
    saved = run;
    writeStorage(SAVE_KEY, saved);
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
  run = restore && saved ? saved : createRun();
  saved = run;
  writeStorage(SAVE_KEY, saved);
  panel = null;
  interaction = freshInteraction();
  eventIndex = 0;
  playSound('shutter');
  render();
}

function chooseDoc(index, opener) {
  const target = getCase(run)?.documents[index];
  if (!target) return;
  if (interaction.doc !== index) interaction.compare = null;
  interaction.doc = index;
  if (target.type === 'order' && tutorialStep()?.key === 'signature') interaction.orderSeen = true;
  if (target.type === 'label' || target.type === 'report') update({ type: 'tutorial', key: target.type }, false);
  if (interaction.orderSeen && interaction.signed) update({ type: 'tutorial', key: 'signature' }, false);
  playSound('paper');
  openPanel('docs', opener);
}

function checkBasis(index, field) {
  const datum = getCase(run)?.documents[index]?.fields[field];
  if (!datum) return;
  const [key, value] = datum;
  interaction.note = `${key} · ${value}`;
  if (key.includes('签发') && tutorialStep()?.key === 'signature') {
    interaction.signed = true;
    if (interaction.orderSeen) update({ type: 'tutorial', key: 'signature' }, false);
  }
  playSound('click');
  toast(`已记下 · ${key}`);
  render();
}

function compareDocs() {
  const item = getCase(run);
  if (!item) return;
  const index = interaction.doc;
  const preferred = item.documents.findIndex(({ type }, id) => id !== index && type === (tutorialStep()?.key === 'signature' ? 'order' : 'report'));
  interaction.compare = interaction.compare === null ? (preferred >= 0 ? preferred : (index + 1) % item.documents.length) : null;
  if (item.documents[interaction.compare]?.type === 'order') interaction.orderSeen = true;
  if (interaction.orderSeen && interaction.signed) update({ type: 'tutorial', key: 'signature' }, false);
  playSound('slide');
  render();
}

function checkSample(act) {
  const sample = interaction.inspection;
  switch (act) {
    case 'sample-flip': sample.back = !sample.back; break;
    case 'sample-film': sample.film = !sample.film; break;
    case 'sample-clasp': sample.clasp = true; break;
    case 'sample-tug': sample.tug = true; update({ type: 'tutorial', key: 'sample' }, false); break;
    case 'sample-measure': sample.measured = true; break;
    case 'sample-basis': {
      const spec = getCase(run)?.sample;
      interaction.note = sample.measured ? `量规读数 · ${spec?.reading}` : `检样 · ${sample.back ? spec?.back : spec?.front}`;
      panel = null;
      toast('已记下检样结果');
      break;
    }
  }
  playSound(act === 'sample-clasp' || act === 'sample-tug' ? 'click' : 'slide');
  render();
}

function stamp(value) {
  if (panel || run?.events?.[eventIndex] || run?.phase !== 'case') return;
  if (update({ type: 'stamp', value, note: interaction.note })) playSound('stamp');
  else toast('先跟老周把这箱查完');
}

function dial() {
  if (!interaction.phoneNumber) return;
  playSound('ring');
  const number = interaction.phoneNumber;
  update({ type: 'dial', number, caseIds: interaction.pinned });
  if (run.phase === 'handoff' && run.events?.[eventIndex]) toast('有人到窗口递留底');
}

function openArchive() {
  interaction.archiveFocus ??= archive(run).at(-1)?.id ?? null;
  interaction.archiveEditing = false;
  playSound('paper');
  openPanel('archive');
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
    case 'home': run = null; closePanel(); break;
    case 'start-day': playSound('shutter'); update({ type: 'start-day' }); break;
    case 'advance-day': playSound('paper'); update({ type: 'advance-day' }); break;
    case 'next': {
      const { pinned, phoneNumber } = interaction;
      interaction = { ...freshInteraction(), pinned, phoneNumber };
      panel = null;
      playSound('bell');
      update({ type: 'next' });
      break;
    }
    case 'event-next': eventIndex++; playSound('paper'); render(); break;
    case 'doc': if (run) chooseDoc(index, target); break;
    case 'basis': checkBasis(index, Number(target.dataset.field)); break;
    case 'compare': compareDocs(); break;
    case 'sample': playSound('slide'); openPanel('sample', target); break;
    case 'stamp': stamp(key); break;
    case 'archive': if (run) openArchive(); break;
    case 'archive-focus': interaction.archiveFocus = index; interaction.archiveEditing = false; playSound('paper'); render(); break;
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
        playSound('stamp');
        toast('更正已留底');
      }
      break;
    }
    case 'phone': playSound('click'); openPanel('phone', target); break;
    case 'phone-digit': if (interaction.phoneNumber.length < 5) interaction.phoneNumber += key; playSound('click'); renderModal(); break;
    case 'phone-clear': interaction.phoneNumber = interaction.phoneNumber.slice(0, -1); renderModal(); break;
    case 'phone-select': interaction.phoneNumber = key; renderModal(); break;
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

root.addEventListener('submit', (event) => {
  if (event.target.dataset.form !== 'archive') return;
  event.preventDefault();
  interaction.archiveQuery = String(new FormData(event.target).get('query') ?? '').slice(0, 60);
  interaction.archiveFocus = archive(run, interaction.archiveQuery).at(-1)?.id ?? null;
  interaction.archiveEditing = false;
  render();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Tab' && modalLayer.firstElementChild) {
    const controls = [...modalLayer.querySelectorAll('button:not(:disabled), input:not(:disabled)')];
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  if (event.key === 'Escape' && panel) { event.preventDefault(); closePanel(); }
  if (!run || event.target instanceof HTMLInputElement || event.ctrlKey || event.metaKey || event.altKey) return;
  if (panel === 'phone' && /^\d$/.test(event.key) && interaction.phoneNumber.length < 5) {
    interaction.phoneNumber += event.key;
    renderModal();
  } else if (!panel && ['1', '2', '3'].includes(event.key)) stamp(['pass', 'fail', 'review'][Number(event.key) - 1]);
});

desktop.addEventListener('pointerdown', (event) => {
  const paper = event.target.closest('[data-drag="paper"]');
  if (!paper || event.button !== 0 || run?.phase !== 'case') return;
  const index = Number(paper.dataset.i);
  drag = { paper, index, pointerId: event.pointerId, origin: stagePoint(root, event.clientX, event.clientY), offset: interaction.positions[index] ?? { x: 0, y: 0 }, moved: false };
});

window.addEventListener('pointermove', (event) => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const point = stagePoint(root, event.clientX, event.clientY);
  const x = point.x - drag.origin.x;
  const y = point.y - drag.origin.y;
  if (!drag.moved && Math.hypot(x, y) < 7) return;
  if (!drag.moved) playSound('paper');
  drag.moved = true;
  const offset = { x: Math.max(-90, Math.min(90, drag.offset.x + x)), y: Math.max(-35, Math.min(40, drag.offset.y + y)) };
  interaction.positions[drag.index] = offset;
  drag.paper.style.setProperty('--paper-x', `${offset.x}px`);
  drag.paper.style.setProperty('--paper-y', `${offset.y}px`);
  drag.paper.classList.add('moving');
});

function endDrag(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  if (drag.moved) {
    drag.paper.classList.remove('moving');
    suppressPaperClick = true;
    setTimeout(() => { suppressPaperClick = false; }, 0);
  }
  drag = null;
}

window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);
render();

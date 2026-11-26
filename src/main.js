import { createRun, createFollowingRun, restoreRun, validRunSave, dispatch, getCase, getDay, getEnding, getPreviousReceipt, getReworkFollowup, getShipmentAcceptance, getShipmentException, getTraceInquiry, getTraceHandoffReview, getTutorialStep, archive, archivedReportSources, canShowFinding, canRecheckReceipt, getWindowSupplementRequest, nightRegisterForReceipt, receiptDisposition, runEvidence, COMPACT_SCHEDULE, EVIDENCE, TRACE_CASE_ID, TRACE_FINDING } from './engine.js';
import { DAYS, EASTER_EGGS, FIRST_BATCH_TUTORIAL, SECOND_BATCH_TUTORIAL, SHIPMENT_ACCEPTANCE, SHIPMENT_EXCEPTION } from './content.js';
import { cuffSplitVisible, sampleAppearance, sampleFinding, sampleInGauge } from './samples.js';
import { mountSampleImage, retrySampleImage, updateSampleImage } from './sample-images.js';
import { bindViewport, toggleFullscreen, stagePoint } from './devices.js';
import { bindAudio, playSound, isMuted, setMuted } from './audio.js';
import { captureDeskProjection } from './desk-projection.js';
import { ARRIVAL_APPROACH_MS, CARGO_DEPARTURE_MS, RECEIPT_FEED_MS, RECEIPT_HANDOVER_MS } from './booth-motion.js';
import { freshInteraction, captureInspectionProgress, restoreInspectionProgress } from './inspection-progress.js';
import { readFindings } from './inspection-findings.js';
import { reportWorkspace, TRACE_INQUIRY_KEY } from './report-workspace.js';
import { completedShiftHistory, collectedEndingIds, createWeekId } from './completed-shifts.js';
import { cartonFinding, intakeComparison, modelComparison, moldComparison, projectComparison, relabelComparison, thicknessComparison } from './document-comparison.js';
import { handoffComparison } from './handoff-comparison.js';
import { handoffWorkspace, hasHandoffDocument } from './handoff-workspace.js';
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
bindAudio(root.ownerDocument);
for (const name of ['load', 'error']) {
  root.addEventListener(name, (event) => {
    if (event.target instanceof HTMLImageElement) updateSampleImage(event.target);
  }, true);
}
const SAVE_KEY = 'nandu-inspection-save-v1';
const COLLECTION_KEY = 'nandu-inspection-endings-v1';
const COMPLETED_KEY = 'nandu-inspection-completed-v1';
const ARRIVAL_PAUSE_MS = 1150;
const NEXT_BATCH_PAUSE_MS = 2350;
const LONG_BATCH_PAUSE_MS = 3200;
const VISIT_HANDOVER_MS = 760;
const PAPER_PAIR_HOLD_MS = 250;
const PAPER_TOUCH_DRAG_PX = 8;
const CARTON_TURN_TRAVEL = 28;
const TOOL_DRAG_PX = 9;
const RECEIPT_LIFT_MS = 235;
const RECEIPT_REVIEW_MS = 1250;
const TUTORIAL_CALLOUT_TRAVEL_MS = 300;
const TUTORIAL_REMIND_MS = 4000;
const cargoRoutes = new Set(['shipping', 'returned', 'held']);

function readStorage(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

function writeStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Private storage can be unavailable. */ }
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
if (!validRunSave(saved)) saved = null;
let completedShifts = completedShiftHistory(readStorage(COMPLETED_KEY));
let endings = collectedEndingIds(readStorage(COLLECTION_KEY), completedShifts);
if (saved?.phase === 'ending') rememberCompletedShift(saved);
let run = null;
let reviewingHistory = false;
let historyNavigation = null;
let panel = 'welcome-project';
let scenery;
let modeledReady = false;
let resumeSceneMount = null;
let sceneMountFrame = 0;
let toastTimer;
let arrivalTimer = 0;
let arrival = null;
let glancedPanel = null;
let lastToolFocus = null;
let closingShotTimer = 0;
let closingShot = null;
let workspaceScrollTimer = 0;
let drag;
let toolDrag = null;
let toolClickTarget = null;
let deskPress = null;
let suppressDeskClick = false;
let modalOpener = null;
let archiveReturn = null;
let reportIndex = null;
let archivePaper = null;
let correctionDraft = null;
let handoffFocus = null;
let handoffDocument = null;
let handoffPairOpen = false;
let recallPairReturn = null;
let issuedReceiptId = null;
let pendingReceiptPrint = false;
let receiptPrintTimer = 0;
let receiptHandoverTimer = 0;
let receiptHeld = false;
let presentedEvidence = null;
let interaction = freshInteraction();

root.innerHTML = view.shell();
const playfield = root.querySelector('.playfield');
const status = root.querySelector('#top-status');
const booth = root.querySelector('.booth-layout');
const wallShift = root.querySelector('#wall-shift');
const hud = root.querySelector('#room-hud');
const arrivalStatus = root.querySelector('#arrival-status');
const windowReadback = root.querySelector('#window-readback');
const paperDragCue = root.querySelector('#paper-drag-cue');
const utility = root.querySelector('.topbar .utility');
const windowGlance = document.createElement('button');
windowGlance.id = 'window-glance';
windowGlance.className = 'window-glance window-glance-live';
windowGlance.type = 'button';
const desktop = root.querySelector('#desk');
const screenLayer = root.querySelector('#screen');
const modalLayer = root.querySelector('#modal');
const tutorialPointer = root.querySelector('.tutorial-pointer');
const tutorialSpotlight = root.querySelector('.tutorial-spotlight');
const tutorialCallout = root.querySelector('.tutorial-callout');
const tutorialCalloutLabel = tutorialCallout.querySelector('small');
const tutorialCalloutText = tutorialCallout.querySelector('strong');
const toastBox = root.querySelector('.game-toast');
const roomHost = root.querySelector('.canvas-room');
const cargoHost = root.querySelector('.booth-cargo');
const illustratedWorker = roomHost.querySelector('.static-worker');
const modelHost = root.querySelector('.model-world');
root.style.setProperty('--receipt-handover-time', `${RECEIPT_HANDOVER_MS}ms`);
const homeShortcut = root.querySelector('.home-shortcut');
const soundToggle = root.querySelector('[data-act="sound"]');
const fullscreenToggle = root.querySelector('[data-act="fullscreen"]');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const gaze = { x: 0, y: 0, targetX: 0, targetY: 0, frame: 0, time: 0 };
let fixtureElements = [...booth.querySelectorAll('[data-fixture]')];
let fixtureLayout = {};
let tutorialPointerFrame = 0;
let tutorialPointerMotion = 0;
let tutorialCalloutMovingUntil = 0;
let tutorialRemindTimer = 0;

bindViewport(root, ({ fullscreen, immersive, rotated }) => {
  if (drag) endDrag({ type: 'pointercancel', pointerId: drag.pointerId });
  if (toolDrag?.kind === 'gauge') endToolDrag({ type: 'pointercancel', pointerId: toolDrag.pointerId });
  cancelDeskPress();
  const expanded = fullscreen || immersive;
  fullscreenToggle.setAttribute('aria-pressed', String(expanded));
  fullscreenToggle.setAttribute('aria-label', expanded ? '退出全屏' : '全屏');
  if (rotated) resetGaze();
  scheduleTutorialPointer();
});

function placeFixtures() {
  const sample = fixtureLayout.sample;
  const binder = fixtureLayout.archive;
  const sampleBottom = sample ? `${(sample.y + sample.h).toFixed(1)}px` : '';
  const stampControls = fixtureLayout.stampControls;
  root.toggleAttribute('data-compact-stamps', Boolean(stampControls));
  const stampRadius = stampControls && Math.min(24, Math.max(1, (Math.abs(stampControls.fail.x - stampControls.pass.x) - 1) / 2));
  for (const element of fixtureElements) {
    const fixture = element.dataset.fixture;
    const rect = fixture === 'findings' ? fixtureLayout.findings ?? fixtureLayout.pass : fixtureLayout[fixture];
    const stampControl = stampControls?.[fixture];
    element.toggleAttribute('data-fixture-visible', Boolean(rect));
    element.toggleAttribute('data-stamp-control', Boolean(stampControl));
    if (!rect) continue;
    const { x, y, w, h } = rect;
    element.style.setProperty('--fixture-x', `${x.toFixed(1)}px`);
    element.style.setProperty('--fixture-y', `${y.toFixed(1)}px`);
    element.style.setProperty('--fixture-w', `${w.toFixed(1)}px`);
    element.style.setProperty('--fixture-h', `${h.toFixed(1)}px`);
    if (fixture === 'findings') {
      element.style.setProperty('--fixture-sample-bottom', sampleBottom);
    }
    if (stampControl) {
      const { x: centerX, y: capY, labelX, labelY } = stampControl;
      const crossesBinder = binder && centerX + stampRadius > binder.x && centerX - stampRadius < binder.x + binder.w;
      const belowBinder = crossesBinder ? binder.y + binder.h + 1 : 0;
      const centerY = belowBinder <= capY ? Math.max(capY, belowBinder + stampRadius) : capY;
      element.style.setProperty('--stamp-hit-radius', `${stampRadius.toFixed(2)}px`);
      element.style.setProperty('--stamp-control-x', `${centerX.toFixed(1)}px`);
      element.style.setProperty('--stamp-control-y', `${centerY.toFixed(1)}px`);
      element.style.setProperty('--stamp-label-x', `${(labelX - centerX).toFixed(1)}px`);
      element.style.setProperty('--stamp-label-y', `${(labelY - centerY).toFixed(1)}px`);
    }
  }
  scheduleTutorialPointer();
}

function canSwitchBooth() {
  if (panel || drag || toolDrag) return false;
  if (arrival) return arrival.stage === 'waiting' && !arrival.handingReceipt;
  return run?.phase !== 'case' && run?.phase !== 'receipt' && !activeVisit();
}

function showModeledScene() {
  if (!modeledReady || root.dataset.modeled === 'true' || !canSwitchBooth()) return;
  root.dataset.modeled = 'true';
}

function suspendModeledScene() {
  modeledReady = false;
  if (root.dataset.modeled !== 'true') return;
  if (drag) endDrag({ type: 'pointercancel', pointerId: drag.pointerId });
  cancelDeskPress();
  delete root.dataset.modeled;
  setScene();
}

function createSceneContext(type, attributes) {
  try {
    const context = root.ownerDocument.createElement('canvas').getContext(type, attributes);
    return context && !context.isContextLost() ? context : null;
  } catch {
    return null;
  }
}

function scheduleSceneMount() {
  if (!resumeSceneMount || sceneMountFrame || !canSwitchBooth()) return;
  sceneMountFrame = requestAnimationFrame(() => {
    sceneMountFrame = 0;
    if (!canSwitchBooth()) return;
    const resume = resumeSceneMount;
    resumeSceneMount = null;
    resume();
  });
}

function waitForSceneBoundary() {
  return new Promise((resolve) => {
    resumeSceneMount = resolve;
    scheduleSceneMount();
  });
}

async function startScene() {
  const baseUrl = import.meta.env.BASE_URL;
  const webgl2 = createSceneContext('webgl2', { alpha: false, antialias: true, powerPreference: 'low-power', depth: true });
  if (webgl2) {
    try {
      const { mountModeledBooth } = await import('./modeled-booth.js');
      await waitForSceneBoundary();
      if (!webgl2.isContextLost()) {
        scenery = mountModeledBooth(modelHost, {
          baseUrl,
          context: webgl2,
          onLayout(layout) {
            fixtureLayout = layout;
            if (!panel) placeFixtures();
          },
          onReady() {
            modeledReady = true;
            showModeledScene();
          },
          onUnavailable: suspendModeledScene,
        });
      }
    } catch { /* Use the illustrated booth if the 3D module failed to start. */ }
    if (!scenery) webgl2.getExtension('WEBGL_lose_context')?.loseContext();
  }
  if (!scenery) {
    roomHost.dataset.renderer = 'static';
    const webgl = createSceneContext('webgl', { alpha: false, antialias: false, depth: true, stencil: true });
    if (!webgl) return;
    try {
      const { mountScenery } = await import('./scenery.js');
      await waitForSceneBoundary();
      if (!webgl.isContextLost()) scenery = mountScenery(roomHost, { baseUrl, context: webgl });
    } catch { webgl.getExtension('WEBGL_lose_context')?.loseContext(); }
  }
  setScene();
  scenery?.setViewPose(gaze.x, gaze.y);
}

function drawGaze(x, y) {
  gaze.x = x;
  gaze.y = y;
  const distance = Math.max(Math.abs(x), Math.abs(y));
  root.toggleAttribute('data-view-turned', distance > 0);
  root.style.setProperty('--view-x', x.toFixed(4));
  root.style.setProperty('--view-y', y.toFixed(4));
  root.style.setProperty('--view-distance', distance.toFixed(4));
  scenery?.setViewPose(x, y);
  if (root.dataset.modeled !== 'true') scheduleTutorialPointer();
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
  if (drag || toolDrag || deskPress) { gaze.time = 0; return; }
  if (reducedMotion.matches || (root.dataset.rotated === 'true' && !glancedPanel)) { resetGaze(); return; }
  const targetY = glancedPanel ? Math.min(gaze.targetY, -.32) : gaze.targetY;
  const elapsed = gaze.time ? Math.min(time - gaze.time, 48) : 16;
  const blend = 1 - Math.exp(-elapsed / 82);
  const x = gaze.x + (gaze.targetX - gaze.x) * blend;
  const y = gaze.y + (targetY - gaze.y) * blend;
  if (Math.max(Math.abs(x - gaze.targetX), Math.abs(y - targetY)) < .002) {
    drawGaze(gaze.targetX, targetY);
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
  if (!gaze.frame && !drag && !toolDrag && !deskPress) gaze.frame = requestAnimationFrame(followGaze);
}

root.addEventListener('pointerdown', (event) => {
  toolClickTarget = null;
  if (toolDrag?.kind === 'gauge' && toolDrag.pointerId !== event.pointerId) {
    endToolDrag({ type: 'pointercancel', pointerId: toolDrag.pointerId });
  }
  if (!drag && !deskPress) suppressDeskClick = false;
  if (drag && drag.pointerId !== event.pointerId) {
    endDrag({ type: 'pointercancel', pointerId: drag.pointerId });
    return;
  }
  beginDeskPress(event);
  const paper = event.target.closest('#desk [data-drag="paper"]');
  if (event.pointerType !== 'mouse' && !paper && !glancedPanel && !deskPress) resetGaze();
}, { capture: true });

root.addEventListener('pointermove', (event) => {
  if (toolDrag) return;
  if (drag && drag.pointerId !== event.pointerId) return;
  if (event.pointerType !== 'mouse') { if (!drag && !glancedPanel && !deskPress) resetGaze(); return; }
  if (!run || root.dataset.rotated === 'true' || reducedMotion.matches) return;
  const bounds = root.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  setGazeTarget((event.clientX - bounds.x) / bounds.width * 2 - 1, (event.clientY - bounds.y) / bounds.height * 2 - 1);
});
root.addEventListener('pointerleave', () => setGazeTarget(0, 0));
reducedMotion.addEventListener('change', resetGaze);

function animateOnDesk(element, frames, duration) {
  if (reducedMotion.matches || !element?.animate) return;
  element.animate(frames, { duration, easing: 'cubic-bezier(.2,.78,.27,1)' });
  scheduleTutorialPointer(duration);
}

function stageBounds(element) {
  const rect = element.getBoundingClientRect();
  const start = stagePoint(root, rect.left, rect.top);
  const end = stagePoint(root, rect.right, rect.bottom);
  return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), w: Math.abs(end.x - start.x), h: Math.abs(end.y - start.y) };
}

function visibleGuideTarget(target) {
  if (!target?.getClientRects().length || target.closest('[inert]') || getComputedStyle(target).visibility === 'hidden') return false;
  const clip = target.closest('.desk-surface-content');
  if (!clip) return true;
  const element = target.getBoundingClientRect();
  const bounds = clip.getBoundingClientRect();
  const x = element.left + element.width / 2;
  const y = element.top + element.height / 2;
  return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
}

function tutorialPointerTarget() {
  if (run?.phase !== 'case' || run.day !== 0 || run.sampleSet === 4 || glancedPanel || arrival) return null;
  const surface = !panel ? desktop : ['docs', 'sample', 'carton'].includes(panel) ? modalLayer : null;
  return surface?.querySelector('[data-guide-target]:not(:disabled)') ?? null;
}

function guideBounds(target) {
  if (!target) return null;
  const targets = target.dataset.guideTarget === 'stamp-choice'
    ? [...target.querySelectorAll('[data-act="stamp"]:enabled')] : [target];
  const rectangles = targets.filter(visibleGuideTarget).map(stageBounds);
  if (!rectangles.length) return null;
  const x = Math.min(...rectangles.map((rect) => rect.x));
  const y = Math.min(...rectangles.map((rect) => rect.y));
  const right = Math.max(...rectangles.map((rect) => rect.x + rect.w));
  const bottom = Math.max(...rectangles.map((rect) => rect.y + rect.h));
  return { x, y, w: right - x, h: bottom - y };
}

function overlappingArea(a, b) {
  return Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
}

function positionTutorialCallout(target, bounds, stage) {
  const key = target.dataset.guideTarget;
  const surface = panel ?? 'desk';
  const wasShown = !tutorialCallout.hidden;
  if (!wasShown || tutorialCallout.dataset.guideFor !== key || tutorialCallout.dataset.guideSurface !== surface) {
    if (wasShown) {
      tutorialCalloutMovingUntil = performance.now() + TUTORIAL_CALLOUT_TRAVEL_MS;
      toast('');
    }
    clearTimeout(tutorialRemindTimer);
    tutorialSpotlight.removeAttribute('data-remind');
    tutorialRemindTimer = setTimeout(() => tutorialSpotlight.setAttribute('data-remind', ''), TUTORIAL_REMIND_MS);
  }
  const cue = target.dataset.guideCue ?? target.getAttribute('aria-label') ?? target.textContent.trim();
  const caseId = windowCase()?.id;
  const guide = run?.binaryVerdicts && run.day === 0
    ? (caseId === 1 ? FIRST_BATCH_TUTORIAL : caseId === 2 ? SECOND_BATCH_TUTORIAL : null)
    : null;
  const stepKey = tutorialStep()?.key;
  const stepIndex = guide && stepKey ? guide.findIndex(({ key: entryKey }) => entryKey === stepKey) : -1;
  const label = stepIndex >= 0 ? `老周 · 带教 ${stepIndex + 1}/${guide.length}` : '老周 · 带教';
  if (tutorialCalloutLabel && tutorialCalloutLabel.textContent !== label) tutorialCalloutLabel.textContent = label;
  if (tutorialCalloutText.textContent !== cue) tutorialCalloutText.textContent = cue;
  tutorialCallout.hidden = false;
  tutorialCallout.dataset.guideFor = key;
  tutorialCallout.dataset.guideSurface = surface;
  tutorialCallout.toggleAttribute('data-moving', wasShown && performance.now() < tutorialCalloutMovingUntil);

  const { w, h } = stageBounds(tutorialCallout);
  const { x, y } = bounds;
  const right = x + bounds.w;
  const bottom = y + bounds.h;
  const centerX = x + (bounds.w - w) * .5;
  const centerY = y + (bounds.h - h) * .5;
  const stageRight = stage.x + stage.w - w - 9;
  const stageBottom = stage.y + stage.h - h - 9;
  const gap = key === 'docs-sample' || key.startsWith('paper-') ? 12 : 22;
  const candidates = [
    [centerX, y - h - gap], [x - w - gap, centerY], [right + gap, centerY], [centerX, bottom + gap],
    [right + gap, y - h - 8], [x - w - gap, y - h - 8], [right + gap, bottom + 8], [x - w - gap, bottom + 8],
    [stage.x + 9, stage.y + 9], [stageRight, stage.y + 9], [stage.x + 9, stageBottom], [stageRight, stageBottom],
  ];
  const paper = key.startsWith('paper-') && target.closest('.sheet');
  if (paper) {
    const abovePaper = stageBounds(paper).y - h - 8;
    candidates.unshift([centerX, abovePaper], [x - w - gap, abovePaper], [right + gap, abovePaper]);
  }
  const controls = panel
    ? modalLayer.querySelectorAll('.first-documents .sheet h3, .first-documents .fields > div, .sample-findings, .sample-object, .desk-dialogue, button:enabled')
    : booth.querySelectorAll('.speaker, .speech > p, button:enabled');
  const obstacles = [...controls].filter((element) => element !== target && visibleGuideTarget(element)).map(stageBounds);
  const targetPadding = { x: x - 9, y: y - 9, w: bounds.w + 18, h: bounds.h + 18 };
  let best;
  let bestScore = Infinity;
  for (const [left, top] of candidates) {
    const rect = {
      x: Math.max(stage.x + 9, Math.min(stageRight, left)),
      y: Math.max(stage.y + 9, Math.min(stageBottom, top)),
      w, h,
    };
    const obstruction = overlappingArea(rect, targetPadding) * 30 +
      obstacles.reduce((area, obstacle) => area + overlappingArea(rect, obstacle), 0);
    const distance = Math.hypot(rect.x - centerX, rect.y - centerY);
    const score = obstruction + distance;
    if (score < bestScore) {
      best = rect;
      bestScore = score;
    }
  }
  tutorialCallout.style.transform = `translate3d(${(best.x - stage.x).toFixed(1)}px,${(best.y - stage.y).toFixed(1)}px,0)`;
  return best;
}

function hideTutorialGuide() {
  tutorialCallout.hidden = true;
  tutorialCallout.removeAttribute('data-moving');
  tutorialCalloutMovingUntil = 0;
  clearTimeout(tutorialRemindTimer);
  tutorialSpotlight.hidden = true;
  tutorialPointer.hidden = true;
}

function positionTutorialPointer() {
  const target = tutorialPointerTarget();
  const bounds = guideBounds(target);
  if (!bounds) return hideTutorialGuide();
  const { x, y, w, h } = bounds;
  const stage = stageBounds(playfield);
  const key = target.dataset.guideTarget;
  const padding = key === 'stamp-choice' ? 5 : 4;
  tutorialSpotlight.style.insetInlineStart = `${(x - stage.x - padding).toFixed(1)}px`;
  tutorialSpotlight.style.insetBlockStart = `${(y - stage.y - padding).toFixed(1)}px`;
  tutorialSpotlight.style.inlineSize = `${(w + padding * 2).toFixed(1)}px`;
  tutorialSpotlight.style.blockSize = `${(h + padding * 2).toFixed(1)}px`;
  tutorialSpotlight.dataset.guideFor = key;
  tutorialSpotlight.hidden = false;
  const callout = positionTutorialCallout(target, bounds, stage);
  const middleX = x + w / 2;
  const middleY = y + h / 2;
  const screen = root.getBoundingClientRect();
  const left = { x: x - 19, y: middleY, angle: 0 };
  const above = { x: middleX, y: y - 19, angle: 90 };
  const right = { x: x + w + 19, y: middleY, angle: 180 };
  const below = { x: middleX, y: y + h + 19, angle: 270 };
  const directions = key.startsWith('paper-') ? [right, left, above, below]
    : panel ? [above, left, right, below] : [left, above, right, below];
  const dialogue = [...playfield.querySelectorAll('.room-hud .speech, .desk-dialogue')].filter(visibleGuideTarget);
  const guidance = [callout, ...dialogue.map(stageBounds)];
  const inStage = directions.filter(({ x, y, angle }) => {
    const horizontal = angle % 180 === 0;
    const marginX = horizontal ? 17 : 13;
    const marginY = horizontal ? 13 : 17;
    return x > stage.x + marginX && x < stage.x + stage.w - marginX && y > stage.y + marginY && y < stage.y + stage.h - marginY;
  });
  const choices = inStage.filter(({ x, y }) => !guidance.some((bounds) =>
    x + 14 > bounds.x && x - 14 < bounds.x + bounds.w && y + 14 > bounds.y && y - 14 < bounds.y + bounds.h));
  const clear = ({ x, y }) => {
    const hit = root.dataset.rotated === 'true'
      ? document.elementFromPoint(screen.right - y, screen.top + x)
      : document.elementFromPoint(screen.left + x, screen.top + y);
    return !hit?.closest('button:enabled, input, a');
  };
  const anchor = choices.find(clear) ?? choices[0] ?? inStage.find(clear);
  tutorialPointer.hidden = !anchor;
  if (!anchor) return;
  tutorialPointer.style.insetInlineStart = `${(anchor.x - stage.x).toFixed(1)}px`;
  tutorialPointer.style.insetBlockStart = `${(anchor.y - stage.y).toFixed(1)}px`;
  tutorialPointer.style.setProperty('--pointer-angle', `${anchor.angle}deg`);
  tutorialPointer.dataset.guideFor = key;
}

function scheduleTutorialPointer(duration = 0) {
  if (tutorialCallout.hidden && !tutorialPointerTarget()) return;
  tutorialPointerMotion = Math.max(tutorialPointerMotion, performance.now() + duration);
  if (tutorialPointerFrame) return;
  const updatePointer = (now) => {
    tutorialPointerFrame = 0;
    positionTutorialPointer();
    if (now < tutorialPointerMotion && tutorialPointerTarget()) tutorialPointerFrame = requestAnimationFrame(updatePointer);
  };
  tutorialPointerFrame = requestAnimationFrame(updatePointer);
}

function animateFallbackDelivery() {
  if (reducedMotion.matches || root.dataset.modeled === 'true') return;
  const slot = stageBounds(booth.querySelector('.booth-transfer-slot'));
  const elapsed = performance.now() - arrival.approachStartedAt;
  const objects = desktop.querySelectorAll('.paper-card, .sample-preview');
  objects.forEach((object, index) => {
    const rest = stageBounds(object);
    const offsetX = slot.x + slot.w / 2 - rest.x - rest.w / 2;
    const offsetY = slot.y + slot.h / 2 - rest.y - rest.h / 2;
    const motion = object.animate?.([
      { translate: `${offsetX}px ${offsetY}px`, scale: '.68 .46', opacity: .58 },
      { translate: '0 0', scale: '1', opacity: 1 },
    ], { delay: 22 + index * 18, duration: 365, easing: 'cubic-bezier(.2,.71,.24,1)', fill: 'backwards' });
    if (motion) motion.currentTime = elapsed;
  });
}

function animatePrintedReceipt(paper) {
  if (reducedMotion.matches || !paper?.animate) return;
  const modeled = root.dataset.modeled === 'true';
  const pickup = modeled ? fixtureLayout.receiptPickup ?? fixtureLayout.receiptSlot : null;
  let start;
  if (pickup) {
    const world = stageBounds(modelHost);
    start = { x: world.x + pickup.x, y: world.y + pickup.y, w: pickup.w, h: pickup.h };
  } else {
    const slot = desktop.querySelector('.booth-print-slot');
    const stub = slot?.querySelector('i');
    if (!stub?.animate || !slot.offsetWidth) return;
    start = stageBounds(stub);
    stub.animate([
      { translate: '0 -60%', clipPath: 'inset(65% 0 0)', visibility: 'visible' },
      { translate: '0 0', clipPath: 'inset(0)', visibility: 'visible' },
    ], { duration: RECEIPT_FEED_MS, easing: 'ease-out' });
  }
  const rest = stageBounds(paper);
  if (!rest.w || !rest.h) return;
  const from = {
    translate: `${start.x + start.w / 2 - rest.x - rest.w / 2}px ${start.y + start.h / 2 - rest.y - rest.h / 2}px`,
    scale: `${Math.max(.12, start.w / rest.w)} ${Math.max(.04, start.h / rest.h)}`,
  };
  const duration = RECEIPT_FEED_MS + RECEIPT_LIFT_MS;
  const feed = RECEIPT_FEED_MS / duration;
  paper.animate([
    { ...from, clipPath: 'inset(100% 0 0)', offset: 0 },
    { ...from, clipPath: 'inset(100% 0 0)', offset: feed - .005 },
    { ...from, clipPath: 'inset(-1rem)', offset: feed, easing: 'cubic-bezier(.17,.73,.33,1)' },
    { translate: '0 0', scale: '1', clipPath: 'inset(-1rem)', offset: 1 },
  ], duration);
}

function beginReceiptPrint(id) {
  issuedReceiptId = id;
  pendingReceiptPrint = true;
  clearTimeout(receiptPrintTimer);
  receiptPrintTimer = 0;
  if (reducedMotion.matches) return;
  receiptPrintTimer = setTimeout(() => {
    receiptPrintTimer = 0;
    const surface = modalLayer.querySelector('.receipt-surface');
    surface?.querySelectorAll('button').forEach((control) => { control.disabled = false; });
    if (surface && document.activeElement === document.body) focusControl(surface, { act: receiptHeld ? 'next' : 'hold-receipt' });
  }, RECEIPT_FEED_MS + RECEIPT_LIFT_MS);
}

function canAutomaticallyHandReceipt() {
  return run?.phase === 'receipt' && !panel && !arrival && !receiptHeld && !activeVisit() && !document.hidden;
}

function cancelReceiptHandover() {
  clearTimeout(receiptHandoverTimer);
  receiptHandoverTimer = 0;
}

function syncReceiptHandover() {
  if (!canAutomaticallyHandReceipt()) {
    cancelReceiptHandover();
    return;
  }
  if (receiptHandoverTimer) return;
  const delay = RECEIPT_REVIEW_MS + (receiptPrintTimer ? RECEIPT_FEED_MS + RECEIPT_LIFT_MS : 0);
  receiptHandoverTimer = setTimeout(() => {
    receiptHandoverTimer = 0;
    if (canAutomaticallyHandReceipt() && !restoreNewerArrivalSave()) handReceipt(true);
  }, delay);
}

function tutorialStep() {
  if (run?.phase !== 'case') return null;
  return run.binaryVerdicts || getCase(run)?.id === 1 ? getTutorialStep(run) : null;
}

function showPencil(item) {
  return item?.id === 8 && run.flags.rollingPencil && !run.flags.pencil;
}

function activeVisit(state = run) {
  return state?.events ? (state.events[0] ?? null) : (state?.event ?? null);
}

function toolsAvailableBetweenBatches() {
  return arrival?.action === 'next' && arrival.hasVisitor && arrival.stage === 'waiting' && !arrival.handingReceipt;
}

function waitingRegister() {
  if (arrival?.action !== 'next' || !arrival.hasVisitor || arrival.stage !== 'waiting') return null;
  const paper = nightRegisterForReceipt(run);
  if (!paper?.available || run.binaryVerdicts) return null;
  const held = panel === 'archive' && archivePaper?.id === paper.id && archivePaper.index === paper.index;
  return { ...paper, held };
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
  const { record, day, title, originalShipment } = acceptance;
  const report = archive(state).find(({ id }) => id === record.id)?.documents.find(({ type }) => type === 'report');
  const reportNumber = report?.fields.find(([label]) => label === '报告编号')?.[1];
  const fields = [['批号', record.batch], ['对应出货单', `${DAYS[originalShipment?.day ?? record.day]?.title}开单`],
    ...(originalShipment ? [['实际出库', DAYS[originalShipment.shippedDay].title], ['补验入档', DAYS[record.day].title]] : []),
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
  const trace = !run.binaryVerdicts && run.flags.traceDocument
    ? { caseId: TRACE_CASE_ID, key: 'trace', document: { ...EVIDENCE.trace, kind: 'trace' } } : null;
  const recalls = run.records.filter((record) => record.recallReceipt).map((record) => ({
    caseId: record.id, key: `recall:${record.id}`, document: recallPaper(record, record.recallReceipt.day),
  }));
  return [filedRework(), acceptancePaper(run), exceptionPaper(run), trace, filedWindowSupplement(), ...recalls].filter(Boolean);
}

function labRegistrationKey(caseId) {
  return `call:lab-request:${caseId}`;
}

function legacyCallPapers() {
  const log = run.phoneLog ?? [];
  const hasRegistration = log.some((call) => call?.kind === 'lab-request');
  const filed = hasRegistration ? archive(run) : [];
  const inquiry = getTraceInquiry(run);
  return log.flatMap((call) => {
    if (call?.kind === 'incoming') {
      return [[`call:${call.incomingKey}`, {
        type: 'archive', title: call.incomingKey === 'ringback' ? '回铃录音' : '实验室收班来电',
        fields: [['内线', call.number], ['接听', DAYS[call.day]?.title ?? '已登记'], ['通话内容', call.lines.join(' ')]],
      }]];
    }
    if (call?.kind === 'trace' && inquiry) {
      const reportNumber = inquiry.sources[0].number;
      const sources = inquiry.sources.map(({ batch, document }) => `${batch} ${document.title}`);
      return [[TRACE_INQUIRY_KEY, {
        type: 'archive', kind: 'trace-inquiry', title: `实验室通话登记 · ${reportNumber}`, reportNumber,
        originalFiled: Boolean(run.flags.traceDocument),
        fields: [['通话单据', sources.join(' / ')], ['实验室原件', run.flags.traceDocument ? '已收进交接簿' : '可从报告编号查收'],
          ['内线', `${inquiry.number} · 小陈`], ...(inquiry.day === null ? [] : [['登记日', DAYS[inquiry.day]?.title ?? '值班周内']])],
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
  const historicalPapers = run.binaryVerdicts ? [] : Object.entries(runEvidence(run)).filter(([key]) =>
    run.flags[`${key}Document`] && !batchPapers.some((paper) => paper.key === key));
  const visits = [
    ...historicalPapers,
    ...batchPapers.map(({ key, document }) => [key, document]),
  ];
  return (run.binaryVerdicts ? visits : [...visits, ...legacyCallPapers()]).filter(([, doc]) =>
    !term || [doc.title, ...doc.fields.flat(), doc.note].some((text) => text?.toLowerCase().includes(term)));
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
    else if (interaction.spreadAll || tutorialStep()) heldDocuments = item?.documents.map((_, index) => index) ?? [];
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
      ['处置', '暂停入库，召回已确认'], ['回签日', DAYS[day]?.title ?? '已登记']],
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
  return visit && runEvidence(state)[visit.key];
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
    const handing = Boolean(waiting && arrival.handingReceipt);
    const departed = waiting && !handing;
    const slip = { id: record.id, route };
    return {
      cargo: cargoRoutes.has(route) ? { ...slip, route: departed ? route : 'ready', animate: departed, inspectable: Boolean(getCase(state)?.carton) } : null,
      outgoingSlip: waiting ? null : { ...slip, animate: issuedReceiptId === record.id },
      handedReceipt: handing ? slip : null,
    };
  }
  if (!item) return {};
  const prior = getPreviousReceipt(state, item);
  if (prior?.sameLot && ['shipped', 'recallPending'].includes(prior.record.status)) return {};
  return { cargo: { id: item.id, route: 'ready', animate: false, inspectable: Boolean(item.carton) } };
}

function setScene() {
  scheduleSceneMount();
  showModeledScene();
  const approaching = arrival?.stage === 'approach';
  const waiting = arrival && !approaching;
  const waitingNpc = waiting && arrival.ready ? visitorAt(windowAdvance(arrival.action)) : null;
  const keepVisitor = Boolean(arrival?.keepVisitor || arrival?.handingReceipt);
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
  const npc = closingShot ? null : waiting ? (waitingNpc ?? (keepVisitor ? visitorAt(run) : null))
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
  const retainedPaper = waitingRegister();
  const paperCase = item ?? (retainedPaper ? getCase(run) : null);
  const documents = paperCase?.documents ?? (delivered ? [delivered] : []);
  const forecast = !arrival && (visit || run?.phase === 'receipt') ? windowAdvance(visit ? 'ack-visit' : 'next') : null;
  const shipment = !visit && !closingShot ? sceneShipment(sceneRun, item, waiting) : {};
  view.setRoomCargo(cargoHost, shipment.cargo);
  scenery?.setFrame({ day: sceneRun?.day ?? 0, phase, npc: npc || null, visit: Boolean(visit), shutterClosed, catPassing,
    documents: documents.map((doc) => ({ type: doc.type, title: doc.title, batch: scenePaperBatch(doc, paperCase, visit) })),
    sample: appearance ? { ...inspection, filename: `${appearance.stem}${side}.webp`, kind: item.sample.kind, cuffSplit: cuffSplitVisible(item.sample, inspection) } : null,
    positions: approaching ? {} : interaction.positions, pencil: !arrival && showPencil(item), ...heldObjects(item),
    keepVisitor, visitorWaiting: Boolean(waitingNpc),
    retainedPaper,
    approach: arrival?.approach ?? (needsArrival(forecast) ? arrivalApproach(forecast) : undefined),
    presentedEvidence: phase === 'case' && presentedEvidence && item?.shownFinding === presentedEvidence
      ? { ...presentedEvidence, batch: item.batch } : null,
    ...shipment });
}

function render(resumeScroll, resumeScrollLeft = 0, resumeBoardScroll) {
  if (drag) endDrag({ type: 'pointercancel', pointerId: drag.pointerId });
  cancelDeskPress();
  const settingDownCloseSheet = run?.phase === 'summary' &&
    (root.dataset.phase === 'receipt' || root.dataset.phase === 'summary') &&
    !screenLayer.querySelector('.shift-close-sheet');
  const showingEnding = run?.phase === 'ending' && root.dataset.phase !== 'ending' && !reviewingHistory;
  root.dataset.phase = arrival ? 'waiting' : (run?.phase ?? 'home');
  if (root.dataset.phase !== 'case') hideTutorialGuide();
  if (arrival) root.dataset.arrivalStage = arrival.stage;
  else delete root.dataset.arrivalStage;
  renderArrivalStatus();
  status.innerHTML = run ? `<span>${getDay(run).title}</span><span>第 ${run.day + 1} 天 / 5</span>` : '<span>质检员的一天</span>';
  wallShift.innerHTML = run ? view.wallShift(run) : '';
  homeShortcut.hidden = !run || run.phase === 'ending';
  soundToggle.setAttribute('aria-pressed', String(!isMuted()));
  soundToggle.setAttribute('aria-label', isMuted() ? '开启音效' : '关闭音效');
  const item = windowCase();
  const step = item ? tutorialStep() : null;
  const visit = arrival ? null : activeVisit();
  const previous = item && run.phase === 'case' ? getPreviousReceipt(run, item) : null;
  hud.innerHTML = run && !arrival && !closingShot && (run.phase !== 'summary' || visit)
    ? view.room(run, item, step, item?.pressureLine, visit, previous)
    : '';
  const preview = arrival?.stage === 'approach' && root.dataset.modeled !== 'true' ? arrival.next : null;
  const previewVisit = preview ? activeVisit(preview) : null;
  const previewItem = preview && !previewVisit ? getCase(preview) : null;
  const delivered = visit ? visitDocument(visit) : visitDocument(previewVisit, preview);
  const retainedPaper = waitingRegister();
  desktop.innerHTML = delivered ? view.visitSlip(delivered, visit ?? previewVisit, panel === 'visit') : item ? view.desk(run, item, step, {
    ...interaction, pencil: showPencil(item), stampBlocked: Boolean(panel), ...heldObjects(item),
  }) : previewItem ? view.desk(preview, previewItem, null, { ...freshInteraction(), stampBlocked: true })
    : retainedPaper && !retainedPaper.held ? view.retainedRegister(retainedPaper) : '';
  fixtureElements = [...booth.querySelectorAll('[data-fixture]')];
  showModeledScene();
  if (root.dataset.modeled === 'true') placeFixtures();
  if (preview) animateFallbackDelivery();
  const recapScroll = screenLayer.querySelector('.summary-body, .ending-body')?.scrollTop;
  const openEndingDetails = [...screenLayer.querySelectorAll('.ending-card details')].map(({ open }) => open);
  const historyLabel = reviewedWeekLabel();
  screenLayer.innerHTML = run
    ? (arrival || visit || closingShot ? '' : view.overlay(run, run.phase === 'ending' ? getEnding(run) : null, historyLabel))
    : view.home(saved, endings, completedShifts.size);
  if (closingShot === 'cat') screenLayer.innerHTML = '<span class="visually-hidden" role="status">窗外，厂猫走过了装货台。</span>';
  if (settingDownCloseSheet) {
    animateOnDesk(screenLayer.querySelector('.shift-close-sheet'), [
      { translate: '.8rem 1.35rem', rotate: '-.9deg', opacity: .65 },
      { translate: '0 0', rotate: '0deg', opacity: 1 },
    ], 300);
  }
  if (showingEnding) {
    animateOnDesk(screenLayer.querySelector('.ending-aftermath'), [
      { translate: '0 .9rem', opacity: .56 },
      { translate: '0 0', opacity: 1 },
    ], 290);
  }
  screenLayer.querySelectorAll('.ending-card details').forEach((details, index) => { details.open = openEndingDetails[index] === true; });
  if (recapScroll !== undefined) screenLayer.querySelector('.summary-body, .ending-body')?.scrollTo(0, recapScroll);
  setScene();
  renderModal(item, step);
  if (resumeScroll !== undefined) workspaceBody()?.scrollTo(resumeScrollLeft, resumeScroll);
  if (panel === 'docs' && step?.paper && !glancedPanel) {
    modalLayer.querySelector('[data-act="tutorial-paper"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  if (resumeBoardScroll !== undefined) modalLayer.querySelector('.handoff-board')?.scrollTo(0, resumeBoardScroll);
  persistRun();
  syncReceiptHandover();
}

function renderArrivalStatus() {
  const handingReceipt = Boolean(arrival?.handingReceipt);
  const someoneWaiting = arrival?.ready && arrival.stage === 'waiting';
  const idleTools = !panel && toolsAvailableBetweenBatches();
  const firstBreak = idleTools && run.day === 0 && run.index === 0;
  const message = handingReceipt ? '递出回执…'
    : someoneWaiting ? '窗口有人等候'
    : arrival?.stage === 'approach' ? '窗口递件…'
    : arrival?.action?.type === 'receive-recall' ? '等收货方回执…'
    : arrival?.action === 'next' && !arrival.hasVisitor ? (['handoff', 'ending'].includes(arrival.nextPhase) ? '去交班…' : '本班收工…')
    : firstBreak ? '等下一批 · 可翻交接簿'
    : arrival ? '等下一批…' : '';
  root.toggleAttribute('data-receipt-handover', handingReceipt);
  root.toggleAttribute('data-between-batches', idleTools);
  arrivalStatus.toggleAttribute('data-visitor-waiting', Boolean(someoneWaiting));
  if (arrivalStatus.textContent !== message) arrivalStatus.textContent = message;
}

const glanceReturnLabels = {
  docs: '回到单据', sample: '回到检样', carton: '回到外箱', archive: '回到交接簿', visit: '回到来件',
};

function syncWindowGlance() {
  const content = modalLayer.querySelector('.modal-shade, .desk-surface');
  const receiving = Boolean(content && arrival?.ready && toolsAvailableBetweenBatches() && panel === 'archive');
  const live = Boolean(content && !arrival && !closingShot && Object.hasOwn(glanceReturnLabels, panel) &&
    (run?.phase === 'case' || run?.phase === 'receipt' || activeVisit()));
  const available = receiving || live;
  if (glancedPanel && (!live || glancedPanel !== panel)) {
    glancedPanel = null;
    setGazeTarget(gaze.targetX, gaze.targetY);
  }
  const looking = Boolean(glancedPanel);
  root.toggleAttribute('data-window-glance', looking);
  scheduleTutorialPointer();
  arrivalStatus.classList.toggle('visually-hidden', receiving);
  if (content) content.inert = looking;
  const dialog = content?.querySelector('[aria-modal="true"]');
  if (dialog && available && !looking) dialog.setAttribute('aria-owns', windowGlance.id);
  else dialog?.removeAttribute('aria-owns');
  const screenCoversBooth = Boolean(screenLayer.firstElementChild) && run?.phase !== 'summary';
  booth.inert = looking || Boolean(dialog || !run || closingShot || (arrival && !toolsAvailableBetweenBatches()) || screenCoversBooth);

  const speech = looking && live ? hud.querySelector('.speech') : null;
  const readback = speech ? [...speech.querySelectorAll('.speaker strong, p')].map((line) => line.textContent).join(' ') : '';
  if (windowReadback.textContent !== readback) windowReadback.textContent = readback;
  if (!available) {
    windowGlance.remove();
    return;
  }
  const command = receiving ? '接件' : looking ? glanceReturnLabels[panel] : '抬头看';
  windowGlance.dataset.act = receiving ? 'receive-waiting' : 'window-glance';
  windowGlance.toggleAttribute('data-visitor-waiting', receiving);
  windowGlance.textContent = looking ? '回到查验' : command;
  windowGlance.setAttribute('aria-label', command);
  if (receiving) windowGlance.setAttribute('aria-describedby', arrivalStatus.id);
  else windowGlance.removeAttribute('aria-describedby');
  if (windowGlance.parentElement !== utility) utility.prepend(windowGlance);
}

function toggleWindowGlance() {
  if (!windowGlance.isConnected || drag || toolDrag) return;
  glancedPanel = glancedPanel ? null : panel;
  syncWindowGlance();
  setGazeTarget(gaze.targetX, gaze.targetY);
  if (glancedPanel) {
    windowGlance.focus({ preventScroll: true });
    return;
  }
  const previous = modalLayer.contains(lastToolFocus) ? lastToolFocus : document.getElementById(lastToolFocus?.id ?? '');
  if (previous && modalLayer.contains(previous) && !previous.matches(':disabled')) previous.focus({ preventScroll: true });
  else if (!lastToolFocus?.dataset.act || !focusControl(modalLayer, lastToolFocus.dataset)) {
    modalLayer.querySelector('[data-act="close"]')?.focus({ preventScroll: true });
  }
}

function showDeskDialogue(surface) {
  if (run?.phase !== 'case' || !surface?.matches('.documents-surface, .sample-surface, .carton-surface')) return;
  const speech = hud.querySelector('.speech');
  const bar = surface.querySelector('.desk-surface-bar');
  if (!speech || !bar) return;
  const dialogue = document.createElement('div');
  dialogue.className = 'desk-dialogue';
  dialogue.setAttribute('aria-live', 'polite');
  const lines = speech.querySelectorAll('.speaker strong, :scope > p');
  for (const line of lines) dialogue.append(line.cloneNode(true));
  if (surface.classList.contains('first-documents')) bar.querySelector('h2').after(dialogue);
  else bar.after(dialogue);
}

function renderModal(item = windowCase(), step = item ? tutorialStep() : null) {
  const { compare, inspection, archiveFocus, archiveQuery, egg } = interaction;
  const binaryVerdicts = run?.binaryVerdicts ?? true;
  const correction = activeCorrection();
  const correctionFindings = correction ? selectedCorrectionFindings(correction, correctionDraft.keys) : null;
  const batchPapers = panel === 'archive' || panel === 'handoff' ? filedBatchPapers() : [];
  const supportingBasis = correction && filedCorrectionBasis(correction);
  const work = { ...interaction, binaryVerdicts, supplementRequest: run?.supplementRequestDraft };
  let markup = '';
  if (isWelcomePanel()) {
    markup = view.welcome(panel === 'welcome-project' ? 'project' : 'play', { binaryVerdicts });
  }
  if (panel === 'how' || panel === 'rules') markup = view.instructions(panel === 'how', { binaryVerdicts });
  if (panel === 'visit' && !arrival) {
    const visit = activeVisit();
    const doc = visitDocument(visit);
    if (doc) markup = view.visitPaper(doc, visit);
  }
  if (panel === 'docs' && item) markup = view.documents(item, viewedDocument(), compare, step, work, previousInspection(item));
  if (panel === 'sample' && item) markup = view.sample(item, inspection, step, work);
  if (panel === 'carton' && item?.carton) markup = view.carton(item, work);
  if (panel === 'archive' && run) {
    const sources = matchingReportSources(reportIndex ?? archiveQuery);
    const finished = run.phase === 'ending';
    const returnTo = archiveReturn?.panel ?? (finished ? 'ending' : null);
    const historyLabel = reviewedWeekLabel();
    const original = archivePaper && archivedPaper(archivePaper.id, archivePaper.index);
    markup = correction && run.phase === 'receipt' ? view.windowCorrection(correction, correctionFindings, supportingBasis)
      : original ? view.archiveSourcePaper(original, {
      returnTo: reportIndex ? 'report-index' : returnTo, historyLabel,
      fromDesk: toolsAvailableBetweenBatches() && !reportIndex && !returnTo,
    })
      : reportIndex && sources.length
      ? view.archiveReportPanel(reportIndex, sources, {
        returnTo, historyLabel, binaryVerdicts, fromInquiry: archiveFocus === TRACE_INQUIRY_KEY,
      })
      : view.archivePanel(archive(run, archiveQuery), filedSupportingPapers(archiveQuery, batchPapers), archiveFocus,
        archiveQuery, Boolean(correction), run.phase === 'handoff', finished, {
        returnTo, historyLabel, binaryVerdicts,
        unresolvedIssue: finished && getEnding(run).issues.some(({ id }) => id === archiveFocus),
        windowCorrection: !arrival && canRecheckReceipt(run, archiveFocus),
        reportSuggestion: !correction && sources.length > 1 ? sources[0].number : null,
        canComparePrevious: !archiveReturn && run.phase === 'case' && item && getPreviousReceipt(run, item)?.record.id === archiveFocus,
        correctionFindings: correctionFindings ?? [],
        batchPapers,
        supportingBasis,
      });
  }
  if (panel === 'handoff' && run?.phase === 'handoff') {
    const rows = archive(run).filter(({ record }) => record);
    const pair = handoffComparison(rows, handoffFocus);
    markup = view.handoffPanel(run, runEvidence(run), rows, {
      focus: handoffFocus, documentIndex: handoffDocument, correctionFindings, batchPapers, supportingBasis,
      canCompare: Boolean(pair), comparison: handoffPairOpen ? pair : null,
      traceReview: run.flags.traceDocument ? getTraceHandoffReview(run) : null,
    });
  }
  if (panel === 'egg' && EASTER_EGGS[egg]) markup = view.egg(egg, item?.id);
  if (panel === 'restart') markup = view.dialog('重新接班', `<p>开一周新的班会覆盖当前值班存档。</p><div class="modal-actions">${view.button('回到上周', 'close')}${view.button('开始新一周', 'start', 'primary')}</div>`);
  if (panel === 'completed-shifts' && !run) {
    const entries = Array.from(completedShifts, ([id, completed], index) => {
      const { title, counts } = getEnding(completed);
      return {
        id, title, counts, completedAt: completed.completedAt,
        binaryVerdicts: completed.binaryVerdicts,
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
      autoHandover: !receiptHeld,
      binaryVerdicts,
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
  const archiveIndexScroll = previousSurface?.querySelector('.drawer-list')?.scrollTop;
  const previousSearch = glancedPanel === 'archive' ? previousSurface?.querySelector('#archive-query') : null;
  const searchDraft = previousSearch && {
    query: previousSearch.defaultValue, value: previousSearch.value,
    start: previousSearch.selectionStart, end: previousSearch.selectionEnd, direction: previousSearch.selectionDirection,
  };
  const handoffIndexScroll = modalLayer.querySelector('.handoff-board')?.scrollTop;
  const handoffDetailScroll = modalLayer.querySelector('.handoff-detail-scroll')?.scrollTop;
  modalLayer.innerHTML = markup;
  const surface = modalLayer.querySelector('[data-desk-surface]');
  showDeskDialogue(surface);
  mountSampleImage(surface?.querySelector('[data-sample-art]') ??
    desktop.querySelector('.sample-preview:not([data-lifted]) [data-sample-art]'));
  if (receiptPrintTimer && surface?.matches('.receipt-surface')) {
    surface.querySelectorAll('button:not([data-act="hold-receipt"])').forEach((control) => { control.disabled = true; });
  }
  const archiveSearch = searchDraft && surface?.querySelector('#archive-query');
  if (archiveSearch && archiveSearch.defaultValue === searchDraft.query) {
    archiveSearch.value = searchDraft.value;
    archiveSearch.setSelectionRange(searchDraft.start, searchDraft.end, searchDraft.direction);
  }
  if (handoffIndexScroll !== undefined) modalLayer.querySelector('.handoff-board')?.scrollTo(0, handoffIndexScroll);
  if (handoffDetailScroll !== undefined) modalLayer.querySelector('.handoff-detail-scroll')?.scrollTo(0, handoffDetailScroll);
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
  const firstAction = modalLayer.querySelector('.welcome-modal .primary') ||
    surface?.querySelector('.receipt-surface :is([data-act="next"], [data-act="hold-receipt"]):enabled') || focusables.find((element) => element instanceof HTMLButtonElement &&
    element.dataset.act && !element.classList.contains('reference-control') &&
    !['close', 'toggle-findings', 'remove-finding', 'stamp'].includes(element.dataset.act));
  (glancedPanel ? windowGlance : restored || firstAction || focusables[0])?.focus({ preventScroll: true });
  if (surface && surface.dataset.deskSurface !== previousSurface?.dataset.deskSurface) {
    const object = surface.querySelector('.sheet, .sample-stage .sample-object, .receipt-slip');
    if (object?.classList.contains('receipt-slip')) {
      if (pendingReceiptPrint) {
        pendingReceiptPrint = false;
        animatePrintedReceipt(object);
      }
    } else if (object?.closest('.gauge-stage')) {
      animateOnDesk(object, [{ opacity: .62 }, { opacity: 1 }], 155);
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
    const archiveIndex = surface.querySelector('.drawer-list');
    if (archiveIndex && archiveIndexScroll !== undefined) archiveIndex.scrollTop = archiveIndexScroll;
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
  if (panel === 'handoff') return modalLayer.querySelector('.handoff-detail-scroll');
  if (panel === 'archive') return modalLayer.querySelector('.archive-surface .desk-surface-content');
  if (!panel && run?.phase === 'receipt' && !arrival) return modalLayer.querySelector('.receipt-surface .desk-surface-content');
  return null;
}

function reportWorkspaceContext(betweenBatches, handoffArchive = false) {
  if (!betweenBatches && !handoffArchive) return undefined;
  return { betweenBatches, handoffArchive, supportingKeys: new Set(filedSupportingPapers('').map(([key]) => key)) };
}

function persistRun() {
  if (!run || reviewingHistory) return;
  if (arrival && restoreNewerArrivalSave()) return;
  captureCorrectionScroll();
  const body = workspaceBody();
  const item = getCase(run);
  const betweenBatches = toolsAvailableBetweenBatches() && panel === 'archive';
  const boardWorkspace = recallPairReturn ?? currentHandoffWorkspace();
  const handoffArchive = Boolean(boardWorkspace && panel === 'archive' && archiveReturn?.panel === 'handoff');
  const lookup = reportWorkspace(run, {
    caseId: handoffArchive ? getDay(run)?.cases[run.index]?.id : item?.id,
    panel, reportIndex, archivePaper, archiveFocus: interaction.archiveFocus,
    archiveQuery: interaction.archiveQuery, archiveReturn, scrollTop: body?.scrollTop, scrollLeft: body?.scrollLeft,
  }, reportWorkspaceContext(betweenBatches, handoffArchive));
  const archived = panel === 'archive' && ['docs', 'sample'].includes(archiveReturn?.panel) ? archiveReturn : null;
  const context = body || archived ? workspaceContext() : undefined;
  const workspacePanel = archived?.panel ?? panel;
  const workspace = context ? {
    ...context, panel: workspacePanel, scrollTop: archived ? archived.scrollTop : body?.scrollTop ?? 0,
  } : undefined;
  saved = {
    ...run,
    ...(receiptHeld && run.phase === 'receipt' && !arrival ? { receiptHeld: true } : {}),
    ...(arrival ? { arrivalAction: arrival.action } : {}),
    ...(arrival?.stage === 'approach' ? { arrivalStage: arrival.stage } : {}),
    ...(betweenBatches && arrival.ready ? { arrivalReady: true } : {}),
    ...(correctionDraft && (run.phase === 'handoff' || (!arrival && canRecheckReceipt(run, correctionDraft.id))) ? { correctionDraft } : {}),
    ...(boardWorkspace ? { handoffWorkspace: boardWorkspace } : {}),
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
  const boardWorkspace = panel === 'handoff' ? saved?.handoffWorkspace : null;
  if (boardWorkspace) scrollTop = boardWorkspace.scrollTop;
  else if (activeCorrection()) scrollTop = saved?.correctionDraft?.scrollTop;
  if (!body || scrollTop === undefined) return;
  const sameColumn = !lookup || Math.abs(body.scrollLeft - lookup.scrollLeft) < 1;
  const board = boardWorkspace && modalLayer.querySelector('.handoff-board');
  const sameBoard = !board || Math.abs(board.scrollTop - boardWorkspace.boardScrollTop) < 1;
  if (Math.abs(body.scrollTop - scrollTop) < 1 && sameColumn && sameBoard) return;
  // Passive scroll saves must not replace newer progress from another tab.
  if (JSON.stringify(readStorage(SAVE_KEY)) === JSON.stringify(saved)) persistRun();
}

modalLayer.addEventListener('scroll', (event) => {
  if (event.target !== workspaceBody() && !(panel === 'handoff' && event.target.matches?.('.handoff-board'))) return;
  scheduleTutorialPointer();
  clearTimeout(workspaceScrollTimer);
  workspaceScrollTimer = setTimeout(persistWorkspaceScroll, 150);
}, { capture: true, passive: true });
modalLayer.addEventListener('focusin', (event) => {
  if (!glancedPanel && event.target !== windowGlance) lastToolFocus = event.target;
});
window.addEventListener('pagehide', persistWorkspaceScroll);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) persistWorkspaceScroll();
  syncReceiptHandover();
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

function openPanel(name, opener, scroll) {
  if (!panel && opener instanceof HTMLElement) modalOpener = { ...opener.dataset };
  const archiveParent = panel ?? (opener?.closest('.receipt-surface') ? 'receipt' : null);
  if (name === 'archive' && ['handoff', 'docs', 'sample', 'receipt'].includes(archiveParent)) {
    const body = workspaceBody();
    const index = panel === 'handoff' ? modalLayer.querySelector('.handoff-board') : body;
    archiveReturn = { panel: archiveParent, opener: { ...opener.dataset }, scrollTop: index?.scrollTop ?? 0, detailScroll: body?.scrollTop ?? 0,
      scrollLeft: body?.scrollLeft ?? 0 };
  } else if (name !== 'archive' || panel !== 'archive') {
    archiveReturn = null;
  }
  panel = name;
  render(scroll?.scrollTop, scroll?.scrollLeft);
}

function clearShiftTransientState() {
  cancelArrivalPause();
  cancelClosingShot();
  clearTimeout(receiptPrintTimer);
  receiptPrintTimer = 0;
  cancelReceiptHandover();
  clearTimeout(workspaceScrollTimer);
  workspaceScrollTimer = 0;
  issuedReceiptId = null;
  pendingReceiptPrint = false;
  receiptHeld = false;
  correctionDraft = null;
  presentedEvidence = null;
  recallPairReturn = null;
  reviewingHistory = false;
  historyNavigation = null;
}

function enter(restore) {
  clearShiftTransientState();
  let workspace;
  let arrivalAction;
  let resumeApproach = false;
  let lookup;
  let resumeWaitingTools = false;
  let visitorWaiting = false;
  if (restore && saved) {
    const { inspectionProgress, arrivalAction: savedArrival, arrivalStage: savedStage, arrivalReady,
      correctionDraft: _correctionDraft, handoffWorkspace: _handoffWorkspace, handoffPair: _handoffPair,
      reportWorkspace: savedLookup, receiptHeld: _receiptHeld, ...savedRun } = saved;
    arrivalAction = savedArrival;
    resumeApproach = savedStage === 'approach';
    run = restoreRun(savedRun.phase === 'ending' ? savedRun : { ...savedRun, binaryVerdicts: true });
    if (run.phase === 'handoff') update({ type: 'finish' }, false);
    const storedWorkspace = inspectionProgress?.workspace;
    const restoredWorkspace = storedWorkspace?.panel === 'phone' ? storedWorkspace.returnTo : storedWorkspace;
    const restored = restoreInspectionProgress({ ...inspectionProgress, workspace: restoredWorkspace }, getCase(run), run.seen, workspaceContext());
    ({ workspace, ...interaction } = restored);
    const betweenBatches = savedArrival === 'next' && run.phase === 'receipt' && Boolean(needsArrival(windowAdvance(savedArrival)));
    const savedArchive = savedLookup?.panel === 'phone' ? savedLookup.phoneReturn : savedLookup;
    if (savedArchive?.panel === 'archive') {
      lookup = reportWorkspace(run, { ...savedArchive, caseId: savedLookup.caseId }, reportWorkspaceContext(betweenBatches));
    }
    resumeWaitingTools = betweenBatches && Boolean(lookup);
    visitorWaiting = resumeWaitingTools && arrivalReady === true;
  } else {
    const lastCompleted = saved?.phase === 'ending' ? saved : completedShifts.values().next().value;
    const schedule = { schedule: COMPACT_SCHEDULE, binaryVerdicts: true, batchesPerDay: 4 };
    const newWeek = endings.length ? createFollowingRun(lastCompleted, undefined, schedule) : createRun(undefined, schedule);
    run = { ...newWeek, weekId: createWeekId() };
    interaction = freshInteraction();
  }
  panel = lookup?.panel ?? workspace?.panel ?? null;
  const step = tutorialStep();
  if (panel === 'sample' && (step?.key === 'label' || step?.paper)) panel = null;
  if (step && panel === 'docs') {
    readDocument(getCase(run)?.documents[viewedDocument()]);
  }
  if (panel === 'sample' && step?.key === 'pick-sample') takeTutorialSample();
  if (tutorialStep()?.key === 'sample' && interaction.inspection.tug) update({ type: 'tutorial', key: 'sample' }, false);
  modalOpener = panel === 'docs' ? { act: 'doc', i: String(viewedDocument()) }
    : panel ? { act: panel, fixture: panel } : null;
  archiveReturn = lookup?.archiveReturn?.panel === 'phone' ? null : lookup?.archiveReturn ?? null;
  reportIndex = lookup?.reportIndex ?? null;
  archivePaper = lookup?.archivePaper ?? null;
  if (lookup) {
    interaction.archiveFocus = lookup.archiveFocus;
    interaction.archiveQuery = lookup.archiveQuery;
  }
  handoffFocus = null;
  handoffDocument = null;
  handoffPairOpen = false;
  const next = windowAdvance(arrivalAction);
  if (needsArrival(next)) {
    if (!resumeWaitingTools) panel = null;
    pauseBeforeArrival(arrivalAction, next, true, {
      resumed: true, ready: visitorWaiting, approaching: resumeApproach,
      scrollTop: resumeWaitingTools ? lookup.scrollTop : undefined,
      scrollLeft: resumeWaitingTools ? lookup.scrollLeft : undefined,
    });
    return;
  }
  if (arrivalAction === 'next' && next) {
    panel = null;
    finishWindowAdvance(arrivalAction, true);
    return;
  }
  const resumeSound = { docs: 'paper', sample: 'slide', carton: 'slide' }[panel];
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

function handReceipt(restoreFocus) {
  if (panel || arrival || run?.phase !== 'receipt') return;
  const next = windowAdvance('next');
  if (!next) return;
  cancelReceiptHandover();
  archiveReturn = null;
  playSound(reducedMotion.matches ? 'paper' : 'handover');
  if (needsArrival(next) || !reducedMotion.matches) pauseBeforeArrival('next', next, restoreFocus);
  else finishWindowAdvance('next', restoreFocus);
}

function needsArrival(next) {
  return next && (next.phase === 'case' || activeVisit(next));
}

function restoreNewerArrivalSave() {
  const latest = readStorage(SAVE_KEY);
  if (!validRunSave(latest) || JSON.stringify(latest) === JSON.stringify(saved)) return false;
  saved = latest;
  enter(true);
  toast('已接续另一标签页的值班记录');
  return true;
}

function finishWindowAdvance(value, restoreFocus) {
  const action = windowAction(value);
  const visit = action?.type === 'ack-visit' ? activeVisit() : null;
  if (!action || !update(action, false)) return;
  if (action.type === 'next' && ['summary', 'handoff', 'ending'].includes(run.phase)) playSound('bell');
  if (visit) {
    interaction.archiveFocus = visit.key;
    interaction.archiveQuery = '';
    if (visit.kind === 'recall') {
      const confirmed = run.records.find(({ id }) => id === visit.caseId)?.status === 'recalled';
      const returnPair = recallPairReturn;
      recallPairReturn = null;
      if (!confirmed) toast('这份回执需要再核对');
      if (returnPair && restoreHandoffWorkspace(handoffWorkspace(run, returnPair, filedBatchPapers()))) {
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
  if (restoreNewerArrivalSave()) return;
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
  arrival.approachStartedAt = performance.now();
  arrival.next = next;
  arrival.keepVisitor &&= visitorAt(next) === visitorAt(run);
  arrival.approach = arrivalApproach(next);
  arrivalTimer = setTimeout(() => {
    if (restoreNewerArrivalSave()) return;
    cancelArrivalPause();
    finishWindowAdvance(action, restoreFocus);
  }, ARRIVAL_APPROACH_MS);
  const alreadyAtWindow = arrival.ready || arrival.keepVisitor || (run.phase === 'brief' && arrival.approach.npc === 'zhou');
  playSound(alreadyAtWindow ? 'delivery' : 'arrival');
  render();
}

function pauseBeforeArrival(action, next, restoreFocus, { resumed = false, ready = false, approaching = false, scrollTop, scrollLeft } = {}) {
  if (!panel) modalOpener = null;
  const npc = visitorAt(next);
  const hasVisitor = Boolean(needsArrival(next));
  const handingReceipt = action === 'next' && !resumed && !reducedMotion.matches;
  arrival = {
    action, restoreFocus, stage: 'waiting', keepVisitor: !resumed && npc !== null && npc === visitorAt(run),
    approach: arrivalApproach(next), hasVisitor, nextPhase: next.phase, handingReceipt, ready,
  };
  if (ready) {
    render(scrollTop, scrollLeft);
    return;
  }
  if (approaching || (action === 'start-day' && activeVisit(next)?.kind !== 'rework')) {
    beginWindowApproach();
    return;
  }
  const firstBreak = run.day === 0 && run.index === 0;
  const duration = action === 'next' ? (firstBreak || waitingRegister() ? LONG_BATCH_PAUSE_MS : NEXT_BATCH_PAUSE_MS)
    : action === 'ack-visit' ? VISIT_HANDOVER_MS : ARRIVAL_PAUSE_MS;
  const advance = () => {
    arrivalTimer = 0;
    if (restoreNewerArrivalSave()) return;
    if (panel && toolsAvailableBetweenBatches()) {
      arrival.ready = true;
      renderArrivalStatus();
      syncWindowGlance();
      setScene();
      playSound('knock');
      persistRun();
    } else beginWindowApproach();
  };
  if (handingReceipt) {
    const record = run.records.at(-1);
    const route = receiptDisposition(record);
    const travel = cargoRoutes.has(route) ? CARGO_DEPARTURE_MS : 0;
    const wait = hasVisitor ? duration - ARRIVAL_APPROACH_MS - RECEIPT_HANDOVER_MS : travel;
    arrivalTimer = setTimeout(() => {
      if (restoreNewerArrivalSave()) return;
      arrival.handingReceipt = false;
      if (travel) playSound('cargo', route);
      renderArrivalStatus();
      syncWindowGlance();
      setScene();
      arrivalTimer = setTimeout(advance, wait);
    }, RECEIPT_HANDOVER_MS);
  } else arrivalTimer = setTimeout(advance, duration - ARRIVAL_APPROACH_MS);
  render(scrollTop, scrollLeft);
}

function readDocument(doc) {
  if (doc && tutorialStep()?.key === 'label') update({ type: 'tutorial', key: 'label' }, false);
}

function chooseDoc(index, opener, single = false) {
  const item = run?.phase === 'case' ? windowCase() : null;
  const doc = item?.documents[index];
  if (!doc) return;
  if (panel === 'sample' && !tutorialStep()) {
    interaction.referenceDoc = index;
    playSound('paper');
    render();
    return;
  }
  interaction.lastReadDoc = index;
  interaction.clipboardBack = false;
  interaction.deliveryCheck = null;
  interaction.relabelCheck = null;
  if (panel === 'docs' && interaction.previousDoc !== null) {
    interaction.previousCurrentDoc = index;
  } else if (!single && panel === 'docs' && interaction.compare !== null && !interaction.spreadAll) {
    if (index !== interaction.doc) interaction.compare = index;
  } else {
    interaction.spreadAll = !panel && item.documents.length > 1;
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
  if (interaction.thicknessOpen && !thicknessComparison(windowCase(), interaction.inspection, findings)) {
    interaction.thicknessOpen = false;
  }
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

function presentFinding(key, opener) {
  const fromTool = ['docs', 'sample'].includes(panel) && modalLayer.contains(opener);
  const fromDesk = !panel && interaction.benchFindingsOpen && desktop.contains(opener);
  if (run?.phase !== 'case' || glancedPanel || (!fromTool && !fromDesk)) return;
  const item = windowCase();
  const finding = interaction.findings.find((entry) => entry.key === key);
  if (!finding || !canShowFinding(item, finding)) return;
  const body = fromTool ? workspaceBody() : null;
  const scroll = desktop.querySelector('.bench-draft-body')?.scrollTop ?? 0;
  if (!update({ type: 'show-finding', finding }, false)) return;
  presentedEvidence = run.shownFinding;
  toast('');
  playSound('slide');
  render(body?.scrollTop, body?.scrollLeft);
  if (fromTool) {
    const control = focusControl(modalLayer, opener.dataset);
    control?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  } else {
    desktop.querySelector('.bench-draft-body')?.scrollTo(0, scroll);
    focusControl(desktop, { act: 'show-finding', key });
  }
  if (root.dataset.modeled !== 'true' && !reducedMotion.matches) {
    const room = roomHost.parentElement;
    room.querySelector('.evidence-transfer')?.remove();
    const slip = document.createElement('span');
    slip.className = 'evidence-transfer';
    slip.setAttribute('aria-hidden', 'true');
    slip.textContent = item.batch;
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
  if (panel === 'docs') interaction.lastReadDoc = index;
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

function captureCorrectionScroll() {
  if (!activeCorrection()) return;
  correctionDraft.scrollTop = workspaceBody()?.scrollTop ?? 0;
  correctionDraft.fromBoard = panel === 'handoff';
  correctionDraft.documentIndex = panel === 'handoff' ? handoffDocument : null;
  if (archiveReturn?.panel === 'receipt') correctionDraft.receiptScrollTop = archiveReturn.scrollTop;
}

function focusHandoffCitation() {
  const row = activeCorrection();
  const citation = row && filedCorrectionBasis(row);
  if (citation && citation.kind === handoffDocument && correctionDraft.keys.includes(citation.finding.key)) {
    focusControl(modalLayer, { act: 'correction-remove', key: citation.finding.key });
  }
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

function spreadDocuments() {
  const item = documentCheckItem();
  if (!item || item.documents.length < 2 || interaction.previousDoc !== null ||
      interaction.deliveryCheck !== null || interaction.relabelCheck !== null) return;
  interaction.spreadAll = true;
  playSound('slide');
  render(0);
  focusControl(modalLayer, { act: 'doc-focus', i: String(interaction.doc) });
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
    spreadAll: false, previousDoc: null, previousCurrentDoc: null, clipboardBack: false, lastReadDoc: left });
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
  interaction.lastReadDoc = right;
  const documents = windowCase()?.documents;
  readDocument(documents?.[left]);
  readDocument(documents?.[right]);
  playSound('slide');
  openPanel('docs', opener);
}

function recordDocumentComparison(kind, documentIndex, target) {
  const item = documentCheckItem();
  if (!item) return;
  let comparison;
  if (kind === 'delivery-evidence') {
    comparison = intakeComparison(item, documentIndex);
    if (interaction.deliveryCheck !== documentIndex) {
      const { heldDocuments } = heldObjects(item);
      if (!comparison || interaction.deliveryCheck !== null || item.documents.length !== 2 ||
          !heldDocuments.includes(0) || !heldDocuments.includes(1)) return;
      interaction.deliveryCheck = documentIndex;
    }
  } else if (kind === 'relabel-evidence') {
    if (interaction.previousDoc !== null || interaction.deliveryCheck !== null) return;
    comparison = relabelComparison(item, documentIndex)?.pairs.find(({ side }) => side === target);
    if (comparison && interaction.relabelCheck !== documentIndex) {
      const { heldDocuments } = heldObjects(item);
      if (!heldDocuments.includes(documentIndex) || !heldDocuments.includes(comparison.paperIndex)) return;
    }
  } else {
    if (interaction.deliveryCheck !== null || interaction.previousDoc !== null) return;
    const reportIndex = Number(target);
    const { heldDocuments } = heldObjects(item);
    if (!heldDocuments.includes(documentIndex) || !heldDocuments.includes(reportIndex)) return;
    comparison = projectComparison(item, documentIndex, reportIndex);
  }
  if (!comparison) return;
  const recorded = toggleFinding(comparison.finding);
  interaction.lastReadDoc = documentIndex;
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

function carryDocumentsToTool() {
  interaction.returnToDocs = panel === 'docs' && !tutorialStep();
  const papers = interaction.returnToDocs ? workspaceBody() : null;
  interaction.documentsScroll = papers ? { scrollTop: papers.scrollTop, scrollLeft: papers.scrollLeft } : null;
}

function takeTutorialSample() {
  if (!update({ type: 'tutorial', key: 'pick-sample' }, false)) return;
  interaction.inspection = freshInteraction().inspection;
  interaction.filmChecked = false;
}

function openSample(opener) {
  const item = windowCase();
  if (run?.phase !== 'case' || !item) return;
  const step = tutorialStep();
  if (step?.key === 'label' || step?.paper) {
    toast(step.paper ? '跟着亮处核完单据，再拿检样。' : '先拿起桌上的箱签。');
    return;
  }
  if (step?.key === 'pick-sample') takeTutorialSample();
  carryDocumentsToTool();
  interaction.referenceDoc = null;
  if (interaction.returnToDocs) {
    const { lastReadDoc } = interaction;
    const { heldDocuments } = heldObjects(item);
    const source = Number(opener?.dataset.i);
    if (item.sample.reading && opener?.dataset.key === 'thickness' && heldDocuments.includes(source)) {
      interaction.lastReadDoc = source;
      interaction.thicknessOpen = Boolean(thicknessComparison(item, interaction.inspection, interaction.findings));
    } else {
      interaction.referenceDoc = Number.isInteger(lastReadDoc) && heldDocuments.includes(lastReadDoc) ? lastReadDoc : viewedDocument();
    }
  }
  playSound('slide');
  openPanel('sample', opener);
}

function checkCarton(action, opener, rotationFrom) {
  const item = windowCase();
  if (run?.phase !== 'case' || !item?.carton) return;
  if (action === 'carton') {
    if (panel && panel !== 'docs') return;
    carryDocumentsToTool();
    if (interaction.returnToDocs) {
      const source = Number(opener.dataset.i);
      interaction.lastReadDoc = heldObjects(item).heldDocuments.includes(source) ? source : viewedDocument();
    }
    playSound('slide');
    openPanel('carton', opener);
    return;
  }
  if (panel !== 'carton') return;
  if (action === 'carton-turn') {
    const previous = modalLayer.querySelector('.carton-cube');
    const from = rotationFrom ?? (previous && getComputedStyle(previous).transform);
    interaction.cartonBottom = !interaction.cartonBottom;
    playSound('slide');
    render();
    const cube = modalLayer.querySelector('.carton-cube');
    if (from && cube) animateOnDesk(cube, [{ transform: from }, { transform: getComputedStyle(cube).transform }], 235);
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
  const item = getCase(run);
  const documents = item?.documents;
  if (!documents?.length) return;
  const fromThickness = interaction.thicknessOpen;
  interaction.thicknessOpen = false;
  if (interaction.referenceDoc !== null && !fromThickness) {
    interaction.referenceDoc = null;
  } else if (interaction.referenceDoc === null) {
    const report = documents.findIndex((doc) => doc.type === 'report');
    const sketch = documents.findIndex((doc) => doc.kind === 'mold-sketch');
    const order = documents.findIndex((doc) => doc.type === 'order');
    const references = item.sample.model ? [sketch, order, report] : [sketch, report, order];
    interaction.referenceDoc = interaction.returnToDocs ? viewedDocument() : references.find((index) => index >= 0) ?? 0;
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
  const step = tutorialStep();
  const waitingForClasp = step && step.key !== 'sample' && step.key !== 'stamp';
  const flip = act === 'sample-flip' || act === 'sample-lens';
  const packed = spec.kind === 'yellow' && !sample.unpacked;
  const inGauge = sampleInGauge(spec, sample);
  const previousJaw = act === 'sample-gauge-clamp' && modalLayer.querySelector('.gauge-moving-jaw');
  const jawFrom = previousJaw ? getComputedStyle(previousJaw).transform : null;
  const previousFilm = act === 'sample-film' && modalLayer.querySelector('.sample-film-sheet');
  const previousFold = previousFilm ? getComputedStyle(previousFilm).transform : null;
  let sound = 'slide';
  switch (act) {
    case 'sample-image-retry':
      retrySampleImage(modalLayer.querySelector('.sample-stage'));
      return;
    case 'sample-lens':
      if (step?.key !== 'lens' || sample.back) return;
      sample.back = true;
      update({ type: 'tutorial', key: 'lens' }, false);
      break;
    case 'sample-flip':
      if (packed || inGauge || step?.key === 'lens' || (step?.key === 'film' && !sample.back)) return;
      sample.back = !sample.back;
      break;
    case 'sample-film':
      if (sample.back || !['film', 'crack'].includes(spec.kind)) return;
      sample.film = !sample.film;
      if (item.id === 2 && sample.film) {
        interaction.filmChecked = true;
        if (step?.key === 'film') update({ type: 'tutorial', key: 'film' }, false);
      }
      break;
    case 'sample-clasp':
      if (waitingForClasp || !sample.back || sample.clasp || !sampleAppearance(spec).clasp) return;
      sample.clasp = true;
      sound = 'clasp';
      break;
    case 'sample-clasp-test':
      if (step?.key !== 'sample' || !sample.back || sample.tug || !sampleAppearance(spec).clasp) return;
      sample.clasp = true;
      sample.tug = true;
      sound = 'tug';
      update({ type: 'tutorial', key: 'sample' }, false);
      break;
    case 'sample-tug':
      if (waitingForClasp || !sample.back || !sample.clasp || sample.tug || !sampleAppearance(spec).clasp) return;
      sample.tug = true;
      sound = ['loose', 'broken'].includes(spec.kind) ? 'claspRelease' : 'tug';
      if (step?.key === 'sample') update({ type: 'tutorial', key: 'sample' }, false);
      break;
    case 'sample-measure':
      if (!spec.reading || sample.measured) return;
      sample.gaugeLoaded = !inGauge;
      sample.measured = false;
      if (!thicknessComparison(item, sample, interaction.findings)) interaction.thicknessOpen = false;
      break;
    case 'sample-gauge-clamp': {
      if (!inGauge) return;
      sample.gaugeLoaded = true;
      sample.measured = !sample.measured;
      const comparison = thicknessComparison(item, sample, interaction.findings);
      if (sample.measured && !step) interaction.thicknessOpen = Boolean(comparison);
      else if (!comparison) interaction.thicknessOpen = false;
      sound = sample.measured ? 'clasp' : 'click';
      break;
    }
    case 'sample-thickness':
      if (tutorialStep() || !thicknessComparison(item, sample, interaction.findings)) return;
      interaction.thicknessOpen = !interaction.thicknessOpen;
      sound = 'paper';
      break;
    case 'sample-model-basis': {
      const comparison = !step && modelComparison(item, sample);
      if (!comparison) return;
      const recorded = toggleFinding(comparison.finding);
      sound = 'paper';
      toast(recorded ? '已记下型号对照' : '已取回型号对照');
      break;
    }
    case 'sample-mold-basis': {
      const comparison = !step && moldComparison(item, sample, interaction.referenceDoc);
      if (!comparison) return;
      const recorded = !interaction.findings.some(({ key }) => key === comparison.finding.key);
      if (recorded) {
        const { observation, finding } = comparison;
        const otherFindings = interaction.findings.filter(({ key, source, text }) =>
          key !== observation.key || source !== observation.source || text !== observation.text);
        updateFindings([...otherFindings, finding]);
      } else toggleFinding(comparison.finding);
      sound = 'paper';
      toast(recorded ? '已记下线位对照' : '已取回线位对照');
      break;
    }
    case 'sample-thickness-basis': {
      if (tutorialStep() || !interaction.thicknessOpen) return;
      const comparison = thicknessComparison(item, sample, interaction.findings);
      if (!comparison) return;
      const recorded = !interaction.findings.some(({ key }) => key === comparison.finding.key);
      if (recorded) {
        const measurement = sampleFinding(spec, { measured: true });
        const otherFindings = interaction.findings.filter(({ key, source, text }) =>
          key !== measurement.key || source !== measurement.source || text !== measurement.text);
        updateFindings([...otherFindings, comparison.finding]);
      } else toggleFinding(comparison.finding);
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
      if (inGauge && !sample.measured) return;
      const recorded = toggleFinding(sampleFinding(spec, sample));
      sound = 'paper';
      toast(recorded ? '已记下检样结果' : '已取回这条查验依据');
      break;
    }
  }
  playSound(sound);
  render();
  if (act === 'sample-basis') modalLayer.querySelector('.sample-surface .evidence-show-control')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  if (act === 'sample-measure' && sample.gaugeLoaded) focusControl(modalLayer, { act: 'sample-gauge-clamp' });
  if (act === 'sample-gauge-clamp' && !sample.measured) focusControl(modalLayer, { act: 'sample-measure' });
  if (flip && sample.back && tutorialStep()?.key === 'sample') focusControl(modalLayer, { act: 'sample-clasp-test' });
  if (act === 'sample-clasp-test') {
    modalLayer.querySelector('[data-guide-target="stamp-choice"]')?.focus({ preventScroll: true });
  }
  if (interaction.thicknessOpen && (act === 'sample-thickness' || (act === 'sample-gauge-clamp' && sample.measured))) {
    modalLayer.querySelector('.sample-inspector')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  const graphic = modalLayer.querySelector('.sample-stage .sample-object');
  if (act === 'sample-gauge-clamp' && jawFrom) {
    const jaw = modalLayer.querySelector('.gauge-moving-jaw');
    const jawDuration = 170;
    if (jaw) animateOnDesk(jaw, [{ transform: jawFrom }, { transform: getComputedStyle(jaw).transform }], jawDuration);
    if (sample.measured) {
      for (const element of modalLayer.querySelectorAll('.gauge-display, .sample-findings .reading, .thickness-comparison, .thickness-check')) {
        animateOnDesk(element, [{ visibility: 'hidden' }, { visibility: 'hidden' }], jawDuration);
      }
    }
  } else if (flip) {
    const face = spec.reading || act === 'sample-lens' ? graphic?.querySelector('img') : graphic;
    animateOnDesk(face, [{ transform: 'perspective(600px) rotateY(-57deg)', opacity: .8 }, { transform: 'perspective(600px) rotateY(0deg)', opacity: 1 }], 220);
  } else if (act === 'sample-film' && previousFold) {
    const film = modalLayer.querySelector('.sample-film-sheet');
    if (film) animateOnDesk(film, [{ transform: previousFold }, { transform: getComputedStyle(film).transform }], 225);
  } else if (act === 'sample-clasp-test') {
    animateOnDesk(graphic, [{ translate: '0 0' }, { translate: '.18rem 0' }, { translate: '0 0' }], 210);
  } else if (act === 'sample-unpack') {
    animateOnDesk(graphic, [{ translate: '0 .38rem', opacity: .7 }, { translate: '0 0', opacity: 1 }], 210);
  }
}

function atStampMachine() {
  return !glancedPanel && (!panel || ['docs', 'sample', 'carton'].includes(panel));
}

function stamp(value) {
  if (arrival || activeVisit() || run?.phase !== 'case') return;
  if (deskPress) return;
  if (drag || toolDrag) {
    toast('先把手里的东西放回台面');
    return;
  }
  if (!atStampMachine()) {
    if (panel === 'archive') toast('先回到台面，再用开单机盖章');
    return;
  }
  const step = tutorialStep();
  if (step && step.key !== 'stamp') {
    toast(tutorialPointerTarget()?.dataset.guideCue ?? '先跟老周查完这批');
    return;
  }
  if (update({ type: 'stamp', value, note: interaction.note, findings: interaction.findings }, false)) {
    panel = null;
    modalOpener = null;
    receiptHeld = false;
    beginReceiptPrint(run.records.at(-1).id);
    clearTimeout(toastTimer);
    toastBox.textContent = '';
    playSound('print', value);
    render();
    scenery?.setPressed?.(value);
  }
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

function matchingReportSources(number) {
  if (interaction.archiveFocus === TRACE_INQUIRY_KEY) {
    const inquiry = getTraceInquiry(run);
    if (inquiry?.sources[0]?.number === number) return inquiry.sources;
  }
  return archivedReportSources(run, number);
}

function openReportIndex(number, opener) {
  const sources = matchingReportSources(number);
  if (!sources.length) return;
  const current = panel === 'docs' || panel === 'sample' ? windowCase()?.id : interaction.archiveFocus;
  const target = sources.find(({ id }) => id === current) ?? sources.at(-1);
  if (current !== TRACE_INQUIRY_KEY || target.number !== getTraceInquiry(run)?.sources[0]?.number) focusArchiveRow(target.id);
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
  return { id, index, batch: row.batch, day: row.day, document };
}

function openArchivePaper(id, index) {
  if (!run || !Number.isInteger(index)) return;
  if (panel === 'archive' && reportIndex && !archivePaper) {
    if (!matchingReportSources(reportIndex).some((source) => source.id === id && source.index === index)) return;
    const body = workspaceBody();
    archivePaper = { id, index, scrollTop: body?.scrollTop ?? 0, scrollLeft: body?.scrollLeft ?? 0 };
    playSound('paper');
    render(0);
  }
}

function openRetainedRegister(opener) {
  if (panel || !toolsAvailableBetweenBatches()) return;
  const paper = waitingRegister();
  if (!paper) return;
  focusArchiveRow(paper.id);
  interaction.archiveQuery = '';
  archivePaper = { id: paper.id, index: paper.index, scrollTop: 0, scrollLeft: 0 };
  playSound('paper');
  openPanel('archive', opener);
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
      ?? (run.schedule === COMPACT_SCHEDULE ? current.find(({ id }) => id === 14) : null)
      ?? current.find(({ record }) => record.status === 'shipping') ?? current[0])?.id ?? null;
  }
  playSound('paper');
  openPanel('handoff', opener);
  revealHandoffSelection();
}

function currentHandoffWorkspace() {
  if (run?.phase !== 'handoff' || handoffFocus === null) return null;
  const parent = panel === 'archive' && archiveReturn?.panel === 'handoff' ? archiveReturn : null;
  if (panel !== 'handoff' && !parent) return null;
  return {
    id: handoffFocus,
    documentIndex: handoffDocument,
    comparing: handoffPairOpen,
    scrollTop: parent?.detailScroll ?? workspaceBody()?.scrollTop ?? 0,
    boardScrollTop: parent?.scrollTop ?? modalLayer.querySelector('.handoff-board')?.scrollTop ?? 0,
  };
}

function pairForRecall(workspace, caseId) {
  if (workspace?.comparing !== true || run?.phase !== 'handoff') return null;
  const comparison = handoffComparison(archive(run), workspace.id);
  return comparison && [comparison.earlier.id, comparison.later.id].includes(caseId) ? workspace : null;
}

function restoreHandoffWorkspace(workspace, archiveView) {
  if (!workspace || run?.phase !== 'handoff' || activeVisit()) return false;
  const editingSelected = correctionDraft?.id === workspace.id;
  if (!archiveView && workspace.comparing && editingSelected) return false;
  panel = archiveView ? 'archive' : 'handoff';
  modalOpener = { act: 'handoff' };
  handoffFocus = workspace.id;
  handoffDocument = workspace.documentIndex;
  handoffPairOpen = workspace.comparing && !editingSelected;
  playSound('paper');
  if (archiveView) {
    archiveReturn = { ...archiveView.archiveReturn, scrollTop: workspace.boardScrollTop, detailScroll: workspace.scrollTop };
    render(archiveView.scrollTop, archiveView.scrollLeft);
  } else {
    render(workspace.scrollTop, 0, workspace.boardScrollTop);
    focusHandoffCitation();
  }
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
  handoffDocument = documentIndex === 'receipt' ? null
    : hasHandoffDocument(row, documentIndex, filedBatchPapers()) ? documentIndex : draft?.documentIndex ?? null;
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

function isWelcomePanel() {
  return panel === 'welcome-project' || panel === 'welcome-play';
}

function closePanel({ receiveWaiting = false } = {}) {
  const leftWelcome = isWelcomePanel();
  captureCorrectionScroll();
  if (panel === 'carton' && interaction.returnToDocs && windowCase()?.carton) {
    playSound('paper');
    openPanel('docs', null, interaction.documentsScroll);
    focusControl(modalLayer, { act: 'carton', i: String(interaction.lastReadDoc) });
    return;
  }
  if (!receiveWaiting && panel === 'archive' && reportIndex && archivePaper) {
    const { id, index, scrollTop, scrollLeft } = archivePaper;
    archivePaper = null;
    playSound('paper');
    render(scrollTop);
    workspaceBody()?.scrollTo(scrollLeft, scrollTop);
    focusControl(modalLayer, { act: 'report-index-paper', i: String(id), doc: String(index) });
    return;
  }
  const previousPanel = !receiveWaiting && run && panel === 'archive' ? archiveReturn : null;
  const toReceipt = previousPanel?.panel === 'receipt';
  if (toReceipt && activeCorrection()) correctionDraft = null;
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
  render(toBoard ? previousPanel.detailScroll : previousPanel?.scrollTop, 0, toBoard ? previousPanel.scrollTop : undefined);
  if (leftWelcome && document.activeElement === document.body) screenLayer.querySelector('.primary')?.focus({ preventScroll: true });
  if (previousPanel) {
    if (!toBoard) {
      const body = workspaceBody();
      if (body) body.scrollLeft = previousPanel.scrollLeft ?? 0;
      else modalLayer.querySelector('.modal-body')?.scrollTo(0, previousPanel.scrollTop);
    }
    if (previousPanel.opener) focusControl(modalLayer, previousPanel.opener);
  } else if (run?.phase === 'summary' && document.activeElement === document.body) focusControl(screenLayer, { act: 'advance-day' });
}

root.addEventListener('click', (event) => {
  const pointerClick = Boolean(event.pointerType) || event.detail > 0;
  if (suppressDeskClick && pointerClick) return;
  const target = event.target.closest('[data-act]');
  if (!target || target.matches(':disabled')) return;
  if (target === toolClickTarget && pointerClick) return;
  const { act, key } = target.dataset;
  const index = Number(target.dataset.i);
  if (!run?.binaryVerdicts && target.closest('.receipt-surface') && act !== 'next') receiptHeld = true;
  if (act.startsWith('sample-')) { checkSample(act); return; }
  switch (act) {
    case 'carton': case 'carton-turn': case 'carton-note': checkCarton(act, target); break;
    case 'window-glance': toggleWindowGlance(); break;
    case 'receive-waiting':
      if (target === windowGlance && arrival?.ready && toolsAvailableBetweenBatches()) {
        arrival.restoreFocus = true;
        closePanel({ receiveWaiting: true });
      }
      break;
    case 'how': openPanel(run ? act : 'welcome-play', target); break;
    case 'rules': openPanel(act, target); break;
    case 'welcome-project': case 'welcome-play':
      if (!run) openPanel(act, target);
      break;
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
      clearShiftTransientState();
      run = null;
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
      if (needsArrival(next)) pauseBeforeArrival(act, next, event.detail === 0);
      else finishWindowAdvance(act, event.detail === 0);
      break;
    }
    case 'advance-day': playSound('paper'); update({ type: 'advance-day' }); break;
    case 'hold-receipt': render(); break;
    case 'receipt-basis': {
      render();
      const facts = modalLayer.querySelector('.receipt-surface .receipt-findings');
      if (!facts || !target.closest('.receipt-surface')) break;
      facts.tabIndex = -1;
      facts.focus({ preventScroll: true });
      facts.scrollIntoView({ block: 'start', inline: 'nearest' });
      break;
    }
    case 'retained-register': openRetainedRegister(target); break;
    case 'visit-paper':
      if (!arrival && visitDocument(activeVisit())) {
        playSound('paper');
        openPanel('visit', target);
      }
      break;
    case 'next': handReceipt(event.detail === 0); break;
    case 'event-next':
    case 'receive-recall': {
      if (act === 'event-next' && (panel !== 'visit' || key !== activeVisit()?.key)) break;
      const action = act === 'receive-recall' ? { type: act, id: index } : 'ack-visit';
      const next = !arrival && windowAdvance(action);
      if (!next) break;
      if (act === 'receive-recall') {
        recallPairReturn = pairForRecall(currentHandoffWorkspace(), index);
        toast('');
      }
      captureCorrectionScroll();
      panel = null;
      archiveReturn = null;
      playSound('paper');
      if (needsArrival(next)) pauseBeforeArrival(action, next, event.detail === 0);
      else finishWindowAdvance(action, event.detail === 0);
      break;
    }
    case 'doc':
      if (run && (!pointerClick || !target.matches('#desk [data-drag="paper"]'))) chooseDoc(index, target);
      break;
    case 'tutorial-paper':
      if (panel === 'docs' && tutorialStep()?.paper && update({ type: 'tutorial', key }, false)) {
        playSound('click');
        render();
      }
      break;
    case 'doc-focus':
      if (panel !== 'docs') break;
      chooseDoc(index, target, true);
      focusControl(modalLayer, { act: 'doc', i: String(index) });
      break;
    case 'reference-doc': if (run) chooseDoc(index, target); break;
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
    case 'show-finding': presentFinding(key, target); break;
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
    case 'sample':
      if (!pointerClick || !target.matches('#desk .sample-preview')) openSample(target);
      break;
    case 'reference': toggleReference(); break;
    case 'reference-back':
      if (panel === 'sample' && interaction.returnToDocs) {
        playSound('paper');
        openPanel('docs', target, interaction.documentsScroll);
        const source = String(interaction.lastReadDoc);
        focusControl(modalLayer, { act: 'sample', key: 'thickness', i: source }) || focusControl(modalLayer, { act: 'sample' });
      }
      break;
    case 'stamp': if (!pointerClick) stamp(key); break;
    case 'archive': if (run) openArchive(target); break;
    case 'report-search': openReportIndex(key, target); break;
    case 'report-index-paper': openArchivePaper(index, Number(target.dataset.doc)); break;
    case 'report-index-back':
      if (panel === 'archive' && reportIndex) {
        const fromInquiry = interaction.archiveFocus === TRACE_INQUIRY_KEY;
        const number = reportIndex;
        reportIndex = null;
        archivePaper = null;
        playSound('paper');
        render();
        revealArchiveReceipt(true);
        if (fromInquiry) focusControl(modalLayer, { act: 'report-search', key: number });
      }
      break;
    case 'archive-receipt': {
      if (!run?.seen.includes(index)) break;
      focusArchiveRow(index);
      interaction.archiveQuery = '';
      openArchive(target);
      revealArchiveReceipt(true);
      break;
    }
    case 'archive-focus': case 'archive-followup': case 'archive-evidence':
      if (act === 'archive-evidence' && !panel) {
        const fromReceipt = target.closest('.receipt-surface') && filedWindowSupplement()?.key === key;
        const fromEnding = run?.phase === 'ending' && target.closest('.ending-card') &&
          filedSupportingPapers('').some(([source]) => source === key);
        if (!fromReceipt && !fromEnding) break;
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
    case 'edit-receipt':
      if (!panel && target.closest('.receipt-surface') && !arrival && canRecheckReceipt(run, index)) {
        focusArchiveRow(index);
        interaction.archiveQuery = '';
        correctionDraft = { id: index, keys: [], fromBoard: false, documentIndex: null, scrollTop: 0 };
        openArchive(target);
      }
      break;
    case 'edit-record': {
      if (panel === 'handoff' && handoffPairOpen) break;
      const citeTrace = key === 'trace' && panel === 'handoff' && (handoffFocus === 'attachments' ||
        (handoffFocus === TRACE_CASE_ID && handoffDocument === 'trace'));
      const citeException = key === 'exception' && panel === 'handoff' && handoffDocument === 'exception';
      const row = correctableRow(citeTrace ? TRACE_CASE_ID : correctionFocus());
      if (!row || (citeException && row.record.status !== 'shipped')) break;
      const citation = (citeTrace || citeException) && filedCorrectionBasis(row);
      if (key && citation?.kind !== key) break;
      const editing = !citation && activeCorrection();
      if (editing) correctionDraft = null;
      else {
        const fromBoard = panel === 'handoff';
        if (citation) {
          handoffFocus = row.id;
          handoffDocument = citation.kind;
        } else if (fromBoard && handoffDocument === null && row.documents.length) {
          handoffDocument = row.id === TRACE_CASE_ID && hasHandoffDocument(row, 'trace', filedBatchPapers()) ? 'trace' : 0;
        }
        const previousKeys = correctionDraft?.id === row.id ? correctionDraft.keys : [];
        const keys = citation ? [...new Set([...previousKeys, citation.finding.key])] : [];
        correctionDraft = { id: row.id, keys, fromBoard, documentIndex: fromBoard ? handoffDocument : null, scrollTop: 0 };
      }
      playSound('paper');
      render(!editing && (panel === 'handoff' || run.phase === 'receipt') ? 0 : undefined);
      if (citation) {
        revealHandoffSelection();
        focusControl(modalLayer, { act: 'correction-remove', key: citation.finding.key });
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
          beginReceiptPrint(row.id);
          toast('');
          closePanel();
          if (!receiptPrintTimer) focusControl(modalLayer, { act: 'next' });
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
        playSound(atWindow ? 'print' : 'stamp');
        if (!atWindow && !needsRecall) toast('更正已留底');
      }
      break;
    }
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
      if (!row || (documentIndex !== null && !hasHandoffDocument(row, documentIndex, filedBatchPapers())) || handoffDocument === documentIndex) break;
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

function isDeskControlHit(button, event) {
  return button.isConnected && !button.disabled && button.contains(document.elementFromPoint(event.clientX, event.clientY));
}

function beginDeskPress(event) {
  if (deskPress) {
    if (event.pointerId !== deskPress.pointerId) cancelDeskPress();
    return;
  }
  const button = event.target.closest('#desk :is([data-act="stamp"], .sample-preview):enabled, .work-stamp-machine [data-act="stamp"]:enabled, .sample-surface .gauge-clamp:enabled');
  if (!button || event.button !== 0 || !event.isPrimary || drag || toolDrag || run?.phase !== 'case') return;
  const isStamp = button.dataset.act === 'stamp';
  if (isStamp && !atStampMachine()) return;
  const { pointerId, clientX, clientY } = event;
  suppressDeskClick = true;
  // Browsers may target a nearby button when the actual touch lands between controls.
  if (!isDeskControlHit(button, event)) return;
  deskPress = { button, isStamp, pointerId, clientX, clientY, cancelled: false };
  if (isStamp) button.setAttribute('data-stamp-armed', '');
}

function cancelDeskPress() {
  if (!deskPress) return;
  deskPress.cancelled = true;
  deskPress.button.removeAttribute('data-stamp-armed');
}

function insideDeskPress(press, event) {
  return Math.hypot(event.clientX - press.clientX, event.clientY - press.clientY) <= 12 &&
    isDeskControlHit(press.button, event);
}

function finishDeskPress(event) {
  if (!deskPress || event.pointerId !== deskPress.pointerId) return;
  const press = deskPress;
  deskPress = null;
  press.button.removeAttribute('data-stamp-armed');
  if (event.type === 'pointerup' && !press.cancelled && insideDeskPress(press, event)) {
    if (press.isStamp) stamp(press.button.dataset.key);
    else if (press.button.dataset.act === 'sample-gauge-clamp') checkSample('sample-gauge-clamp');
    else openSample(press.button);
  }
  setGazeTarget(gaze.targetX, gaze.targetY);
}

window.addEventListener('pointermove', (event) => {
  if (deskPress && event.pointerId === deskPress.pointerId && !deskPress.cancelled && !insideDeskPress(deskPress, event)) {
    cancelDeskPress();
  }
});
window.addEventListener('pointerup', finishDeskPress);
window.addEventListener('pointercancel', finishDeskPress);
window.addEventListener('lostpointercapture', finishDeskPress);
window.addEventListener('blur', () => {
  if (deskPress) finishDeskPress({ type: 'blur', pointerId: deskPress.pointerId });
});

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
  if (glancedPanel) {
    if (event.key === 'Escape') { event.preventDefault(); toggleWindowGlance(); }
    if (event.key === 'Tab') {
      event.preventDefault();
      windowGlance.focus({ preventScroll: true });
    }
    return;
  }
  if (event.repeat && event.key === 'Enter' && target instanceof HTMLButtonElement &&
      target.matches('[data-act="stamp"], [data-act="next"], [data-act="hold-receipt"], [data-act="receive-waiting"], [data-act="visit-paper"], [data-act="event-next"], .sample-hotspot[data-drag], .gauge-clamp')) {
    event.preventDefault();
    return;
  }
  if (event.key === 'Tab' && modalLayer.querySelector('[aria-modal="true"]')) {
    const controls = [...modalLayer.querySelectorAll('button:not(:disabled), input:not(:disabled), summary, a[href]')]
      .filter((element) => element.getClientRects().length > 0);
    const first = controls[0];
    const last = controls.at(-1);
    const liveControl = windowGlance.parentElement === utility ? windowGlance : null;
    let next;
    if (document.activeElement === liveControl) next = event.shiftKey ? last : first;
    else if (!modalLayer.contains(document.activeElement)) next = event.shiftKey ? last : first;
    else if (event.shiftKey && document.activeElement === first) next = liveControl ?? last;
    else if (!event.shiftKey && document.activeElement === last) next = liveControl ?? first;
    if (next) { event.preventDefault(); next.focus(); }
  }
  if (event.key === 'Escape' && panel) { event.preventDefault(); closePanel(); }
  const editable = target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select'));
  if (!run || editable || event.ctrlKey || event.metaKey || event.altKey) return;
  if (!event.repeat && ['1', '2', '3'].includes(event.key)) {
    if (event.key === '3' && run.binaryVerdicts) return;
    stamp({ 1: 'pass', 2: 'fail', 3: 'review' }[event.key]);
    return;
  }
  if (!event.repeat && !glancedPanel && !arrival && !activeVisit() && run.phase === 'case') {
    const lower = event.key.toLowerCase();
    if (lower === 'f') {
      if (panel === 'sample') {
        event.preventDefault();
        checkSample(tutorialStep()?.key === 'lens' ? 'sample-lens' : 'sample-flip');
      } else if (panel === 'carton') {
        event.preventDefault();
        checkCarton('carton-turn');
      }
      return;
    }
    if (lower === 's') {
      if (!panel || panel === 'docs') {
        event.preventDefault();
        openSample(desktop.querySelector('.sample-preview'));
      } else if (panel === 'sample') {
        event.preventDefault();
        closePanel();
      }
      return;
    }
    if (lower === 'q' || lower === 'e') {
      const docs = windowCase()?.documents;
      const delta = lower === 'q' ? -1 : 1;
      if (panel === 'docs' && !tutorialStep() && docs?.length > 1) {
        event.preventDefault();
        const nextIndex = (viewedDocument() + delta + docs.length) % docs.length;
        chooseDoc(nextIndex);
      } else if (panel === 'sample' && !tutorialStep() && interaction.referenceDoc !== null && docs?.length > 1) {
        event.preventDefault();
        const nextIndex = (interaction.referenceDoc + delta + docs.length) % docs.length;
        chooseDoc(nextIndex);
      }
    }
  }
});

modalLayer.addEventListener('pointerdown', (event) => {
  const handle = event.target.closest('.sample-stage [data-drag], .carton-model[data-drag]');
  if (!handle || event.button !== 0 || !event.isPrimary || toolDrag || drag) return;
  const kind = handle.dataset.drag;
  const stage = kind === 'carton' ? handle : handle.closest('.sample-stage');
  const origin = stagePoint(root, event.clientX, event.clientY);
  if (kind === 'gauge') {
    toolClickTarget = handle;
    if (!isDeskControlHit(handle, event)) return;
  }
  toolDrag = {
    handle, stage, origin, pointerId: event.pointerId, distance: 0,
    kind, action: handle.dataset.act,
    ...(kind === 'gauge' ? { slot: stage.querySelector('[data-gauge-target]'), insert: stageBounds(stage.querySelector('.gauge-insert-edge')),
      loaded: stage.classList.contains('gauge-loaded'), cue: stage.querySelector('.gauge-drag-cue') } : {}),
    peeled: stage.classList.contains('peeled'), filmTravel: 0,
  };
  handle.setPointerCapture(event.pointerId);
});

function gaugeContainsInsert({ slot, insert, origin }, point) {
  const bounds = stageBounds(slot);
  const left = insert.x + point.x - origin.x;
  const y = insert.y + insert.h / 2 + point.y - origin.y;
  // CSS layout and a transformed viewport can round the shared edge differently.
  return left >= bounds.x - .75 && left + insert.w <= bounds.x + bounds.w + .75 &&
    y >= bounds.y && y <= bounds.y + bounds.h;
}

window.addEventListener('pointermove', (event) => {
  if (!toolDrag || event.pointerId !== toolDrag.pointerId) return;
  const { stage, origin, kind } = toolDrag;
  const point = stagePoint(root, event.clientX, event.clientY);
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const distance = Math.hypot(dx, dy);
  toolDrag.distance = Math.max(toolDrag.distance, distance);
  if (kind === 'carton') {
    const direction = stage.dataset.cartonFace === 'bottom' ? -1 : 1;
    const turn = Math.min(1, Math.abs(dy) / CARTON_TURN_TRAVEL) * 56 * direction;
    stage.style.setProperty('--carton-swipe', `${turn.toFixed(1)}deg`);
    return;
  }
  if (kind === 'clasp') stage.style.setProperty('--clasp-pull', `${Math.min(18, distance).toFixed(1)}px`);
  if (kind === 'wrapper') stage.style.setProperty('--wrap-pull', `${Math.min(26, distance).toFixed(1)}px`);
  if (kind === 'film') {
    const { peeled } = toolDrag;
    const outward = dx * .6 - dy * .8;
    const travel = Math.max(0, Math.min(30, peeled ? -outward : outward));
    toolDrag.filmTravel = travel;
    stage.style.setProperty('--film-drag', peeled ? 1 - travel / 30 : travel / 30);
  }
  if (kind === 'gauge' && toolDrag.distance >= TOOL_DRAG_PX) {
    const { loaded, cue } = toolDrag;
    const inside = gaugeContainsInsert(toolDrag, point);
    const message = loaded ? (inside ? '移出夹口' : '松手取出') : (inside ? '松手放入' : '对准两爪之间');
    stage.dataset.toolDrag = kind;
    stage.toggleAttribute('data-gauge-over', inside);
    if (cue.textContent !== message) cue.textContent = message;
    stage.style.setProperty('--tool-dx', `${dx.toFixed(1)}px`);
    stage.style.setProperty('--tool-dy', `${dy.toFixed(1)}px`);
  }
});

function endToolDrag(event) {
  if (!toolDrag || (event.type !== 'blur' && event.pointerId !== toolDrag.pointerId)) return;
  const completedDrag = toolDrag;
  const { handle, stage, distance, kind, action, loaded, cue, origin, filmTravel } = completedDrag;
  toolDrag = null;
  if (kind === 'carton') {
    const cube = stage.isConnected && stage.querySelector('.carton-cube');
    const from = cube && getComputedStyle(cube).transform;
    stage.style.removeProperty('--carton-swipe');
    if (cube && event.type === 'pointerup' &&
        Math.abs(stagePoint(root, event.clientX, event.clientY).y - completedDrag.origin.y) >= CARTON_TURN_TRAVEL) {
      checkCarton('carton-turn', handle, from);
    } else if (cube) {
      animateOnDesk(cube, [{ transform: from }, { transform: getComputedStyle(cube).transform }], 160);
    }
    setGazeTarget(gaze.targetX, gaze.targetY);
    return;
  }
  delete stage.dataset.toolDrag;
  stage.removeAttribute('data-gauge-over');
  for (const property of ['--clasp-pull', '--wrap-pull', '--tool-dx', '--tool-dy']) stage.style.removeProperty(property);
  if (kind === 'gauge') {
    toolClickTarget = handle;
    cue.textContent = '';
    let completed = false;
    if (event.type === 'pointerup' && stage.isConnected) {
      const point = stagePoint(root, event.clientX, event.clientY);
      const moved = Math.max(distance, Math.hypot(point.x - origin.x, point.y - origin.y)) >= TOOL_DRAG_PX;
      completed = moved ? gaugeContainsInsert(completedDrag, point) !== loaded : isDeskControlHit(handle, event);
    }
    if (completed) checkSample(action);
  } else if (event.type === 'pointerup' && distance >= TOOL_DRAG_PX) {
    toolClickTarget = handle;
    let completed = true;
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

function projectedPaperFace(paper, project) {
  const { left, top, width, height } = paper.getBoundingClientRect();
  if (!width || !height) return null;
  const corners = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => project(left + x * width, top + y * height));
  return {
    center: project(left + width / 2, top + height / 2),
    layer: Number(getComputedStyle(paper).zIndex) || 0,
    contains(point) {
      const sides = corners.map((from, index) => {
        const to = corners[(index + 1) % corners.length];
        return (to.x - from.x) * (point.y - from.y) - (to.y - from.y) * (point.x - from.x);
      });
      return sides.every((side) => side >= 0) || sides.every((side) => side <= 0);
    },
  };
}

function captureDeskPaperFaces(source, modeled, project) {
  const lesson = tutorialStep()?.key;
  const batchPapers = ':is(.paper-label, .paper-report)';
  if (panel || (lesson && (lesson !== 'report' || !source.matches(batchPapers)))) return [];
  const modeledFaces = modeled ? scenery.capturePaperTargets?.() ?? [] : null;
  const selector = `[data-drag="paper"]:enabled:not([data-lifted])${lesson ? batchPapers : ''}`;
  return [...desktop.querySelectorAll(selector)].flatMap((paper, order) => {
    const face = modeledFaces ? modeledFaces.find(({ index }) => index === Number(paper.dataset.i)) : projectedPaperFace(paper, project);
    return face ? [{ paper, order, ...face }] : [];
  }).sort((a, b) => b.layer - a.layer || b.order - a.order);
}

function paperDropTarget(work, offset, event) {
  if (!work.center || panel || run?.phase !== 'case' || !work.paper.isConnected) return null;
  const center = {
    x: work.center.x + offset.x - work.offset.x,
    y: work.center.y + offset.y - work.offset.y,
  };
  const onPaper = work.targets.find(({ paper, contains }) => paper.isConnected && contains(center));
  if (onPaper || event.pointerType !== 'touch') return onPaper?.paper ?? null;
  const touches = root.ownerDocument.elementsFromPoint(event.clientX, event.clientY);
  return work.targets.find(({ paper }) => touches.some((element) => paper.contains(element)))?.paper ?? null;
}

function updatePaperDragCue(work) {
  const visible = work?.moved && work.targets.length;
  paperDragCue.hidden = !visible;
  if (!visible) return;
  const { paper, target, pairReady } = work;
  const title = paper.querySelector('h3').textContent;
  const command = target ? (pairReady ? '松手并排' : '停一下') : '拖到另一张纸上';
  const pair = target ? `${title} ＋ ${target.querySelector('h3').textContent}` : title;
  paperDragCue.querySelector('strong').textContent = command;
  paperDragCue.querySelector('span').textContent = pair;
}

function markPaperDrop(work, target) {
  if (work.target === target) return;
  clearTimeout(work.pairTimer);
  work.target?.removeAttribute('data-pair-drop');
  work.target = target;
  work.pairReady = false;
  updatePaperDragCue(work);
  if (!target) return;
  target.dataset.pairDrop = 'near';
  work.pairTimer = setTimeout(() => {
    if (drag !== work || !work.paper.isConnected || !target.isConnected || panel) return;
    work.pairReady = true;
    target.dataset.pairDrop = 'ready';
    updatePaperDragCue(work);
    playSound('click');
  }, PAPER_PAIR_HOLD_MS);
}

function moveDeskPaper(work, offset, lift = 0, settle = false) {
  work.paper.style.setProperty('--paper-x', `${offset.x}px`);
  work.paper.style.setProperty('--paper-y', `${offset.y}px`);
  scenery?.setPaperOffset?.(work.index, offset, lift, settle);
}

function paperDragPlacement(work, event) {
  const point = work.project(event.clientX, event.clientY);
  const x = point.x - work.origin.x;
  const y = point.y - work.origin.y;
  const next = { x: work.offset.x + x, y: work.offset.y + y };
  const resting = { x: Math.max(-90, Math.min(90, next.x)), y: Math.max(-35, Math.min(40, next.y)) };
  const preview = work.targets.length ? { x: Math.max(-380, Math.min(380, next.x)), y: Math.max(-65, Math.min(65, next.y)) } : resting;
  const short = event.pointerType === 'mouse' ? Math.hypot(x, y) < 7
    : Math.hypot(event.clientX - work.clientX, event.clientY - work.clientY) < PAPER_TOUCH_DRAG_PX;
  return { short, resting, preview };
}

desktop.addEventListener('pointerdown', (event) => {
  const paper = event.target.closest('[data-drag="paper"]:enabled');
  if (!paper || event.button !== 0 || !event.isPrimary || drag || deskPress || toolDrag || run?.phase !== 'case') return;
  suppressDeskClick = true;
  if (!isDeskControlHit(paper, event)) return;
  const index = Number(paper.dataset.i);
  const projection = root.dataset.modeled === 'true' ? scenery?.captureDeskProjection?.() : null;
  const project = projection ?? captureDeskProjection(desktop) ?? ((x, y) => stagePoint(root, x, y));
  const offset = interaction.positions[index] ?? { x: 0, y: 0 };
  const faces = captureDeskPaperFaces(paper, Boolean(projection), project);
  drag = { paper, index, pointerId: event.pointerId, project, clientX: event.clientX, clientY: event.clientY,
    origin: project(event.clientX, event.clientY),
    offset, moved: false, center: faces.find((face) => face.paper === paper)?.center,
    targets: faces.filter((face) => face.paper !== paper), target: null, pairReady: false };
});

window.addEventListener('pointermove', (event) => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  if (!drag.paper.isConnected) {
    endDrag({ type: 'pointercancel', pointerId: event.pointerId });
    return;
  }
  const { short, preview } = paperDragPlacement(drag, event);
  if (!drag.moved && short) return;
  if (!drag.moved) {
    drag.moved = true;
    drag.paper.classList.add('moving');
    updatePaperDragCue(drag);
    playSound('paper');
  }
  markPaperDrop(drag, paperDropTarget(drag, preview, event));
  moveDeskPaper(drag, preview, drag.targets.length ? .05 : 0);
});

function endDrag(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const work = drag;
  const released = event.type === 'pointerup';
  const placement = released ? paperDragPlacement(work, event) : null;
  const pair = placement && work.pairReady && paperDropTarget(work, placement.preview, event) === work.target ? work.target : null;
  markPaperDrop(work, null);
  updatePaperDragCue(null);
  drag = null;
  if (work.moved && work.paper.isConnected) {
    const offset = placement && !pair ? placement.resting : work.offset;
    moveDeskPaper(work, offset, 0, true);
    work.paper.classList.remove('moving');
    if (pair) openDeskPair(Number(pair.dataset.i), work.index, work.paper);
    else if (released) {
      interaction.positions[work.index] = offset;
      persistRun();
    }
  } else if (placement?.short && isDeskControlHit(work.paper, event)) {
    chooseDoc(work.index, work.paper);
  }
  setGazeTarget(gaze.targetX, gaze.targetY);
}

window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);
window.addEventListener('lostpointercapture', endDrag);
window.addEventListener('blur', () => {
  if (drag) endDrag({ type: 'pointercancel', pointerId: drag.pointerId });
  resetGaze();
});
render();
requestAnimationFrame(() => requestAnimationFrame(() => { void startScene(); }));

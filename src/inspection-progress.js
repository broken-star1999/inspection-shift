import { normalizeFindings } from './inspection-findings.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function carryProgress(carry, seen = null) {
  const seenIds = seen === null ? null : new Set(Array.isArray(seen) ? seen : []);
  const pins = Array.isArray(carry?.pinned) ? carry.pinned : [];
  const eligible = pins.filter((id) => Number.isInteger(id) && id > 0 && (!seenIds || seenIds.has(id)));
  const pinned = [...new Set(eligible)].slice(-2);
  const phoneNumber = typeof carry?.phoneNumber === 'string' && /^\d{0,5}$/.test(carry.phoneNumber) ? carry.phoneNumber : '';
  return { pinned, phoneNumber };
}

function caseProgress(item, progress) {
  const positions = {};
  const documentCount = Array.isArray(item?.documents) ? item.documents.length : 0;
  for (let index = 0; index < documentCount; index++) {
    const offset = progress?.positions?.[index];
    if (Number.isFinite(offset?.x) && Number.isFinite(offset?.y)) {
      positions[index] = { x: clamp(offset.x, -90, 90), y: clamp(offset.y, -35, 40) };
    }
  }
  const inspection = progress?.inspection;
  return {
    note: typeof progress?.note === 'string' ? progress.note.slice(0, 100) : '',
    findings: normalizeFindings(progress?.findings),
    positions,
    inspection: {
      back: inspection?.back === true,
      film: inspection?.film === true,
      clasp: inspection?.clasp === true,
      tug: inspection?.tug === true,
      measured: inspection?.measured === true,
      unpacked: inspection?.unpacked === true,
    },
    signed: progress?.signed === true,
    orderSeen: progress?.orderSeen === true,
    benchFindingsOpen: progress?.benchFindingsOpen === true,
  };
}

function documentIndex(value, count) {
  return Number.isInteger(value) && Number.isInteger(count) && value >= 0 && value < count ? value : null;
}

function workspaceProgress(item, work, context = {}) {
  const { prior, guided } = context;
  const panel = work?.panel;
  if (!['docs', 'sample', 'phone'].includes(panel)) return null;
  const scrollTop = Number.isFinite(work.scrollTop) ? Math.max(0, work.scrollTop) : 0;
  const workspace = { panel, scrollTop };
  if (panel === 'phone') {
    if (['docs', 'sample'].includes(work.returnTo?.panel)) {
      const origin = workspaceProgress(item, work.returnTo, context);
      if (origin) workspace.returnTo = origin;
    }
    return workspace;
  }
  if (panel === 'sample' && !item.sample) return null;

  const count = Array.isArray(item.documents) ? item.documents.length : 0;
  const doc = documentIndex(work.doc, count);
  if (panel === 'docs' && doc === null) return null;
  const returnToDocs = panel === 'sample' && !guided && doc !== null && work.returnToDocs === true;
  workspace.showFindings = work.showFindings === true;

  if (panel === 'docs' || returnToDocs) {
    const compare = documentIndex(work.compare, count);
    workspace.doc = doc;
    workspace.compare = compare === doc ? null : compare;
    if (!guided && count === 3 && work.spreadAll === true) workspace.spreadAll = true;

    const previousDoc = documentIndex(work.previousDoc, prior?.documentCount);
    const previousCurrentDoc = documentIndex(work.previousCurrentDoc, count);
    if (!guided && Number.isInteger(prior?.id) && prior.id > 0 && work.priorId === prior.id &&
        previousDoc !== null && previousCurrentDoc !== null) {
      Object.assign(workspace, { priorId: prior.id, previousDoc, previousCurrentDoc });
    }
  }

  if (panel === 'sample') {
    workspace.referenceDoc = guided ? null : documentIndex(work.referenceDoc, count);
    workspace.returnToDocs = returnToDocs;
  }
  return workspace;
}

export function freshInteraction(carry = {}) {
  return {
    ...caseProgress(null, null),
    doc: 0,
    compare: null,
    spreadAll: false,
    previousDoc: null,
    previousCurrentDoc: null,
    referenceDoc: null,
    returnToDocs: false,
    archiveFocus: null,
    archiveQuery: '',
    archiveEditing: false,
    showFindings: false,
    ...carryProgress(carry),
    egg: null,
  };
}

export function captureInspectionProgress(item, interaction, context = {}) {
  const caseId = Number.isInteger(item?.id) && item.id > 0 ? item.id : null;
  const progress = { caseId, ...caseProgress(item, caseId === null ? null : interaction), ...carryProgress(interaction) };
  if (caseId !== null && context?.panel) {
    const workspace = workspaceProgress(item, {
      ...interaction,
      panel: context.panel,
      scrollTop: context.scrollTop,
      priorId: context.prior?.id,
      returnTo: context.returnTo && { ...interaction, ...context.returnTo, priorId: context.prior?.id },
    }, context);
    if (workspace) progress.workspace = workspace;
  }
  return progress;
}

export function restoreInspectionProgress(progress, item, seen = [], context) {
  const interaction = { ...freshInteraction(), ...carryProgress(progress, seen ?? []) };
  const caseId = progress?.caseId;
  if (!Number.isInteger(caseId) || caseId < 1 || item?.id !== caseId) return interaction;
  const restored = { ...interaction, ...caseProgress(item, progress) };
  const workspace = context ? workspaceProgress(item, progress.workspace, context) : null;
  if (!workspace) return restored;
  const { panel, scrollTop, priorId: _priorId, returnTo, ...fields } = workspace;
  if (!returnTo) return { ...restored, ...fields, workspace: { panel, scrollTop } };
  const { panel: origin, scrollTop: originScroll, priorId: _originPrior, ...originFields } = returnTo;
  return { ...restored, ...originFields, ...fields, workspace: { panel, scrollTop, returnTo: { panel: origin, scrollTop: originScroll } } };
}

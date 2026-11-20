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
  };
}

export function freshInteraction(carry = {}) {
  return {
    ...caseProgress(null, null),
    doc: 0,
    compare: null,
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

export function captureInspectionProgress(item, interaction) {
  const caseId = Number.isInteger(item?.id) && item.id > 0 ? item.id : null;
  return { caseId, ...caseProgress(item, caseId === null ? null : interaction), ...carryProgress(interaction) };
}

export function restoreInspectionProgress(progress, item, seen = []) {
  const interaction = { ...freshInteraction(), ...carryProgress(progress, seen ?? []) };
  const caseId = progress?.caseId;
  if (!Number.isInteger(caseId) || caseId < 1 || item?.id !== caseId) return interaction;
  return { ...interaction, ...caseProgress(item, progress) };
}

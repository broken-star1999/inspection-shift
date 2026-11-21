const appearances = {
  classic: { name: '标准护目镜', stem: 'sample', clasp: true },
  vented: { name: '通风护目镜', stem: 'sample-vented', clasp: true },
  compact: { name: '贴合护目镜', stem: 'sample-compact', clasp: true },
  shield: { name: '防护面屏', stem: 'sample-shield', clasp: false },
  clip: { name: '卡扣插片', stem: 'sample-clip', clasp: false },
  glove: { name: '作业防护手套', stem: 'sample-glove', clasp: false, front: '掌面' },
  earmuff: { name: '防噪耳罩', stem: 'sample-earmuff', clasp: false },
};

export function sampleAppearance(spec) {
  const key = Object.hasOwn(appearances, spec.appearance) ? spec.appearance : 'classic';
  return { key, ...appearances[key] };
}

export function sampleInGauge(spec, inspection) {
  return Boolean(spec?.reading && (inspection?.gaugeLoaded === true || inspection?.measured === true));
}

// Positions follow the cuff seam in the back view of the glove.
export const CUFF_SPLIT_PATCHES = [
  { color: '#7b4620', points: [[47, 76.3], [54.5, 75.9], [62.4, 76.4], [69.8, 77.3], [68.2, 79.1], [60.9, 79.2], [53.1, 78.7]] },
  { color: '#35231a', points: [[47.7, 76.8], [54.7, 76.5], [60.4, 76.8], [69.1, 77.5], [66.6, 78.7], [59.8, 78.4], [54.2, 78.2]] },
  { color: '#bb7734', points: [[50.3, 77.6], [54, 78.3], [60, 78.3], [65.7, 78.8], [68.7, 78.2], [67.2, 79], [59.5, 79], [53.7, 78.7]] },
  { color: '#e3b56a', points: [[50.5, 76.55], [51.5, 76.47], [52.85, 77.5], [52.12, 77.59]] },
  { color: '#dba456', points: [[65.1, 77.28], [66.1, 77.41], [64.66, 78.3], [63.78, 78.21]] },
  { color: '#e3b56a', points: [[68.27, 77.58], [68.9, 77.68], [68.4, 78.35], [67.77, 78.25]] },
];

// Coordinates are percentages of the front and back earmuff sprites.
const earCupMarks = {
  seam: {
    front: [[11.8, 84.5], [15.7, 87.6], [20.9, 90], [26.3, 90.7], [31.6, 89.8], [31.7, 90.6], [26.3, 91.7], [20.7, 91], [15.3, 88.6], [11.6, 85.3]],
    back: [[6.4, 83.4], [9.2, 86.8], [12.6, 89], [16.2, 90], [16.5, 90.9], [12.4, 90], [8.8, 87.7], [6.1, 84.1]],
  },
  split: {
    front: [[17.7, 87.5], [22.8, 88.5], [27.6, 86.5], [30.2, 87.1], [34.2, 83.4], [38.1, 84.2], [41.9, 81.5], [44.6, 82], [42.1, 82.9], [38.5, 85.5], [34.6, 84.8], [30.7, 88.4], [27.7, 87.8], [23.2, 89.8], [17.8, 88.5]],
    back: [[7.7, 85.4], [10.8, 86.3], [14.2, 84.4], [16.4, 84.9], [19.3, 80.6], [22, 81.1], [24.5, 76.7], [27.2, 76.3], [25.2, 78], [22.5, 82.4], [19.6, 82], [16.7, 86.2], [14.4, 85.7], [11.1, 87.4], [7.8, 86.5]],
  },
};

export function earCupMark(spec, back) {
  if (spec.kind !== 'line' || spec.appearance !== 'earmuff') return null;
  const shape = spec.earCupSplit ? 'split' : 'seam';
  return { shape, points: earCupMarks[shape][back ? 'back' : 'front'] };
}

export function cuffSplitVisible(spec, inspection) {
  return spec.cuffSplit === true && inspection.unpacked === true && inspection.back === true;
}

export function sampleObservation(spec, inspection) {
  const { back, film, tug, unpacked } = inspection;
  if (spec.unwrapped && !unpacked) return spec.front;
  if (back) {
    if (tug && spec.afterTug) return spec.afterTug;
    if (tug || spec.model || !sampleAppearance(spec).clasp || spec.kind === 'broken') return spec.back;
    return '检样已翻到背面。两侧是扣件和框内刻字。';
  }
  if (spec.unwrapped && unpacked) return spec.unwrapped;
  if (film && spec.afterFilm) return spec.afterFilm;
  return spec.front;
}

export function sampleFinding(spec, inspection) {
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

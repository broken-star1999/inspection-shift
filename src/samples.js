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

// Positions follow the cuff seam in the back view of the glove.
export const CUFF_SPLIT_PATCHES = [
  { color: '#7b4620', points: [[47, 76.3], [54.5, 75.9], [62.4, 76.4], [69.8, 77.3], [68.2, 79.1], [60.9, 79.2], [53.1, 78.7]] },
  { color: '#35231a', points: [[47.7, 76.8], [54.7, 76.5], [60.4, 76.8], [69.1, 77.5], [66.6, 78.7], [59.8, 78.4], [54.2, 78.2]] },
  { color: '#bb7734', points: [[50.3, 77.6], [54, 78.3], [60, 78.3], [65.7, 78.8], [68.7, 78.2], [67.2, 79], [59.5, 79], [53.7, 78.7]] },
  { color: '#e3b56a', points: [[50.5, 76.55], [51.5, 76.47], [52.85, 77.5], [52.12, 77.59]] },
  { color: '#dba456', points: [[65.1, 77.28], [66.1, 77.41], [64.66, 78.3], [63.78, 78.21]] },
  { color: '#e3b56a', points: [[68.27, 77.58], [68.9, 77.68], [68.4, 78.35], [67.77, 78.25]] },
];

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

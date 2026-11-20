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

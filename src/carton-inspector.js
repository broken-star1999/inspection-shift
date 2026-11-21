const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

export function cartonModel(code, bottom = false) {
  const ink = bottom && code ? escapeHtml(code) : '';
  const description = bottom ? `外箱底面，${ink ? `喷码 ${ink}` : '无可辨喷码'}` : '外箱正面，箱签只剩撕裂的底纸';
  return `<div class="carton-model" data-carton-face="${bottom ? 'bottom' : 'front'}" role="img" aria-label="${description}">
    <div class="carton-cube" aria-hidden="true">
      <div class="carton-face carton-face-front"><i class="carton-label-remnant"></i></div>
      <div class="carton-face carton-face-back"></div>
      <div class="carton-face carton-face-right"></div>
      <div class="carton-face carton-face-left"></div>
      <div class="carton-face carton-face-top"></div>
      <div class="carton-face carton-face-bottom">${ink ? `<span class="carton-ink">${ink}</span>` : ''}</div>
    </div>
  </div>`;
}

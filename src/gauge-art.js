const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

export function gaugeJawStyle(reading, measured) {
  if (!measured || !reading) return '';
  const thickness = Number.parseFloat(reading);
  const travel = Number.isFinite(thickness) ? Math.max(-1.5, Math.min(1.5, (thickness - 2) * 4)) : 0;
  return ` style="--gauge-contact-offset:${travel.toFixed(1)}px"`;
}

export function gaugeArt(reading, { loaded, measured, control = '' }) {
  const display = loaded && measured && reading ? escapeHtml(reading) : '—';
  return `<span class="sample-gauge">
    <span class="gauge-hardware" aria-hidden="true">
      <span class="gauge-slot" data-gauge-target></span>
      <span class="gauge-beam"></span>
      <span class="gauge-fixed-jaw"></span>
      <span class="gauge-moving-jaw"></span>
      <span class="gauge-body"></span>
      <span class="gauge-display">${display}</span>
    </span>${loaded ? control : ''}
  </span>`;
}

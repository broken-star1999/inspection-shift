import { CHARACTERS, DAYS, EASTER_EGGS, FILM_BENCH_TUTORIAL, FILM_TUTORIAL, PHONE, documentExtension } from './content.js';
import { cartonFinding, intakeComparison, projectComparison, relabelComparison, thicknessComparison } from './document-comparison.js';
import { cartonModel } from './carton-inspector.js';
import { canShowFinding, getShipmentException, receiptDisposition, receiptFeedback, shipmentIssueFeedback, TRACE_CASE_ID } from './engine.js';
import { readFindings } from './inspection-findings.js';
import { TRACE_INQUIRY_KEY } from './report-workspace.js';
import { gaugeArt } from './gauge-art.js';
import { CUFF_SPLIT_PATCHES, cuffSplitVisible, earCupMark, sampleAppearance, sampleFinding, sampleInGauge, sampleObservation } from './samples.js';

export const asset = (file) => `${import.meta.env.BASE_URL}art/${file}`;
export const labels = { pass: '通过', fail: '不通过', review: '要求审查' };
export const statuses = { shipping: '排车', shipped: '已出库', returned: '退回', held: '隔离待查', recallPending: '待召回回执', recalled: '召回确认',
  supplementHeld: '补验联待查', supplementReturned: '补验联退回' };
const types = { label: '标签', report: '检验', order: '送检', archive: '留底' };
const gaugeFields = { report: '厚度', order: '厚度范围' };
const glyphs = { pass: '✓', fail: '×', review: '…' };
const completedDate = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
});
const batchPaperLabels = {
  rework: { tab: '复核联', original: '查看周一原单', open: '查看周二复核联' },
  acceptance: { tab: '验收联', original: '查看对应出货单', open: '查看到货验收联' },
  exception: { tab: '到货复核联', original: '查看原批出货单', open: '查看到货复核联' },
  trace: { tab: '实验室原件', original: '查看 G-241 原单', open: '查看 R-071 原件' },
  supplement: { tab: '补件联', original: '查看周二原单', open: '查看补件登记联' },
};

export const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const cls = (name, enabled) => enabled ? ` ${name}` : '';
const active = (selected) => selected ? ' aria-pressed="true"' : ' aria-pressed="false"';

function dispositionLabel(record) {
  return statuses[receiptDisposition(record)] ?? '待登记';
}

export function button(text, action, variant = 'secondary', attributes = '') {
  return `<button class="button ${variant}" data-act="${action}" ${attributes}>${text}</button>`;
}

export function shell() {
  return `<div class="game-frame">
    <header class="topbar"><div class="brand"><span class="brand-mark" aria-hidden="true"></span><div><strong>南渡防护用品厂</strong><small>成品抽检窗口</small></div></div>
      <div class="top-status" id="top-status"></div>
      <nav class="utility" aria-label="游戏操作">
        <button class="icon-button home-shortcut" data-act="shift-home" aria-label="存档并返回首页" title="存档并返回首页" hidden>首页</button>
        <button class="icon-button" data-act="how" aria-label="玩法说明" title="玩法说明"><span class="icon-help" aria-hidden="true">?</span></button>
        <button class="icon-button" data-act="sound" aria-label="音效" title="音效"><span class="icon-sound" aria-hidden="true">♪</span></button>
        <button class="icon-button" data-act="fullscreen" aria-label="全屏" title="全屏"><span class="icon-expand" aria-hidden="true"></span></button>
      </nav>
    </header>
    <main class="playfield">
      <div class="model-world" aria-hidden="true"></div>
      <div class="booth-layout">
        <aside class="booth-wing booth-left" aria-label="值班工具">
          <button class="wall-tool wall-phone" data-act="phone" data-fixture="phone"><img src="${asset('tool-phone.webp')}" alt="" fetchpriority="low" draggable="false"><b>内线电话</b><span class="phone-ring-indicator" aria-hidden="true"></span></button>
          <button class="wall-tool wall-archive" data-act="archive" data-fixture="archive"><img src="${asset('tool-archive.webp')}" alt="" fetchpriority="low" draggable="false"><b>交接簿</b></button>
        </aside>
        <div class="room" data-fixture="window"><div class="canvas-room" aria-hidden="true"><img class="static-worker" alt="" decoding="async" draggable="false" hidden></div><div class="booth-cargo" aria-hidden="true" hidden><span class="booth-cargo-lane"></span><span class="booth-cargo-crate"></span></div><span class="booth-cat" aria-hidden="true"></span><span class="booth-transfer-slot" aria-hidden="true"></span><span class="booth-handoff-slip" aria-hidden="true"></span><div class="booth-shutter" aria-hidden="true"></div><div class="glass-stripe" aria-hidden="true"></div><div class="room-hud" id="room-hud"></div></div>
        <aside class="booth-wing booth-right" aria-label="值班告示">
          <div id="wall-shift" data-fixture="shift"></div>
          <button class="wall-notice" data-act="rules" data-fixture="rules">查验要求<span aria-hidden="true">﹣﹣﹣</span></button>
        </aside>
        <div class="console" id="desk"></div>
      </div>
      <p class="arrival-status" id="arrival-status" role="status"></p>
      <p class="visually-hidden" id="window-readback" role="status"></p>
      <div class="screen-layer" id="screen"></div>
      <div class="modal-layer" id="modal"></div>
      <div class="game-toast" aria-live="polite"></div>
    </main>
  </div>`;
}

export function home(save, endings, completedCount = 0) {
  let actions = button('接班', 'start', 'primary');
  if (save?.phase === 'ending') actions = button('查看上周交班', 'resume', 'primary') + button('接新一周', 'start');
  else if (save) actions = button(`继续值班 <small>${DAYS[save.day].title}</small>`, 'resume', 'primary') + button('重新接班', 'new');
  const history = completedCount > 0
    ? button(`<b>交班记录</b><span>${completedCount} 份</span>`, 'completed-shifts', 'home-history')
    : endings.length ? `<span>已见结局 ${endings.length}／3</span>` : '<span>五个工作日</span>';
  return `<section class="home-screen"><div class="home-art" aria-hidden="true"></div><div class="home-body">
    <div class="title-paper"><div class="eyebrow">南渡防护用品厂 · 代班通知</div><h1>质检员<br><em>的一天</em></h1>
      <p class="title-description">在出货窗口替五天班。<br>看样，对单，然后签你的名字。</p>
      <div class="home-actions">${actions}</div>
    </div><div class="home-sign" aria-hidden="true"><i></i><span>发货抽检窗口</span><b>01</b></div></div>
    <footer class="home-footer"><span>出货交接室</span>${history}</footer></section>`;
}

export function completedShifts(entries, endingCount) {
  const rows = entries.map(({ id, title, label, counts, completedAt, lastOpened }) => {
    const time = new Date(completedAt);
    const filed = Number.isFinite(time.getTime()) ? `<time datetime="${time.toISOString()}">${esc(completedDate.format(time))}</time>` : '';
    const result = Object.entries(counts).map(([stamp, count]) => `${labels[stamp]} ${count}`).join(' · ');
    return `<li><button type="button" class="completed-shift" data-act="review-shift" data-key="${esc(id)}"${lastOpened ? ' data-last-opened' : ''}>
      <span><b>${esc(title)}</b><small>${esc(label)}${filed ? ` · ${filed}` : ''}</small></span>
      <span class="completed-shift-results">${esc(result)}</span><span class="completed-shift-arrow" aria-hidden="true">›</span></button></li>`;
  });
  return `<p class="history-collection">已见结局 ${endingCount}／3</p><ul class="completed-shifts">${rows.join('')}</ul>`;
}

export function wallShift(run) {
  const day = DAYS[run.day];
  return `<div class="room-status"><span class="room-tag"><i></i> ${run.phase === 'receipt' ? '出单中' : '窗口值班'}</span><strong>${day.title}</strong>
    <div class="batch-progress" aria-label="当班来件 ${run.index + 1} / 4">${day.cases.map((_, index) => `<span class="${index <= run.index ? 'done' : ''}"></span>`).join('')}</div></div>`;
}

function priorReceipt({ record, sameLot }) {
  const day = DAYS[record.day];
  const title = sameLot ? '查看上次回执' : '查看原批回执';
  return `<button type="button" class="prior-receipt" data-act="archive-receipt" data-i="${esc(record.id)}">
    <b>${title}</b><span>${esc(day?.title)} · ${esc(labels[record.decision])} · ${esc(dispositionLabel(record))}</span>${sameLot ? '' : '<small>留厂返工件单独核对</small>'}
  </button>`;
}

export function setRoomCargo(layer, cargo) {
  if (!cargo) {
    layer.hidden = true;
    return;
  }
  const id = String(cargo.id);
  const sameCase = !layer.hidden && layer.dataset.cargoId === id;
  layer.toggleAttribute('data-cargo-inspectable', Boolean(cargo.inspectable));
  if (sameCase && layer.dataset.cargoRoute === cargo.route) return;
  layer.toggleAttribute('data-cargo-moving', Boolean(sameCase && cargo.animate));
  layer.dataset.cargoId = id;
  layer.dataset.cargoRoute = cargo.route;
  layer.hidden = false;
}

export function filmLessonPending(item, { returningWeek, filmChecked } = {}) {
  return item?.id === 2 && !returningWeek && !filmChecked;
}

export function room(run, item, tutorial, pressure, sceneEvent, previous, filmCue = false) {
  const day = DAYS[run.day];
  const character = CHARACTERS[sceneEvent?.npc ?? (run.phase === 'brief' || run.phase === 'handoff' ? 'zhou' : item?.npc)];
  const record = run.phase === 'receipt' ? run.records.at(-1) : null;
  const reply = run.phase === 'case' && !sceneEvent ? item?.pressureReply : null;
  const exchange = pressure && !sceneEvent && !record;
  const line = sceneEvent?.line ?? (record ? receiptFeedback(run) : null) ?? reply ?? item?.line ?? day.intro;
  const earlier = run.phase === 'case' && !sceneEvent && previous?.record ? priorReceipt(previous) : '';
  const training = tutorial && !sceneEvent
    ? `<div class="training" aria-live="polite"><span class="tutorial-index">${run.tutorial + 1} / 5</span><small>老周 · ${esc(tutorial.title)}</small><p>${esc(tutorial.line)}</p></div>`
    : filmCue ? `<div class="training" id="film-bench-cue" aria-live="polite"><small>老周</small><p>${esc(FILM_BENCH_TUTORIAL)}</p></div>` : '';
  return `<div class="speech${cls('dispatch-event', sceneEvent)}${cls('pressure-exchange', exchange)}"${sceneEvent?.kind ? ` data-visit-kind="${esc(sceneEvent.kind)}"` : ''} aria-live="polite"><div class="speaker"><strong>${esc(character?.name ?? '值班室')}</strong><small>${esc(character?.role ?? '')}</small></div>
      <p${reply ? ' class="pressure-reply"' : ''}>${esc(line)}</p>${exchange && !reply ? `<p class="pressure-line">${esc(pressure)}</p>` : ''}
      ${earlier}</div>${training}`;
}

function paperCard(doc, index, target, offset, lifted, disabled = false) {
  return `<button type="button" class="paper-card paper-${doc.type}${cls('instructed', target === doc.type)}" data-act="doc" data-i="${index}" data-drag="paper" data-fixture="doc${index}"${lifted ? ' data-lifted' : ''}${offset ? ` style="--paper-x:${offset.x}px;--paper-y:${offset.y}px"` : ''} aria-label="查看${esc(doc.title)}"${disabled ? ' disabled' : ''}>
    <small>${types[doc.type] ?? '归档'}</small><h3>${esc(doc.title)}</h3><b class="paper-num">${esc(doc.fields[0]?.[1])}</b><span class="paper-rules" aria-hidden="true"></span><span class="paper-seal" aria-hidden="true">${doc.type === 'label' ? '批' : doc.type === 'report' ? '检' : '联'}</span></button>`;
}

const visitPaperLabels = {
  trace: ['实验室原件', '收下原件'],
  night: ['夜班存根', '收下存根'],
  recall: ['收货方回执', '收下回签'],
  rework: ['返工复核联', '收下复核联'],
  acceptance: ['到货验收联', '收下验收联'],
  exception: ['到货复核联', '收下到货复核联'],
};

export function visitSlip(doc, visit, lifted = false) {
  const [label] = visitPaperLabels[visit.kind ?? visit.key] ?? ['回访留底'];
  return `<section class="paper-work visit-work"><div class="papers"><button type="button" class="paper-card paper-archive visit-slip" data-act="visit-paper" data-fixture="doc0"${lifted ? ' data-lifted' : ''} aria-label="查看${esc(doc.title)}">
    <h3>${label}</h3><b class="paper-num">${esc(doc.title)}</b><span class="paper-rules" aria-hidden="true"></span></button></div></section>`;
}

function stampButtons(instructed, disabled = false, action = 'stamp', currentVerdict = null) {
  return Object.entries(labels).map(([key, value]) => `<button class="stamp ${key}${cls('instructed', instructed && key === 'pass')}" data-act="${action}" data-key="${key}"${action === 'stamp' ? ` data-fixture="${key}"` : ''}${disabled || key === currentVerdict ? ' disabled' : ''}><span class="stamp-glyph" aria-hidden="true">${glyphs[key]}</span><b>${value}</b></button>`).join('');
}

const sampleRatios = { vented: 508 / 318, compact: 508 / 284, shield: 357 / 363, clip: 496 / 218, glove: 282 / 363, earmuff: 396 / 363 };

function claspArt(spec, inspection) {
  const result = inspection.tug && ['loose', 'broken'].includes(spec.kind) ? spec.kind : '';
  const state = inspection.tug ? (result ? 'released' : 'tested') : (inspection.clasp ? 'latched' : 'open');
  return `<span class="sample-clasp-state" data-clasp="${state}"${result ? ` data-clasp-result="${result}"` : ''} aria-hidden="true"><span class="sample-clasp-strap"></span><span class="sample-clasp-hook"></span></span>`;
}

function sampleArt(spec, appearance, { back = false, unpacked = false, control = '', inspection = null } = {}) {
  const ratio = sampleRatios[appearance.key] ?? 720 / (back ? 384 : 382);
  const lensFilm = !back && (spec.kind === 'film' || spec.kind === 'crack');
  const wrapped = spec.kind === 'yellow' && !unpacked;
  const alt = wrapped ? '' : `${appearance.name}${back ? '背面' : appearance.front ?? '正面'}`;
  const cuff = cuffSplitVisible(spec, { back, unpacked }) ? `<span class="sample-cuff-split" aria-hidden="true">${CUFF_SPLIT_PATCHES.map(({ color, points }) =>
    `<span style="--split-ink:${color};--split-patch:polygon(${points.map(([x, y]) => `${x}% ${y}%`).join(',')})"></span>`).join('')}</span>` : '';
  const cup = earCupMark(spec, back);
  const line = cup ? `<span class="sample-ear-cup-mark" data-shape="${cup.shape}" aria-hidden="true" style="clip-path:polygon(${cup.points.map(([x, y]) => `${x}% ${y}%`).join(',')})"></span>` : '';
  return `<span class="sample-object" style="--sample-ratio:${ratio}">
    <img src="${asset(`${appearance.stem}${back ? '-back' : ''}.webp`)}" alt="${esc(alt)}" draggable="false">
    ${cuff}${line}
    ${lensFilm ? `<span class="sample-film-sheet" aria-hidden="true">${spec.kind === 'film' ? '<span class="sample-film-trace"></span>' : ''}</span>` : ''}
    ${!back && spec.kind === 'crack' ? '<span class="sample-lens-crack" aria-hidden="true"></span>' : ''}
    ${back && spec.model ? `<span class="model-mark" aria-hidden="true">${esc(spec.model)}</span>` : ''}
    ${back && appearance.clasp && inspection ? claspArt(spec, inspection) : ''}
    ${wrapped ? '<span class="sample-wrap" aria-hidden="true"><span class="sample-wrap-mouth"></span></span>' : spec.kind === 'yellow' ? '<span class="sample-wrap-folded" aria-hidden="true"></span>' : ''}
    ${control}</span>
    ${!lensFilm && spec.kind !== 'yellow' && !cup ? '<span class="sample-mark" aria-hidden="true"></span>' : ''}`;
}

function sampleHotspot(action, className, text, label, pressed = null, instructed = false) {
  const gesture = { film: 'film', tug: 'clasp', measure: 'gauge', unpack: 'wrapper' }[action];
  return `<button type="button" class="sample-hotspot ${className}${cls('instructed', instructed)}" data-act="sample-${action}"${gesture ? ` data-drag="${gesture}"` : ''} aria-label="${label}"${pressed === null ? '' : active(pressed)}>${text}</button>`;
}

export function desk(run, item, tutorial, interaction) {
  if (!item) return '';
  const { note, positions, pencil, inspection, heldDocuments = [], sampleHeld, stampBlocked, benchFindingsOpen, filmCue } = interaction;
  const appearance = sampleAppearance(item.sample);
  const sampleBack = inspection.back && (item.sample.kind !== 'yellow' || inspection.unpacked);
  const issued = run.phase === 'receipt';
  const target = tutorial?.key === 'signature' && !interaction.signed ? 'report' : tutorial?.target;
  const findings = readFindings(interaction);
  const viewer = findings.some((finding) => canShowFinding(item, finding)) ? item : null;
  const shown = item.shownFinding;
  const supplement = item.id === 5 ? run.supplementRequestDraft : null;
  const benchDraft = run.phase === 'case' && !stampBlocked && findings.length ? `<aside class="bench-draft" data-fixture="findings">
    ${button(`查验依据 ${findings.length}`, 'bench-findings', 'bench-draft-toggle', `aria-expanded="${Boolean(benchFindingsOpen)}" aria-controls="bench-findings"`)}
    <div class="bench-draft-body${cls('bench-facing-visitor', viewer)}" id="bench-findings" role="region" aria-label="出票前查验依据"${benchFindingsOpen ? '' : ' hidden'}>${benchFindingsOpen ? findingLines(findings, 'remove-finding', { viewer, shown, supplement }) : ''}</div>
  </aside>` : '';
  const carton = item.carton && !stampBlocked && !issued
    ? '<button type="button" class="carton-fixture" data-act="carton" data-fixture="carton" aria-label="拿近外箱"><span>看外箱</span></button>' : '';
  return `<section class="paper-work"><div class="section-label"><b>收件</b><span>${item.documents.length} 份</span></div><div class="papers">${item.documents.map((doc, index) => paperCard(doc, index, target, positions[index], heldDocuments.includes(index), issued)).join('')}</div>
      ${carton}
      ${pencil ? '<button class="desk-pencil" data-act="egg" data-key="pencil" data-fixture="pencil" aria-label="按住滚过来的铅笔" title="一支铅笔滚过来了"></button>' : ''}</section>
    <section class="sample-work"><button class="sample-preview${cls('instructed', tutorial?.target === 'sample' || filmCue)}" data-act="sample" data-fixture="sample"${sampleHeld ? ' data-lifted' : ''} aria-label="拿起检样，${appearance.name}"${filmCue ? ' aria-describedby="film-bench-cue"' : ''}${issued ? ' disabled' : ''}><span class="sample-visual sample-preview-art${cls('turned', sampleBack)}${cls('peeled', inspection.film)}${cls('unpacked', inspection.unpacked)}" data-kind="${esc(item.sample.kind)}" data-appearance="${appearance.key}">${sampleArt(item.sample, appearance, { back: sampleBack, unpacked: inspection.unpacked })}</span><span class="sample-caption">${appearance.name}</span></button></section>
    <aside class="stamp-rail"><div class="section-label"><b>出票</b><span>${item.carton ? '申报 ' : ''}${esc(item.batch)}</span></div><div class="stamp-buttons">${stampButtons(tutorial?.key === 'stamp', stampBlocked || run.phase !== 'case' || Boolean(tutorial && tutorial.key !== 'stamp'))}<span class="booth-print-slot" aria-hidden="true"><i></i></span></div>
      ${benchDraft || issued ? '' : `<p class="stamp-tip">${note ? `备注 · ${esc(note)}` : '可在纸上记下依据'}</p>`}</aside>${benchDraft}`;
}

function endingReceipt(record, detail, section = '') {
  const day = DAYS[record.day]?.title;
  const lot = record.batch === 'G-204' ? (record.id === 4 ? '原批' : '留厂件') : '';
  const label = [day, lot].filter(Boolean).join(' · ');
  return `<button type="button" class="summary-record ending-receipt" data-act="archive-receipt" data-i="${esc(record.id)}"${section ? ` data-key="${esc(section)}"` : ''}>
    <span class="ending-receipt-batch"><b>${esc(record.batch)}</b><small>${esc(label)}</small></span><span class="ending-receipt-detail">${esc(detail)}</span><span class="ending-receipt-arrow" aria-hidden="true">›</span>
  </button>`;
}

function endingRecallGroup(records, kind, title, detail) {
  if (!records.length) return '';
  return `<section class="ending-recall ending-recall-${kind}"><h3>${title}</h3><ul class="ending-receipts">
    ${records.map((record) => `<li>${endingReceipt(record, detail)}</li>`).join('')}</ul></section>`;
}

function endingView(ending, historyLabel) {
  const { delayedReceipts = [], heldReceipts = [], traceReceipt, traceDisposition, pendingRecalls = [], confirmedRecalls = [], acceptedReceipt } = ending;
  const pendingText = '已申请召回 · 尚未回签';
  const pendingIds = new Set(pendingRecalls.map(({ id }) => id));
  const inIssueOrTrace = new Set([...ending.issues.map(({ id }) => id), traceReceipt?.id]);
  const pending = pendingRecalls.filter(({ id }) => !inIssueOrTrace.has(id));
  const confirmed = confirmedRecalls.filter(({ id }) => !inIssueOrTrace.has(id) && !pendingIds.has(id));
  const shown = new Set([...inIssueOrTrace, ...pendingIds, ...confirmedRecalls.map(({ id }) => id)]);
  const delayed = delayedReceipts.filter(({ id }) => !shown.has(id));
  let note = esc(ending.detail);
  if (ending.issues.length) {
    note = `<ul class="ending-receipts">${ending.issues.map((record) => {
      const { action, reason } = shipmentIssueFeedback(record);
      return `<li>${endingReceipt(record, `${pendingIds.has(record.id) ? pendingText : action} · ${reason}`)}</li>`;
    }).join('')}</ul>`;
  }
  const trace = traceReceipt ? endingReceipt(traceReceipt, traceDisposition.replace(`${traceReceipt.batch} `, '')) : esc(traceDisposition);
  if (ending.id === 'trace' && trace) note = trace;
  return `<div class="stage-overlay ending-overlay"><section class="brief-card ending-card ending-${ending.id}${cls('ending-history', historyLabel)}">
    <header class="ending-head"><div class="eyebrow">南渡防护用品厂 · ${historyLabel ? `${esc(historyLabel)} <span class="ending-history-label">只读</span>` : '交班存根'}</div><h2>${esc(ending.title)}</h2></header>
    <div class="ending-body"><p>${esc(ending.line)}</p><div class="ending-note">${note}</div>
      ${ending.id === 'issue' && trace ? `<div class="ending-note">${trace}</div>` : ''}
      ${acceptedReceipt ? `<section class="ending-recall ending-acceptance"><h3>到货验收</h3>${endingReceipt(acceptedReceipt, '已签收，验收联已归档')}</section>` : ''}
      ${ending.id === 'routine' && heldReceipts.length ? `<details class="ending-held"><summary>翻黄线隔离回执</summary>
        <ul class="ending-receipts">${heldReceipts.map((record) => `<li>${endingReceipt(record, '留厂隔离', 'held')}</li>`).join('')}</ul></details>` : ''}
      ${endingRecallGroup(pending, 'pending', '待召回回执', pendingText)}
      ${endingRecallGroup(confirmed, 'confirmed', '召回确认', '已收下收货方回执')}
      ${delayed.length ? `<details class="ending-delay"><summary><b>仍未放行</b> ${delayed.length} 批来件已符合放行要求</summary>
        <ul class="ending-receipts">${delayed.map((record) => `<li>${endingReceipt(record, dispositionLabel(record), 'delayed')}</li>`).join('')}</ul></details>` : ''}
      <div class="ending-counts">${Object.entries(ending.counts).map(([key, count]) => `<span><b>${count}</b>${labels[key]}</span>`).join('')}</div><div class="ending-stamp">${esc(ending.stamp ?? '交班已存档')}</div>
    </div>
    <footer class="brief-actions ending-footer">${button('翻交接簿', 'archive')}${button(historyLabel ? '返回首页' : '返回窗口', 'home')}${historyLabel ? button('返回交班记录', 'history-index', 'primary') : button('再接一周', 'new', 'primary')}</footer>
  </section></div>`;
}

export function overlay(run, ending, historyLabel = '', incomingCall = null) {
  const day = DAYS[run.day];
  if (run.phase === 'brief') {
    const returning = run.day === 0 && run.sampleSet === 4;
    const subtitle = returning ? '窗口照常开' : day.subtitle;
    const intro = returning ? '老周把钥匙放在桌上。「窗口这周还是你。批号眼熟，也要照手上这批查。」' : day.intro;
    return `<div class="stage-overlay"><section class="brief-card"><div class="eyebrow">代班记录 · 第 ${run.day + 1} 天</div><h2>${day.title}</h2><h3>${esc(subtitle)}</h3><p>${esc(intro)}</p>${button('拉起卷帘', 'start-day', 'primary')}</section></div>`;
  }
  if (run.phase === 'summary') {
    const records = run.records.filter(({ day: dayIndex }) => dayIndex === run.day);
    return `<section class="shift-close-sheet" aria-labelledby="shift-close-title">
      <header class="summary-head"><h2 id="shift-close-title">收班单</h2><small>${day.title} · 质检窗口</small></header>
      <div class="summary-body"><ul class="summary-list">${records.map((record) => {
        const batch = esc(record.batch);
        const decision = esc(labels[record.decision]);
        const destination = esc(dispositionLabel(record));
        return `<li><button type="button" class="summary-record" data-act="archive-receipt" data-i="${esc(record.id)}" aria-label="查看 ${batch} 回执，${decision}，${destination}"><b>${batch}</b><span>${decision} · ${destination}</span></button></li>`;
      }).join('')}</ul>${day.outro ? `<p class="shift-close-note">${esc(day.outro)}</p>` : ''}</div>
      <footer class="summary-footer">${incomingCall ? button('接电话', 'phone', 'secondary summary-phone') : ''}${button('下一班', 'advance-day', 'primary')}</footer>
    </section>`;
  }
  if (run.phase === 'handoff') {
    const exception = getShipmentException(run);
    const needsReview = exception?.record.status === 'shipped';
    const line = needsReview ? `老周「收货方给 ${exception.record.batch} 补来一张复核联。夹在原批旁边了，你看一眼再交班。」`
      : '老周「最后一趟车先等你。核对完这些单，再把板给我。」';
    const open = needsReview ? button('核对到货复核联', 'handoff', 'primary', 'data-key="exception"') : button('打开交接板', 'handoff', 'primary');
    return `<div class="stage-overlay"><section class="brief-card handoff-card"><div class="eyebrow">周五 · 交接板</div><h2>最后一张单</h2><p>${esc(line)}</p><div class="brief-actions">${button('核对与更正', 'archive')}${button(incomingCall ? '接电话' : '打电话', 'phone')}${open}</div></section></div>`;
  }
  if (run.phase === 'ending') return endingView(ending, historyLabel);
  return '';
}

export function dialog(title, body, type = '', footer = '', { closeText = '×', closeLabel = '关闭面板', closeClass = '' } = {}) {
  return `<div class="modal-shade" data-act="shade"><section class="modal ${type}" role="dialog" aria-modal="true" aria-labelledby="panel-title"><header class="modal-head"><h2 id="panel-title">${esc(title)}</h2><button class="modal-close${cls(closeClass, closeClass)}" data-act="close" aria-label="${esc(closeLabel)}">${esc(closeText)}</button></header><div class="modal-body">${body}</div>${footer}</section></div>`;
}

function deskSurface(title, body, type, closeText, page, { headerActions = '', footer = '', closeLabel = '关闭面板', closeClass = '' } = {}) {
  const close = closeText ? `<button class="modal-close surface-close${cls(closeClass, closeClass)}" data-act="close" aria-label="${esc(closeLabel)}">${closeText}</button>` : '';
  return `<section class="desk-surface ${type}" data-desk-surface="${type}"${page === undefined ? '' : ` data-surface-page="${esc(page)}"`} role="region" aria-labelledby="panel-title">
    ${closeText ? `<header class="desk-surface-bar"><h2 id="panel-title">${esc(title)}</h2>${headerActions ? `<div class="desk-surface-tools">${headerActions}${close}</div>` : close}</header>` : `<h2 class="visually-hidden" id="panel-title">${esc(title)}</h2>`}
    <div class="desk-surface-content">${body}</div>${footer ? `<div class="desk-surface-footer">${footer}</div>` : ''}</section>`;
}

export function instructions(how) {
  return dialog(how ? '接班说明' : '桌边查验卡', `<div class="rule-sheet"><p>先认箱签，按送检联核对收到的报告。看批号、签发和检验项目，再按实际品类查镜片、罩壳、手套接缝或插片。</p>
    <ol><li><b>通过</b>　样品合格，有效报告能对应这批，并覆盖送检要求。</li><li><b>不通过</b>　实物确有裂纹、划伤、扣件问题或已查明的错型、超差。</li><li><b>要求审查</b>　报告没交、对不上或没验齐，先隔离，等对方补证或安排复检。</li></ol>
    <p>有换签时对照登记上的旧号和新号。保护膜可以揭角。测插片时先放入量规，再合上量爪。核对过的旧单会留在交接簿。</p>
    ${how ? '<p>点纸张可打开，拖动可挪位置。把纸拖到另一张上稍停，看到「松手并排」就能一起看。可以先记下查验依据。拿着单据或检样时可以抬头看窗口，再接着查验。两指可在系统支持时缩放视图。回到桌面点印章开单，电脑也可用 1、2、3。Esc 合上面板。</p>' : ''}</div>`, 'rules-modal');
}

function moldSketch() {
  return `<figure class="mold-sketch" aria-label="耳杯内侧线位图">
    <div class="mold-sketch-cup" aria-hidden="true"><i></i><i></i><i></i></div>
    <figcaption><span class="mold-sketch-pad">软垫边界</span><span class="mold-sketch-zone">允许线位 <small>外壳下沿</small></span></figcaption>
  </figure>`;
}

function sheet(doc, index, inspection, { clipboardFront = false, reportLookup = false, reportCarry = false, fieldActions, phoneSource, pinAction = '', showTitle = true, leadField } = {}) {
  const action = inspection?.action ?? 'basis';
  const rows = doc.fields.map(([key, value], field) => {
    const text = esc(value);
    const signatureTarget = doc.type === 'report' && inspection?.signature && key === '签发';
    const batchTarget = inspection?.batch && key === '批号' && ['label', 'report'].includes(doc.type);
    const chosen = inspection?.selected.has(`doc:${index}:${field}`);
    const highlight = signatureTarget || (batchTarget && !chosen) ||
      (inspection?.projects && ((doc.type === 'report' && ['外观', '扣合'].includes(key)) || (doc.type === 'order' && key === '检验项目')));
    const batchLabel = batchTarget ? ` data-tutorial-batch aria-label="${esc(`${doc.title}批号 ${value}`)}"` : '';
    const fieldValue = inspection ? `<button class="field-value${cls('instructed', highlight)}" data-act="${action}" data-i="${index}" data-field="${field}"${signatureTarget ? ' data-tutorial-signature' : ''}${batchLabel}${active(chosen)}>${text}</button>` : text;
    const lookup = reportLookup && (key === '报告编号' || key === '原报告编号') && value;
    const carry = reportCarry && lookup && /^R-\d{3}$/.test(value)
      ? button('带这张问', 'phone-document', 'secondary report-lookup',
        `data-i="${index}" data-field="${field}" data-key="${phoneSource}" aria-label="带${esc(doc.title)}到电话旁"`) : '';
    const extension = phoneSource && documentExtension([key, value]);
    const extraAction = extension ? button(`带单问 ${extension}`, 'phone-document', 'secondary document-field-action',
      `data-i="${index}" data-field="${field}" data-key="${phoneSource}" aria-label="带${esc(doc.title)}，填入${esc(CHARACTERS[PHONE[extension].npc].name)}的内线 ${extension}"`) : fieldActions?.get(key);
    const layout = lookup ? 'report-number-value' : extraAction ? 'document-action-value' : '';
    return `<div><dt>${esc(key)}</dt><dd${layout ? ` class="${layout}"` : ''}>${fieldValue}${lookup ? button('查号', 'report-search', 'secondary report-lookup', `data-key="${text}" aria-label="查报告号 ${text}"`) : ''}${carry}${extraAction ?? ''}</dd></div>`;
  });
  const leadIndex = leadField && doc.fields.findIndex(([key]) => key === leadField);
  if (leadIndex > 1) {
    const [leadRow] = rows.splice(leadIndex, 1);
    rows.splice(1, 0, leadRow);
  }
  const heading = showTitle ? `<h3>${esc(doc.title)}</h3>` : '';
  return `<article class="sheet sheet-${doc.type}${cls('sheet-clipboard', clipboardFront)}${cls('trace-inquiry-sheet', doc.kind === 'trace-inquiry')}"${Number.isInteger(index) ? ` data-doc-index="${index}"` : ''}><small>${types[doc.type] ?? '留底'} · 南渡防护用品厂</small>${pinAction ? `<div class="sheet-pin-heading">${heading}${pinAction}</div>` : heading}${clipboardFront ? clipboardFlip(false) : ''}${doc.kind === 'mold-sketch' ? moldSketch() : ''}<dl class="fields">
    ${rows.join('')}</dl>${doc.note ? `<p class="sheet-note">${esc(doc.note)}</p>` : ''}</article>`;
}

export function visitPaper(doc, visit) {
  const [, accept] = visitPaperLabels[visit.kind ?? visit.key] ?? ['', '收下留底'];
  const exception = visit.kind === 'exception';
  const surface = exception ? 'visit-paper-surface receiving-exception-surface' : 'visit-paper-surface';
  const paper = exception ? { ...doc, fields: doc.fields.filter(([field]) => field !== '批号') } : doc;
  return deskSurface(doc.title, sheet(paper, undefined, undefined, { showTitle: false }),
    surface, '放回窗口', visit.key, {
      closeLabel: '放回窗口',
      footer: button(accept, 'event-next', 'primary visit-accept', `data-key="${esc(visit.key)}"`),
    });
}

function orderFieldActions(item, orderIndex, visible, selected) {
  const order = item.documents[orderIndex];
  const actions = new Map();
  const intakeField = order.fields.find(([key]) => key === '随货材料' || key === '随货要求')?.[0];
  if (intakeField && intakeComparison(item, orderIndex)) {
    actions.set(intakeField, button('点收', 'delivery-check', 'secondary document-field-action delivery-check-action', `data-i="${orderIndex}"`));
  }
  const projectField = order.fields.find(([key]) => key === '检验项目' || key === '必查项目')?.[0];
  if (!projectField) return actions;
  const reports = item.documents.flatMap((doc, index) => {
    const comparison = doc.type === 'report' && projectComparison(item, orderIndex, index);
    return comparison ? [{ index, comparison }] : [];
  });
  const paired = reports.find(({ index }) => visible.includes(index));
  const report = paired ?? reports[0];
  if (report) {
    const attributes = `data-i="${orderIndex}" data-key="${report.index}"`;
    const recorded = selected.has(report.comparison.finding.key);
    const action = paired
      ? button(recorded ? '取回对照' : '记下对照', 'project-evidence', 'secondary document-field-action project-field-action', attributes + active(recorded))
      : button('对照报告', 'project-pair', 'secondary document-field-action project-field-action', attributes);
    actions.set(projectField, action);
  }
  return actions;
}

function intakeSlip(item, comparison, orderIndex, selected, supplement) {
  const checked = selected.has(comparison.finding.key);
  const show = checked ? findingShowButton(comparison.finding, item, item.shownFinding, supplement, 'source') : '';
  return `<article class="sheet intake-slip"><small>质检窗口 · 本批收件</small><h3>实收点数条</h3>
    <ul class="intake-received" aria-label="实际收到的单据">${comparison.received.map((title) => `<li>${esc(title)}</li>`).join('')}</ul>
    <div class="modal-actions intake-actions">${button(checked ? '取回依据' : '记下点收', 'delivery-evidence', 'secondary intake-evidence', `data-i="${orderIndex}"${active(checked)}`)}${show}</div></article>`;
}

function relabelSlip(comparison, selected) {
  const field = ({ title, field, value }) => `<span class="relabel-field"><small>${esc(title)}</small><span>${esc(field)}</span><strong>${esc(value)}</strong></span>`;
  const pairs = comparison.pairs.map(({ side, left, right, finding }) => {
    const recorded = selected.has(finding.key);
    const record = button(recorded ? '取回这组' : '记下这组', 'relabel-evidence', 'secondary relabel-evidence',
      `data-i="${comparison.registerIndex}" data-key="${side}"${active(recorded)} aria-label="${recorded ? '取回' : '记下'}${side === 'original' ? '原箱批号对照' : '现箱批号对照'}"`);
    return `<div class="relabel-pair" data-side="${side}">${field(left)}${field(right)}${record}</div>`;
  }).join('');
  return `<article class="sheet relabel-slip"><h3>批号对照</h3>${pairs}</article>`;
}

function tutorialGuide(line, extraClass = '') {
  return `<p class="modal-guide tutorial-guide${cls(extraClass, extraClass)}" aria-live="polite"><b>老周</b> ${esc(line)}</p>`;
}

function clipboardFlip(back) {
  return `<div class="clipboard-actions">${button(back ? '翻回正面' : '翻看夹板背面', 'clipboard-back', 'secondary clipboard-flip')}</div>`;
}

function clipboardBack(caseId) {
  const { title, fields, slots, returnLine } = EASTER_EGGS.cat;
  return `<div class="doc-grid clipboard-grid"><article class="sheet clipboard-back-face"><span class="clipboard-back-clip" aria-hidden="true"></span>
    <div class="cat-inspection-badge"><div class="cat-badge-sketch" aria-hidden="true"><span class="cat-badge-head"></span><span class="cat-badge-body"></span><span class="cat-badge-tail"></span></div>
      <h3>${esc(title)}</h3><dl class="cat-badge-fields">${fields.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>
      ${caseId === slots[1] ? `<p class="cat-badge-note">${esc(returnLine)}</p>` : ''}</div>
    ${clipboardFlip(true)}</article></div>`;
}

function sameFinding(finding, shown) {
  return shown?.key === finding.key && shown.text === finding.text && shown.source === finding.source;
}

function findingShowButton(finding, viewer, shown, supplement, origin = 'list') {
  if (!viewer || !canShowFinding(viewer, finding)) return '';
  const name = CHARACTERS[viewer.npc]?.name;
  if (!name) return '';
  const { key, source, text } = finding;
  const wasSupplied = sameFinding(finding, supplement);
  const wasShown = wasSupplied || sameFinding(finding, shown);
  const pointCount = viewer.id === 5 && key === 'compare:5:intake:1';
  const label = wasSupplied ? '已递点收联' : wasShown ? '已出示' : pointCount ? '递点收联' : `递给${esc(name)}`;
  return button(label, 'show-finding', origin === 'source' ? 'secondary evidence-show-control' : 'finding-show',
    `data-key="${esc(key)}" data-finding-origin="${origin}"${active(wasShown)} aria-label="${wasShown ? '已递给' : '递给'}${esc(name)}看 ${esc(source || text)}"`);
}

function findingLines(findings, removeAction = '', { viewer, shown, supplement } = {}) {
  return `<ul class="finding-lines">${findings.map((finding) => {
    const { key, source, text } = finding;
    const wasSupplied = sameFinding(finding, supplement);
    const wasShown = wasSupplied || sameFinding(finding, shown);
    const marker = !viewer && wasShown ? `<small class="finding-shown">${wasSupplied ? '已列入补件联' : '开单前已出示'}</small>` : '';
    const remove = removeAction ? button('取回', removeAction, 'finding-remove', `data-key="${esc(key)}" aria-label="取回依据 ${esc(text)}"`) : '';
    const show = findingShowButton(finding, viewer, shown, supplement);
    return `<li><div class="finding-description">${source ? `<small class="finding-source">${esc(source)}</small>` : ''}<span>${esc(text)}</span>${marker}</div>
      ${viewer ? `<div class="finding-actions">${show}${remove}</div>` : remove}</li>`;
  }).join('')}</ul>`;
}

function findingsDraft(findings, showFindings, item, supplement) {
  if (!findings.length) return { header: '', list: '' };
  const viewer = findings.some((finding) => canShowFinding(item, finding)) ? item : null;
  return {
    header: button(`查验依据 ${findings.length}`, 'toggle-findings', 'findings-toggle', `aria-expanded="${Boolean(showFindings)}" aria-controls="working-findings"`),
    list: `<div class="working-findings" id="working-findings" role="region" aria-label="已经记录的查验依据"${showFindings ? '' : ' hidden'}>${showFindings ? findingLines(findings, 'remove-finding', { viewer, shown: item?.shownFinding, supplement }) : ''}</div>`,
  };
}

function returnTabs(documents, action, selected, label) {
  return `<nav class="doc-tabs return-tabs" aria-label="${label}">${documents.map(({ title }, index) =>
    button(esc(title), action, 'tab', `data-i="${index}"${active(index === selected)}`)).join('')}</nav>`;
}

function returnComparison(item, index, previous, previousIndex, activeSheet) {
  const day = DAYS.find(({ cases }) => cases.some(({ id }) => id === item.id))?.title;
  const { record, documents, sameLot } = previous;
  return `<div class="return-comparison">
    <section class="return-current"><div class="return-source"><b>${sameLot ? '本次来件' : '留厂件'}</b><small>${esc(day)}</small></div>
      ${returnTabs(item.documents, 'doc', index, '切换本次单据')}${activeSheet(item.documents[index], index)}</section>
    <section class="return-previous" data-previous-doc="${previousIndex}"><div class="return-source"><b>${sameLot ? '前次留底' : '原批留底'}</b><small>${esc(DAYS[record.day]?.title)}</small>
      <span class="return-disposition">${esc(labels[record.decision])} · ${esc(dispositionLabel(record))}</span></div>
      ${returnTabs(documents, 'previous-doc', previousIndex, '切换留底单据')}${sheet(documents[previousIndex], previousIndex, null, { reportLookup: true, phoneSource: record.id })}</section>
  </div>`;
}

export function documents(item, index, compare, tutorial, progress, previous) {
  const doc = item.documents[index];
  if (!doc) return '';
  const clipboardIndex = EASTER_EGGS.cat.documents[item.id];
  if (clipboardIndex !== undefined && progress.clipboardBack) {
    return deskSurface('工艺夹板背面', clipboardBack(item.id), 'documents-surface', '放回台面', 'clipboard-back');
  }
  const extras = item.id === 16 ? button('翻登记本后页', 'egg', 'secondary', 'data-key="umbrella"') : '';
  const other = item.documents[compare];
  const matchBatch = tutorial?.key === 'report';
  const signature = tutorial?.key === 'signature';
  const sampleReady = tutorial?.key === 'sample';
  const visibleTypes = [doc.type, other?.type];
  const reportVisible = visibleTypes.includes('report');
  const labelVisible = visibleTypes.includes('label');
  const batchPairVisible = matchBatch && labelVisible && reportVisible;
  let target = tutorial?.target;
  if (matchBatch && reportVisible) target = labelVisible ? null : 'label';
  if (signature && !progress.signed) target = 'report';
  const findings = readFindings(progress);
  const inspection = {
    batch: batchPairVisible,
    signature: signature && !progress.signed,
    projects: sampleReady && reportVisible && visibleTypes.includes('order'),
    selected: new Set(findings.map(({ key }) => key)),
  };
  const draft = findingsDraft(findings, progress.showFindings, tutorial ? null : item, progress.supplementRequest);
  let guide = tutorial?.line;
  if (batchPairVisible) guide = tutorial.pairLine;
  else if (signature && progress.signed) guide = tutorial.orderLine;
  else if (signature && !reportVisible) guide = tutorial.reportLine;
  let guidedCompare = '';
  if (matchBatch && !batchPairVisible) {
    guidedCompare = button(doc.type === 'report' ? '并排箱签' : '并排报告', 'compare', 'primary tutorial-next', 'data-key="batch"');
  } else if (signature && progress.signed && !progress.orderSeen) {
    guidedCompare = button('并排送检联', 'compare', 'primary tutorial-next', 'data-key="order"');
  }
  const sampleAction = sampleReady ? button('拿起检样', 'sample', 'primary tutorial-next')
    : tutorial ? '' : button('拿起检样', 'sample', 'reference-control');
  const canCompare = !tutorial && previous?.documents?.length;
  const previousIndex = progress.previousDoc;
  const comparing = Boolean(canCompare && Number.isInteger(previousIndex) && previous.documents[previousIndex]);
  const previousAction = canCompare ? button(previous.sameLot
    ? (comparing ? '收起旧单' : '对照前次单据')
    : (comparing ? '收起原批' : '对照原批单据'), 'previous-compare', 'reference-control', active(comparing)) : '';
  const canSpread = !tutorial && !comparing && item.documents.length === 3;
  const spreading = canSpread && progress.spreadAll === true;
  const spreadAction = canSpread ? button(spreading ? '收起三张' : '摊开三张', 'compare-all', 'reference-control', active(spreading)) : '';
  const visible = spreading ? item.documents.map((_, position) => position) : [index, compare];
  const relabel = !tutorial && !comparing && relabelComparison(item, progress.relabelCheck);
  const phoneSources = relabel ? [relabel.registerIndex] : progress.deliveryCheck == null ? visible : [progress.deliveryCheck];
  const contactPaper = phoneSources.find((position) => item.documents[position]?.fields.some(documentExtension));
  const contactDocument = item.documents[contactPaper];
  const contactIndex = contactDocument?.fields.findIndex(documentExtension);
  const extension = !comparing && !progress.incomingCall && documentExtension(contactDocument?.fields[contactIndex]);
  const phoneAction = tutorial ? '' : extension
    ? button(`问${esc(CHARACTERS[PHONE[extension].npc].name)} ${extension}`, 'phone-document', 'reference-control phone-work-tool phone-bring-order',
      `data-i="${contactPaper}" data-field="${contactIndex}" data-key="${item.id}" aria-label="带${esc(contactDocument.title)}，填入${esc(CHARACTERS[PHONE[extension].npc].name)}的内线 ${extension}"`)
    : button(progress.incomingCall ? '接电话' : '拿电话', 'phone', 'reference-control phone-work-tool');
  const headerActions = guidedCompare + draft.header + previousAction + spreadAction + sampleAction + phoneAction;
  const canMeasure = !tutorial && !comparing && item.sample.reading;
  const thickness = canMeasure && thicknessComparison(item, progress.inspection, findings);
  const activeSheet = (page, position) => {
    let fieldActions;
    if (!tutorial && !comparing) {
      if (page.type === 'order') fieldActions = orderFieldActions(item, position, visible, inspection.selected);
      else if (item.carton && page.type === 'label') fieldActions = new Map([['批号', button('看外箱', 'carton', 'secondary document-field-action')]]);
      else if (relabelComparison(item, position)) fieldActions = new Map([['原箱批号',
        button('对批号', 'relabel-check', 'secondary document-field-action', `data-i="${position}"${active(false)}`)]]);
    }
    const thicknessField = gaugeFields[page.type];
    if (canMeasure && thicknessField && page.fields.some(([key]) => key === thicknessField)) {
      fieldActions ??= new Map();
      fieldActions.set(thicknessField, button(thickness ? '核对实测' : '拿插片测', 'sample', 'secondary document-field-action',
        `data-key="thickness" data-i="${position}"`));
    }
    return sheet(page, position, inspection, { clipboardFront: position === clipboardIndex,
      reportLookup: !tutorial, reportCarry: !tutorial, phoneSource: !tutorial ? item.id : null, fieldActions });
  };
  const intakeIndex = progress.deliveryCheck;
  const intake = !tutorial && intakeComparison(item, intakeIndex);
  if (intake) {
    const closeIntake = button('收起点收条', 'delivery-check', 'secondary intake-close', `data-i="${intakeIndex}"${active(true)}`);
    return deskSurface('桌面单据', `${draft.list}<div class="doc-grid pair intake-comparison">${sheet(item.documents[intakeIndex], intakeIndex, inspection, { phoneSource: item.id })}
      ${intakeSlip(item, intake, intakeIndex, inspection.selected, progress.supplementRequest)}</div>`, 'documents-surface', '放回台面', `intake:${intakeIndex}`,
    { headerActions: draft.header + closeIntake + phoneAction });
  }
  if (relabel) {
    const register = item.documents[relabel.registerIndex];
    const collapse = button('收起对照', 'relabel-check', 'secondary relabel-close', `data-i="${relabel.registerIndex}"${active(true)}`);
    return deskSurface('桌面单据', `${draft.list}<div class="doc-grid pair relabel-comparison">${relabelSlip(relabel, inspection.selected)}
      <div class="relabel-register">${sheet(register, relabel.registerIndex, inspection, { phoneSource: item.id })}${extras ? `<div class="modal-actions">${extras}</div>` : ''}</div></div>`,
    'documents-surface', '放回台面', `relabel:${relabel.registerIndex}`, { headerActions: collapse + phoneAction + draft.header });
  }
  if (comparing) return deskSurface('桌面单据', `${draft.list}${returnComparison(item, index, previous, previousIndex, activeSheet)}`,
    'documents-surface', '放回台面', `${index}:previous:${previousIndex}`, { headerActions });
  if (spreading) return deskSurface('桌面单据', `${draft.list}<div class="doc-grid spread">${item.documents.map(activeSheet).join('')}</div>${extras ? `<div class="modal-actions">${extras}</div>` : ''}`,
    'documents-surface', '放回台面', 'spread', { headerActions });
  const tabs = item.documents.map(({ title, type }, position) => {
    const side = other ? (position === index ? '左' : position === compare ? '右' : '') : '';
    return `<button class="button tab${cls('instructed', target === type)}" data-act="doc" data-i="${position}"${active(position === index || position === compare)}>${esc(title)}${side ? `<small class="sheet-side">${side}</small>` : ''}</button>`;
  }).join('');
  const compareAction = !guidedCompare && item.documents.length > 1 ? button(other ? '收起右页' : '并排核对', 'compare') : '';
  const footerActions = compareAction + extras;
  const orderIndex = doc.type === 'order' ? index : other?.type === 'order' ? compare : null;
  const reportIndex = doc.type === 'report' ? index : other?.type === 'report' ? compare : null;
  const projectPair = !tutorial && projectComparison(item, orderIndex, reportIndex);
  return deskSurface('桌面单据', `${guide ? tutorialGuide(guide) : ''}${draft.list}<nav class="doc-tabs" aria-label="${other ? '切换右侧单据' : '单据切换'}">${tabs}</nav>
    <div class="doc-grid${cls('pair', other)}${cls('project-comparison', projectPair)}">${activeSheet(doc, index)}${other ? activeSheet(other, compare) : ''}</div>
    ${footerActions ? `<div class="modal-actions">${footerActions}</div>` : ''}`, 'documents-surface', '放回台面', `${index}:${compare ?? ''}`, { headerActions });
}

function thicknessSlip(comparison, recorded, measured) {
  const fields = comparison.rows.map(({ title, field, value }, index) => `<div class="thickness-field"><dt>${esc(title)} <small>${index === 0 && !measured ? '实测记录' : esc(field)}</small></dt><dd>${esc(value)}</dd></div>`).join('');
  return `<section id="thickness-comparison" class="thickness-comparison" aria-label="厚度对照"><dl>${fields}</dl>
    ${button(recorded ? '取回对照' : '记下三项对照', 'sample-thickness-basis', 'secondary thickness-basis', active(recorded))}</section>`;
}

export function sample(item, inspection, tutorial, progress) {
  const { film, clasp, tug, measured, unpacked } = inspection;
  const spec = item.sample;
  const kind = spec.kind;
  const appearance = sampleAppearance(spec);
  const packaged = kind === 'yellow' && !unpacked;
  const back = !packaged && inspection.back;
  const inGauge = sampleInGauge(spec, inspection);
  const practicing = tutorial?.key === 'sample';
  const stampReady = tutorial?.key === 'stamp';
  const filmHint = !back && !film && filmLessonPending(item, progress);
  const guidedFlip = practicing && !back;
  let guide = '';
  if (stampReady) guide = tutorial.sampleLine;
  else if (practicing) guide = back ? (clasp ? tutorial.tugLine : tutorial.claspLine) : tutorial.frontLine;
  else if (tutorial) guide = '先放下检样，接着核对单据。';
  else if (filmHint) guide = FILM_TUTORIAL;
  const visual = sampleObservation(spec, { ...inspection, back });
  const findings = readFindings(progress);
  const comparison = !tutorial && thicknessComparison(item, inspection, findings);
  const thicknessOpen = Boolean(comparison && progress?.thicknessOpen);
  const thicknessRecorded = comparison && findings.some(({ key }) => key === comparison.finding.key);
  const thicknessLabel = thicknessOpen ? '收起对照' : measured ? '核对厚度' : '核对实测记录';
  const thicknessAction = comparison ? button(thicknessLabel, 'sample-thickness', 'secondary thickness-check', `aria-expanded="${thicknessOpen}"${thicknessOpen ? ' aria-controls="thickness-comparison"' : ''}`) : '';
  const draft = findingsDraft(findings, progress?.showFindings, tutorial ? null : item, progress?.supplementRequest);
  const referenceIndex = progress?.referenceDoc;
  const reference = !tutorial && !thicknessOpen && Number.isInteger(referenceIndex) ? item.documents[referenceIndex] : null;
  const leadField = spec.reading && gaugeFields[reference?.type];
  const referencePicker = reference ? `<aside class="sample-reference" data-reference-doc="${referenceIndex}"><nav class="doc-tabs reference-tabs" aria-label="对照单据">
    ${item.documents.map(({ title }, index) => button(esc(title), 'reference-doc', 'tab', `data-i="${index}"${active(index === referenceIndex)}`)).join('')}
    </nav>${sheet(reference, referenceIndex, { selected: new Set(findings.map(({ key }) => key)) },
      { reportLookup: true, reportCarry: true, phoneSource: item.id, leadField })}</aside>` : '';
  const canCompare = !tutorial && item.documents.length > 0;
  const hasMoldSketch = item.documents.some(({ kind }) => kind === 'mold-sketch');
  const compareLabel = hasMoldSketch ? '对照工艺图' : '对照单据';
  const referenceActions = canCompare
    ? `${progress?.returnToDocs ? button('回到单据', 'reference-back', 'reference-control') : ''}${button(reference ? '收起单据' : compareLabel, 'reference', 'reference-control' + cls('mold-reference-action', hasMoldSketch), active(Boolean(reference)))}`
    : '';
  const phoneAction = tutorial ? '' : button(progress?.incomingCall ? '接电话' : '拿电话', 'phone', 'reference-control phone-work-tool');
  let control = '';
  if (packaged) control = sampleHotspot('unpack', 'pack-handle', '拆袋', '拆开包装');
  if (!back && (kind === 'film' || kind === 'crack')) control = sampleHotspot('film', 'film-handle', film ? '放回' : '揭膜', film ? '放回保护膜' : '揭开膜角', film, filmHint);
  if (appearance.clasp && back && !tug) control = clasp
    ? sampleHotspot('tug', 'clasp-handle', '轻拉', '轻拉检查', null, practicing)
    : sampleHotspot('clasp', 'clasp-handle', '按合', '按合扣件', null, practicing);
  if (spec.reading) control = sampleHotspot('measure', 'gauge-handle', `<span class="gauge-grip-label">${inGauge ? '取出' : '放入'}</span>`,
    inGauge ? '取出量规' : '放进量规', inGauge);
  const clamp = inGauge ? sampleHotspot('gauge-clamp', 'gauge-clamp', measured ? '松开量爪' : '合上量爪', measured ? '松开量爪' : '合上量爪', measured) : '';
  const observation = sampleFinding(spec, inspection);
  const recorded = findings.some(({ key }) => key === observation.key);
  const basisLabel = measured && spec.reading ? (recorded ? '取回实测' : '记下实测') : packaged ? '记下包装' : '记为查验依据';
  const basis = !thicknessOpen && !(measured && thicknessRecorded) && (packaged || !tutorial || tug || film || measured || back || unpacked)
    ? button(basisLabel, 'sample-basis', 'secondary sample-basis-control',
      active(recorded) + (inGauge && !measured ? ' disabled' : '')) : '';
  const gaugeBasis = inGauge && measured ? basis : '';
  const show = recorded && !tutorial ? findingShowButton(observation, item, item.shownFinding, progress?.supplementRequest, 'source') : '';
  const flipAction = packaged || inGauge ? '' : button(back ? `看${appearance.front ?? '正面'}` : '翻到背面', 'sample-flip', guidedFlip ? 'primary tutorial-next sample-flip-control instructed' : 'secondary sample-flip-control');
  const observationCard = inGauge
    ? `<div class="sample-findings gauge-observation"><div aria-live="polite"><b>量规实测</b><p class="reading"><strong>${measured ? esc(spec.reading) : '—'}</strong></p></div>${gaugeBasis}</div>`
    : `<div class="sample-findings"><b>${packaged ? '包装' : back ? '背面' : appearance.front ?? '正面'}</b><p>${esc(visual)}</p>
      ${back && appearance.clasp && clasp && !tug && !practicing ? '<p class="sample-clasp-feedback">已按下扣件，可以轻拉。</p>' : ''}</div>`;
  const title = item.carton ? `${appearance.name} · 箱号待核` : `${item.batch} · ${appearance.name}`;
  return deskSurface(title, `${guide ? tutorialGuide(guide, filmHint ? 'film-tutorial' : '') : ''}${draft.list}<div class="sample-workbench${cls('with-reference', reference)}${cls('with-thickness', thicknessOpen)}"><div class="sample-work-main"><div class="sample-inspector"><div class="sample-visual sample-stage${cls('gauge-stage', spec.reading)}${cls('gauge-loaded', inGauge)}${cls('turned', back)}${cls('peeled', film)}${cls('pulled', tug)}${cls('unpacked', unpacked)}${cls('measured', measured)}" data-kind="${esc(kind)}" data-appearance="${appearance.key}">
    ${sampleArt(spec, appearance, { back, unpacked, control, inspection })}${spec.reading ? gaugeArt(measured ? spec.reading : '', { loaded: inGauge, measured, control: clamp }) : ''}${thicknessAction}</div>
    ${thicknessOpen ? thicknessSlip(comparison, thicknessRecorded, measured) : observationCard}</div>
    <div class="modal-actions">${guidedFlip ? '' : flipAction}${gaugeBasis ? '' : basis}${show}</div></div>${referencePicker}</div>`, 'sample-surface', stampReady ? '回台面开单' : '放下检样', undefined, {
    headerActions: draft.header + (guidedFlip ? flipAction : '') + referenceActions + phoneAction,
    closeLabel: stampReady ? '回台面开单' : '放下检样', closeClass: stampReady ? 'tutorial-next tutorial-stamp-return' : '',
  });
}

export function carton(item, progress) {
  const bottom = progress.cartonBottom === true;
  const order = item.documents.find(({ type }) => type === 'order');
  const reference = order ? sheet({ ...order, fields: order.fields.filter(([field]) => ['批号', '箱底喷码'].includes(field)) }) : '';
  const finding = cartonFinding(item, bottom);
  const selected = finding && readFindings(progress).some(({ key }) => key === finding.key);
  const turn = button(bottom ? '翻回正面' : '翻看箱底', 'carton-turn', 'secondary carton-turn');
  const note = finding ? button(selected ? '已记下' : '记下箱底观察', 'carton-note', 'secondary carton-note', active(selected)) : '';
  const empty = bottom && !item.carton.code ? '<p class="carton-no-ink">箱底没有可辨喷码。</p>' : '';
  const body = `<div class="carton-workbench"><div class="carton-inspect-object">${cartonModel(bottom ? item.carton.code : null, bottom)}${empty}</div>${reference}</div>`;
  return deskSurface('外箱查验', body, 'carton-surface', '放下外箱', bottom ? 'bottom' : 'front', { footer: turn + note, closeLabel: '放下外箱' });
}

function receiptFacts(record, destinationLabel = '去向', showEmptyNote = false, basisLabel = '开单依据') {
  const findings = readFindings(record);
  const shown = record.shownFinding;
  const separate = shown && !findings.some((finding) => sameFinding(finding, shown));
  return `<dl class="receipt-facts"><div><dt>${destinationLabel}</dt><dd>${esc(dispositionLabel(record))}</dd></div>
    ${findings.length || showEmptyNote ? `<div class="receipt-findings"><dt>${basisLabel}</dt><dd>${findings.length ? findingLines(findings, '', { shown, supplement: record.supplementRequest }) : '未另记'}</dd></div>` : ''}
    ${separate ? `<div class="receipt-findings"><dt>开单前出示</dt><dd>${findingLines([shown])}</dd></div>` : ''}</dl>`;
}

function amendmentFindings(entry) {
  const findings = readFindings({ findings: entry.findings });
  if (!findings.length) return '';
  const content = findingLines(findings);
  if (findings.length > 2 || findings.reduce((length, item) => length + item.source.length + item.text.length, 0) > 106) {
    return `<details class="amendment-findings"><summary>更正依据 ${findings.length} 项</summary>${content}</details>`;
  }
  return `<div class="amendment-findings"><b>更正依据</b>${content}</div>`;
}

function recallConfirmation(receipt, index) {
  if (receipt?.amendmentIndex !== index) return '';
  return `<div class="recall-confirmation"><b>收货方回签</b><small>${esc(DAYS[receipt.day]?.title)}</small><span>已确认召回</span></div>`;
}

function receiveRecallAction(record, className, text = '取收货方回执') {
  return button(text, 'receive-recall', `secondary ${className}`, `data-i="${esc(record.id)}" aria-label="取 ${esc(record.batch)} ${esc(DAYS[record.day]?.title)} 收货方回执"`);
}

function amendmentDisposition(record, count, decision, status) {
  return dispositionLabel({ ...record, status, decision, amendments: record.amendments.slice(0, count) });
}

function archivedReceipt(record, latestReceipt, previousReceipt, receivingIssue) {
  if (!record) return '';
  const changed = record.amendments?.length > 0;
  const latestAmendment = latestReceipt?.amendments?.at(-1);
  const windowAmendment = record.amendments?.findLast(({ atWindow }) => atWindow);
  const receiving = receivingIssue ? shipmentIssueFeedback(receivingIssue) : null;
  return `<article class="archive-receipt receipt-${record.decision}" aria-label="出票留底">
    <div class="archive-receipt-head"><div><strong>出票留底</strong><small>${esc(DAYS[record.day]?.title ?? '')}开单${changed ? ` · ${esc(labels[record.original])}` : ''}</small></div>
      <span class="receipt-result">${esc(labels[record.decision])}</span></div>
    ${receiptFacts(record, latestReceipt ? '前次去向' : '现去向', true, changed ? '原开单依据' : '开单依据')}
    ${receiving ? `<dl class="receipt-facts receiving-facts" aria-label="收货方反馈"><div><dt>收货方反馈</dt><dd>${esc(receiving.action)}</dd></div><div><dt>复核记录</dt><dd>${esc(receiving.reason)}</dd></div></dl>` : ''}
    ${latestReceipt ? `<p class="archive-current-disposition">${esc(DAYS[latestAmendment?.day ?? latestReceipt.day]?.title)}${latestAmendment ? '更正' : '复核'}后，现去向为<strong>${esc(dispositionLabel(latestReceipt))}</strong>。</p>` : ''}
    ${previousReceipt && previousReceipt.record.id === record.priorShipmentId ? `<p class="archive-current-disposition">补验时原批已出库，原出货单开于<strong>${esc(DAYS[previousReceipt.record.day]?.title)}</strong>。</p>` : ''}
    ${record.supplementRequest && windowAmendment && windowAmendment.to !== 'review' ? '<p class="archive-current-disposition">补件登记随当场更正撤回。</p>' : ''}
    ${changed ? `<ol class="receipt-amendments" aria-label="更正记录">${record.amendments.map((entry, index) => `<li><b>${esc(DAYS[entry.day]?.title ?? '')}${entry.atWindow ? '当场更正' : '更正'}</b>
      <span>${esc(labels[entry.from])} → ${esc(labels[entry.to])}</span><small>${esc(amendmentDisposition(record, index, entry.from, entry.previousStatus))} → ${esc(amendmentDisposition(record, index + 1, entry.to, entry.status))}</small>${amendmentFindings(entry)}${recallConfirmation(record.recallReceipt, index)}</li>`).join('')}</ol>` : ''}</article>`;
}

export function receipt(record, previous, nextPhase, { supplementKey, canCorrect } = {}) {
  const disposition = {
    shipping: '这批货等装车，回执交装货台。',
    shipped: '这批货已经出库，补签回执归入原批留底。',
    returned: '这批退回，重新送检时另查。',
    held: '这批留在黄线内，等补材料或复检。',
    supplementHeld: '补验联暂留待核。原批已出库，仍按原单追查。',
    supplementReturned: '本次补验联退回。原批已出库，仍按原单追查。',
    recallPending: '已发出召回申请，等收货方回签。',
    recalled: '已确认召回，下一班按留底复检。',
  }[receiptDisposition(record)];
  const original = previous && previous.id === record.priorShipmentId
    ? button('原出货回执', 'archive-receipt', 'receipt-origin', `data-i="${esc(previous.id)}" aria-label="查看原出货回执 · ${esc(DAYS[previous.day]?.title)}"`)
    : '';
  const copy = button(canCorrect ? '留底与更正' : '翻本批留底', 'archive-receipt', 'receipt-origin', `data-i="${esc(record.id)}"`);
  const supplement = supplementKey ? button('补件登记联', 'archive-evidence', 'receipt-origin', `data-key="${esc(supplementKey)}"`) : '';
  const next = nextPhase === 'summary' ? '递单收工' : nextPhase === 'handoff' ? '递单交班' : '递回执';
  const amendment = record.amendments?.at(-1);
  const correctedHere = amendment?.atWindow === true;
  const currentSlip = correctedHere
    ? { ...record, findings: amendment.findings, note: '', shownFinding: null, supplementRequest: null }
    : record;
  const change = correctedHere ? `<p class="receipt-window-change"><b>当场更正</b> ${labels[amendment.from]} → ${labels[amendment.to]}</p>` : '';
  const findings = readFindings(currentSlip);
  const shownSeparately = currentSlip.shownFinding && !findings.some((finding) => sameFinding(finding, currentSlip.shownFinding));
  const findingCount = findings.length + (shownSeparately ? 1 : 0);
  const basis = findingCount ? button(`查看依据 <b>${findingCount} 条</b> <span aria-hidden="true">↓</span>`, 'receipt-basis', 'receipt-basis-link') : '';
  const batch = record.id === 17 ? `申报 ${esc(record.batch)}` : esc(record.batch);
  const body = `<div class="receipt-slip receipt-${record.decision}"><div class="eyebrow">成品抽检窗口 · 出票留底</div><b>${batch}</b><span class="receipt-result">${labels[record.decision]}</span>${change}${basis}${disposition ? `<p class="receipt-disposition">${disposition}</p>` : ''}${receiptFacts(currentSlip, '去向', correctedHere || record.decision === 'review', correctedHere ? '更正依据' : '开单依据')}</div>`;
  return deskSurface('出货回执', body, 'receipt-surface', undefined, undefined, { footer: original + supplement + copy + button(next, 'next', 'primary') });
}

function correctionPanel(record, findings, selected, supportingBasis) {
  const originals = readFindings(record).filter(({ key }) => key.startsWith('sample:') || key.startsWith('compare:') || key.startsWith('box:'));
  const option = ({ key, source, text }) =>
    button(`<small>${esc(source)}</small><span>${esc(text)}</span>`, 'correction-original', 'secondary correction-original', `data-key="${esc(key)}"${active(selected.has(key))}`);
  return `<section class="correction-panel" aria-label="本次更正依据">
    ${findings.length ? `<div class="correction-draft"><b>更正依据 ${findings.length}</b>${findingLines(findings, 'correction-remove')}</div>`
      : supportingBasis ? '' : '<p class="correction-help">可点单据字段，留下本次更正依据。</p>'}
    ${supportingBasis ? `<div class="correction-originals"><b>${esc(supportingBasis.label)}</b><div class="correction-original-options">${option(supportingBasis.finding)}</div></div>` : ''}
    ${originals.length ? `<div class="correction-originals"><b>沿用原查验记录</b><div class="correction-original-options">${originals.map(option).join('')}</div></div>` : ''}
  </section>`;
}

function correctionStamps(row, followup, traceReview) {
  const { record, previousReceipt } = row;
  const disposition = receiptDisposition(record);
  const source = disposition === 'supplementHeld' || disposition === 'supplementReturned' ? '补验联'
    : previousReceipt?.sameLot === false ? '留厂件'
      : followup?.previousReceipt?.sameLot === false ? '原批' : '出货回执';
  const reviewEffect = { recallPending: '审查后发出召回', held: '审查后留厂复检' }[traceReview?.status];
  return `<p id="correction-target" class="correction-target"><b>${esc(record.batch)}</b><small>${esc(DAYS[record.day]?.title)} · ${source}</small>${reviewEffect ? `<small>${reviewEffect}</small>` : ''}</p>
    <div class="stamp-buttons archive-correction" role="group" aria-label="更正开单" aria-describedby="correction-target">${stampButtons(false, false, 'recheck', record.decision)}</div>`;
}

export function archivePanel(rows, visits, focus, selected, query, editing, handoff, finished = false, { returnTo, canComparePrevious, correctionFindings = [], batchPapers = [], supportingBasis, reportSuggestion, historyLabel, windowCorrection, receivingIssue } = {}) {
  const row = rows.find(({ id }) => id === focus);
  const visit = visits.find(([key]) => key === focus)?.[1];
  const isCall = ([key]) => key.startsWith('call:');
  const evidenceIndex = (entries, title) => entries.length ? `<h3 class="archive-group-title">${title}</h3>${entries.map(([key, doc]) =>
    `<button class="record-button archive-visit-row" data-act="archive-evidence" data-key="${esc(key)}"${active(key === focus)}><b>${esc(doc.title)}</b></button>`).join('')}` : '';
  const visitIndex = evidenceIndex(visits.filter((entry) => !isCall(entry)), '回访留底');
  const callIndex = evidenceIndex(visits.filter(isCall), '电话留底');
  const records = rows.slice().reverse().map(({ id, batch, title, record, latestReceipt }) => {
    const status = latestReceipt ? '前次回执' : record ? dispositionLabel(record) : '本班来件';
    return `<button class="record-button" data-act="archive-focus" data-i="${id}"${active(id === focus)}><b>${esc(batch)}</b><span>${esc(title)}</span><small>${esc(status)}</small></button>`;
  }).join('');
  const index = `${visitIndex}${callIndex}${visits.length && rows.length ? '<h3 class="archive-group-title">批次单据</h3>' : ''}${records}`;
  let details = '<p class="archive-empty">选一张留底，可以翻看原来的单据。</p>';
  let footer = '';
  if (visit) {
    const attached = batchPapers.find(({ key }) => key === focus);
    const original = visit.kind === 'trace-inquiry'
      ? button('摊开通话单据', 'report-search', 'secondary', `data-key="${esc(visit.reportNumber)}"`) +
        (visit.originalFiled ? button('查看已收原件', 'archive-evidence', 'secondary', 'data-key="trace"') : '')
      : attached ? button(batchPaperLabels[visit.kind].original, 'archive-followup', 'secondary', `data-i="${esc(attached.caseId)}"`)
      : visit.kind === 'lab-request' ? button('查看当时的单据', 'archive-followup', 'secondary registration-source', `data-i="${esc(visit.caseId)}"`) : '';
    details = (original ? `<div class="modal-actions archive-actions">${original}</div>` : '') + sheet(visit);
  }
  if (row) {
    const { latestReceipt, previousReceipt } = row;
    const canAmend = !finished && (handoff || windowCorrection) && row.record && !latestReceipt;
    const correcting = Boolean(editing && canAmend);
    const findings = correcting ? readFindings({ findings: correctionFindings }) : [];
    const correction = correcting ? { action: 'correction-basis', selected: new Set(findings.map(({ key }) => key)) } : null;
    if (correcting) footer = correctionStamps(row, rows.find(({ previousReceipt }) => previousReceipt?.record?.id === row.id));
    const actions = [
      canComparePrevious && button('放到桌上对照', 'previous-compare', 'secondary', `data-i="${row.id}"`),
      previousReceipt && button(previousReceipt.sameLot ? '查看前次回执' : '查看前次同号回执', 'archive-followup', 'secondary', `data-i="${esc(previousReceipt.record.id)}"`),
      latestReceipt && button('查看后续回执', 'archive-followup', 'secondary', `data-i="${latestReceipt.id}"`),
      ...batchPapers.filter(({ caseId }) => caseId === row.id).map(({ key, document }) =>
        button(batchPaperLabels[document.kind].open, 'archive-evidence', 'secondary', `data-key="${esc(key)}"`)),
      canAmend && handoff && row.record.status === 'recallPending' && receiveRecallAction(row.record, 'archive-recall-action'),
      canAmend && button(editing ? '取消更正' : windowCorrection ? '更正本单' : '更正开单', 'edit-record',
        windowCorrection ? 'secondary window-edit-current' : 'secondary'),
    ].filter(Boolean).join('');
    details = `${actions ? `<div class="modal-actions archive-actions">${actions}</div>` : ''}
      ${correction ? correctionPanel(row.record, findings, correction.selected, supportingBasis) : ''}
      ${archivedReceipt(row.record, latestReceipt, previousReceipt, receivingIssue)}<div class="doc-grid">${row.documents.map((doc, index) => sheet(doc, index, correction, {
        reportLookup: !editing, phoneSource: !finished && !editing ? row.id : null,
        pinAction: !finished && !editing ? phonePinButton(row.id, index, doc.title, selected, 'archive-paper-pin') : '',
      })).join('')}</div>`;
  }
  const navigation = { phone: '回到电话', handoff: '回到交接板', receipt: '回到回执' }[returnTo];
  const suggestion = reportSuggestion && !editing ? button(`并排核对 ${esc(reportSuggestion)}`, 'report-search', 'secondary report-index-suggestion', `data-key="${esc(reportSuggestion)}"`) : '';
  const heading = historyLabel ? `交接簿 · ${historyLabel}` : '交接簿';
  return deskSurface(heading, `<div class="archive-layout"><div><form class="archive-search" data-form="archive"><label for="archive-query">查找批号或报告号</label><div><input id="archive-query" name="query" value="${esc(query)}" placeholder="输入编号"><button class="button secondary">查找</button></div></form>
    ${suggestion}<div class="drawer-list" aria-label="留档单据">${index || '<p>没有找到匹配的单据。</p>'}</div></div>
    <div class="archive-detail">${details}</div></div>`, 'archive-surface', navigation || '合上簿子', query,
    { footer, closeLabel: navigation || '关闭面板' });
}

function phonePinButton(id, index, title, pinned, className) {
  const selected = pinned.some((paper) => paper.id === id && paper.index === index);
  const text = selected ? '取回单据' : '带到电话旁';
  return button(text, 'archive-pin', `secondary ${className}`,
    `data-i="${id}" data-doc="${index}"${active(selected)} aria-label="${text} · ${esc(title)}"`);
}

export function archiveReportPanel(number, sources, pinned, { returnTo, finished, historyLabel, fromInquiry, fromPhoneLookup } = {}) {
  const closeText = { phone: '回到电话', docs: '回到单据', sample: '回到检样', receipt: '回到回执' }[returnTo] ?? '合上簿子';
  const back = button(fromInquiry ? '回到电话登记' : '返回交接簿', 'report-index-back', 'secondary report-index-back');
  const phoneAction = !finished && returnTo !== 'phone' ? button('拿电话', 'phone', 'secondary report-index-phone') : '';
  const papers = sources.map(({ id, batch, day, document, index }) => {
    const pin = finished ? '' : phonePinButton(id, index, `${batch} ${document.title}`, pinned, 'report-index-pin');
    const original = button('查看原单', 'report-index-paper', 'secondary', `data-i="${esc(id)}" data-doc="${esc(index)}" aria-label="查看 ${esc(batch)} ${esc(document.title)} 原单"`);
    return `<section class="report-index-paper" aria-label="${esc(batch)} ${esc(document.title)}"><div class="report-index-source"><b>${esc(batch)}</b><small>${esc(DAYS[day]?.title)}</small></div>
      <div class="modal-actions report-index-actions">${pin}${original}</div>${sheet(document, index)}</section>`;
  }).join('');
  const heading = [`报告号 ${number}`, historyLabel].filter(Boolean).join(' · ');
  const note = fromPhoneLookup && sources.length === 1 ? '<p class="report-index-note">目前只查到这一张留底。</p>' : '';
  return deskSurface(heading, papers ? `${note}<div class="report-index-papers">${papers}</div>` : '<p class="archive-empty">交接簿里还没有这个报告号的留底。</p>',
    'archive-surface report-index-surface', closeText, number, { headerActions: back + phoneAction, closeLabel: closeText });
}

export function archiveSourcePaper({ id, index, batch, day, document }, pinned, { returnTo, finished, historyLabel } = {}) {
  const closeText = { phone: '回到电话', 'report-index': '回到编号索引' }[returnTo] ?? '合上单据';
  const pin = finished ? '' : phonePinButton(id, index, document.title, pinned, 'archive-source-pin');
  const heading = [batch, DAYS[day]?.title, historyLabel].filter(Boolean).join(' · ');
  const paper = sheet(document, index, null, { phoneSource: !finished ? id : null });
  return deskSurface(heading, paper, 'archive-surface archive-source-surface', closeText, `${id}:${index}`, { closeLabel: closeText, headerActions: pin });
}

function contactSlip(extension, number, phoneBottom, batchPaper = null, carry = false) {
  const { department, purpose, npc } = PHONE[extension];
  const source = batchPaper ? ` · ${carry ? '带 ' : ''}${batchPaper.batch} ${batchPaper.title}` : '';
  const attributes = carry ? ` data-i="${batchPaper.id}" data-doc="${batchPaper.index}"` : '';
  return `<button type="button" class="phone-contact" data-act="phone-select" data-key="${extension}"${attributes}${active(number === extension)}${phoneBottom ? ' disabled' : ''}>
    <strong>${extension}</strong><b>${esc(department)} · ${esc(CHARACTERS[npc].name)}</b><small>${esc(purpose + source)}</small>
  </button>`;
}

export function phone(number, call, pinned, phoneBottom, current, { returnTo, incomingCall, reportLookup } = {}) {
  const order = current?.documents.findIndex(({ type, fields }) =>
    type === 'order' && fields.some((field) => documentExtension(field) === '204')) ?? -1;
  const labOrder = order >= 0 ? { id: current.id, index: order, batch: current.batch, title: current.documents[order].title } : null;
  const canBring = labOrder && !pinned.some(({ id, index }) => id === labOrder.id && index === labOrder.index);
  const nightPaper = pinned.findLast(({ document }) => document?.fields.some((field) => documentExtension(field) === '107'));
  const reportNumberOf = (document) => document?.fields.find(([label]) => label === '报告编号' || label === '原报告编号')?.[1];
  const readyToAsk = reportLookup && pinned.filter(({ document }) => reportNumberOf(document) === reportLookup).length === 2;
  const redialPrompt = number === call?.number ? '再按「拨出」。' : '再拨 204。';
  const readyNote = readyToAsk ? `<p class="phone-redial" role="status" data-report-redial>两张单已放好，${redialPrompt}</p>` : '';
  const papers = pinned.length ? `<div class="phone-pinned phone-papers" aria-label="电话旁的单据"><b>电话旁</b><ul>
    ${pinned.map(({ id, index, batch, document }) => {
    const title = document?.title ?? '批次留底';
    const reportNumber = reportNumberOf(document);
    return `<li><button type="button" class="phone-paper" data-act="phone-paper" data-i="${id}"${index === null ? '' : ` data-doc="${index}"`} aria-label="查看 ${esc(batch)} ${esc(title)}${reportNumber ? ` ${esc(reportNumber)}` : ''}"><b>${esc(batch)}</b><span>${esc(title)}</span>${reportNumber ? `<small>${esc(reportNumber)}</small>` : ''}</button></li>`;
  }).join('')}
  </ul></div>` : '';
  const actions = `<footer class="modal-actions phone-actions">${incomingCall ? button('接电话', 'phone-answer', 'secondary phone-answer') : ''}${button('交接簿', 'archive')}${button(phoneBottom ? '翻回正面' : '翻看机底', 'phone-back')}</footer>`;
  const returnLabel = { docs: '回到单据', sample: '回到检样', archive: '回到交接簿', 'report-index': '回到编号索引', 'archive-paper': '回到原单' }[returnTo];
  const closeText = returnLabel || '放下听筒';
  const closeLabel = returnLabel ? `放下听筒，${returnLabel}` : closeText;
  const caller = call ? [call.kind === 'incoming' ? '来电' : '', CHARACTERS[call.npc]?.name ?? '内线', call.number].filter(Boolean).map(esc).join(' · ') : '';
  const registration = call?.kind === 'trace'
    ? button('查看本次登记', 'archive-call', 'secondary phone-registration', `data-key="${TRACE_INQUIRY_KEY}"`)
    : PHONE['204'].requests[call?.caseId] ? button('查看登记留底', 'archive-call', 'secondary phone-registration', `data-i="${esc(call.caseId)}"`) : '';
  const lookup = reportLookup ? button(`${readyToAsk ? '再看' : '查号'} ${esc(reportLookup)}`, 'report-search', 'secondary phone-registration',
    `data-key="${esc(reportLookup)}" aria-label="在交接簿查报告号 ${esc(reportLookup)}"`) : '';
  const face = phoneBottom
    ? `<div class="phone-face phone-face-bottom" role="group" aria-label="电话机底"><span class="phone-base-hardware" aria-hidden="true"></span><span class="phone-service-label"><span>内线</span><strong>880</strong><small>回铃自测</small></span></div>`
    : `<div class="phone-face phone-face-front"><div class="phone-head"><span class="phone-cradle" aria-hidden="true"><i></i><i></i></span><div class="phone-screen" aria-live="polite">${esc(number || '— — —')}</div>${readyNote}</div><div class="phone-pad">${'1234567890'.split('').map((n) => `<button data-act="phone-digit" data-key="${n}">${n}</button>`).join('')}<button data-act="phone-clear" aria-label="删除一位">⌫</button><button class="phone-call" data-act="dial" aria-label="拨出">拨出</button></div></div>`;
  const directory = `<section class="phone-directory" aria-label="窗口内线">
    ${nightPaper ? contactSlip('107', number, phoneBottom, { batch: nightPaper.batch, title: nightPaper.document.title }) : ''}
    ${contactSlip('204', number, phoneBottom, labOrder, canBring)}
    ${!phoneBottom && !call ? '<p class="phone-guide">点内线填号，再按「拨出」。若单据另写了经手窗口，可带那张纸来问。</p>' : ''}
  </section>`;
  return dialog('窗口电话', `<div class="phone-layout"><div class="phone-machine" data-phone-face="${phoneBottom ? 'bottom' : 'front'}">${face}</div>
    <div class="phone-side">${directory}
    ${papers}
    <div class="phone-log" aria-live="polite"${call ? '' : ' hidden'}>${call ? `<b>${caller}</b>${call.lines.map((line) => `<p>${esc(line)}</p>`).join('')}` : ''}${lookup}${registration}</div>
    </div></div>`, 'phone-modal', actions, { closeText, closeLabel, closeClass: 'phone-hangup' });
}

function handoffPairSide(row, source, original) {
  const { id, batch, record, documents, latestReceipt, previousReceipt } = row;
  const day = DAYS[record.day]?.title;
  const papers = documents.map(({ title, fields }) => {
    const numbers = fields.filter(([label]) => label === '报告编号' || label === '原报告编号').map(([, value]) => value);
    return { title, numbers };
  });
  const primaryPaper = papers.find(({ numbers }) => numbers.length);
  const reference = primaryPaper ? `<span>${esc(primaryPaper.title)}</span><strong>${esc(primaryPaper.numbers.join(' · '))}</strong>` : `<span>实收 ${papers.length} 份</span>`;
  const paperList = papers.filter((paper) => paper !== primaryPaper).map(({ title, numbers }) =>
    `<li><span>${esc(title)}</span>${numbers.length ? `<small>${esc(numbers.join(' · '))}</small>` : ''}</li>`).join('');
  return `<section class="handoff-pair-side"><header class="handoff-pair-head">
    <div class="handoff-pair-source"><small>${source}</small><h4>${esc(day)} <small class="handoff-pair-batch">${esc(batch)}</small></h4></div>
    <span class="handoff-pair-stamp">${esc(labels[record.decision])}</span>
    <p class="handoff-pair-disposition"><small>${latestReceipt ? '前次去向' : '现去向'}</small> <b>${esc(dispositionLabel(record))}</b></p></header>
    <div class="handoff-pair-actions">${button(`核对${esc(day)}这笔`, 'handoff-focus', 'secondary handoff-pair-open', `data-i="${esc(id)}" aria-label="核对${esc(day)}这笔 ${source} ${esc(batch)}"`)}
      <div class="handoff-pair-reference">${reference}</div></div>
    ${paperList ? `<ul class="handoff-pair-papers" aria-label="该次来件其余原单">${paperList}</ul>` : ''}
    ${original && original.record.id === record.priorShipmentId ? '<p class="handoff-pair-note">补验时原批已出库。</p>' : ''}
    <details class="handoff-pair-receipt"><summary>展开回执</summary>${archivedReceipt(record, latestReceipt, previousReceipt)}</details>
  </section>`;
}

function handoffAttach(run, key, document) {
  const attached = run.flags[`${key}Attached`];
  const label = attached ? '已夹入 · 取回' : key === 'trace' ? '随板提交' : '夹入交接板';
  return button(label, 'attach', attached ? 'primary' : 'secondary',
    `data-key="${key}"${active(attached)} aria-label="${attached ? '取回' : label} ${esc(document.title)}"`);
}

function traceHandoffNotice(row, review, attached) {
  const disposition = receiptDisposition(row.record);
  const submission = {
    recallPending: '交班时发出召回申请，等收货方回签。',
    held: '交班时撤下待发货，留厂复检。',
  }[review?.status];
  const current = {
    recallPending: '召回已发出，可先取收货方回执。',
    recalled: '收货方已回签，下一班复检。',
    held: '这批已经留厂，原件可随板交给下一班。',
    returned: '这批已经退回，原件可与退件记录一同留存。',
  }[disposition];
  const note = submission && !attached ? `随板提交后，${submission}` : submission ?? current;
  return note ? `<p class="trace-handoff-status" role="status">${esc(note)}</p>` : '';
}

function traceExcerpt(document, names) {
  const fields = document.fields.filter(([name]) => names.includes(name));
  return `<article class="sheet trace-paper"><h4>${esc(document.title)}</h4><dl class="fields">${fields.map(([name, value]) =>
    `<div><dt>${esc(name)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl></article>`;
}

function traceEvidencePair(row, original) {
  const copy = row.documents.find(({ type, fields }) => type === 'report' &&
    fields.some(([label, number]) => label === '报告编号' && number === 'R-071'));
  if (!copy) return sheet(original);
  return `<div class="trace-evidence-pair" aria-label="随货核验联与实验室原件">${traceExcerpt(copy, ['批号', '报告编号'])}
    ${traceExcerpt(original, ['样品来源', '检验范围'])}</div>`;
}

export function handoffPanel(run, evidence, rows, { focus, documentIndex, correctionFindings = null, batchPapers = [], supportingBasis, comparison = null, canCompare = false, traceReview = null } = {}) {
  const following = new Map(rows.filter(({ previousReceipt }) => previousReceipt).map((row) => [row.previousReceipt.record.id, row]));
  const batchPaperNotes = new Map(batchPapers.map(({ caseId, document }) => [caseId, ` · 有${batchPaperLabels[document.kind].tab}`]));
  const provenance = (row) => {
    const day = DAYS[row.record.day]?.title;
    const lot = row.previousReceipt?.sameLot === false ? '留厂件' : following.get(row.id)?.previousReceipt.sameLot === false ? '原批' : '';
    return [day, lot].filter(Boolean).join(' · ');
  };
  const dispositions = { recallPending: statuses.recallPending, shipping: '排车待发', held: '黄线隔离', returned: '退回',
    supplementHeld: statuses.supplementHeld, supplementReturned: statuses.supplementReturned, recalled: '召回确认', shipped: '已出库' };
  const currentRows = rows.filter(({ latestReceipt }) => !latestReceipt);
  const groups = Object.entries(dispositions).map(([status, title]) => {
    const group = currentRows.filter(({ record }) => receiptDisposition(record) === status);
    if (!group.length) return '';
    const pending = status === 'recallPending';
    const documentOnly = status === 'supplementHeld' || status === 'supplementReturned';
    return `<section class="handoff-group" data-disposition="${status}"><h3>${title}<small>${group.length} ${documentOnly ? '张' : '批'}</small></h3><ul class="handoff-slips">
      ${group.map((row) => `<li${pending ? ' class="handoff-recall-chip"' : ''}><button type="button" class="handoff-slip" data-act="handoff-focus" data-i="${esc(row.id)}"${active(focus === row.id)}><b>${esc(row.batch)}</b><small>${esc(provenance(row))}${esc(batchPaperNotes.get(row.id))}</small></button>${pending ? receiveRecallAction(row.record, 'handoff-recall-action', '取回执') : ''}</li>`).join('')}</ul></section>`;
  }).join('');
  const attachmentKeys = ['trace', 'night'].filter((key) => run.flags[`${key}Document`]);
  const attachmentIndex = attachmentKeys.length ? button('交接附件', 'handoff-attachments', 'secondary handoff-attachments-entry', active(focus === 'attachments')) : '';
  const row = rows.find(({ id }) => id === focus);
  const comparing = row && comparison;
  let header = '<h3>出货回执</h3>';
  let detail = '<p class="handoff-empty">从板上选一张回执核对。</p>';
  const finishNote = run.flags.traceAttached && { recallPending: '登记 G-241 召回', held: '留厂复检 G-241' }[traceReview?.status];
  const finish = button(finishNote ? `<span>拉铃交班</span><small>${finishNote}</small>` : '拉铃交班', 'finish',
    finishNote ? 'primary trace-handoff-finish' : 'primary');
  let actions = button('回看全周出货', 'archive') + finish;
  let notice = '';

  if (focus === 'attachments' && attachmentKeys.length) {
    const traceRow = run.flags.traceDocument && rows.find(({ id }) => id === TRACE_CASE_ID);
    header = traceRow ? `<div class="trace-attachment-heading"><h3>交接附件</h3><small>${esc(traceRow.batch)} · ${esc(dispositionLabel(traceRow.record))}</small></div>`
      : '<h3>交接附件</h3>';
    if (traceRow) notice = traceHandoffNotice(traceRow, traceReview, run.flags.traceAttached);
    detail = `<div class="handoff-attachments">${attachmentKeys.map((key) => {
      const document = evidence[key];
      const clip = handoffAttach(run, key, document);
      if (key === 'trace' && traceRow) {
        const open = button('看 G-241 回执', 'handoff-focus', 'secondary', `data-i="${traceRow.id}" data-doc="receipt"`);
        const cite = traceReview ? button('用原件更正', 'edit-record', 'secondary', `data-i="${traceRow.id}" data-key="trace"`) : '';
        return `<div class="handoff-evidence"><div class="modal-actions trace-evidence-actions">${open}${cite}${clip}</div>${traceEvidencePair(traceRow, document)}</div>`;
      }
      return `<div class="handoff-evidence">${sheet(document)}${clip}</div>`;
    }).join('')}</div>`;
  } else if (comparing) {
    const { earlier, later, sameLot } = comparison;
    const [firstSource, lastSource] = sameLot ? ['前次来件', '后次来件'] : ['原批', '留厂件'];
    const closeComparison = button('收起并排', 'handoff-compare', 'secondary handoff-detail-compare', active(true));
    header = `<div class="handoff-detail-heading handoff-pair-heading"><div class="handoff-detail-name"><h3>${esc(row.batch)}</h3><small>${firstSource} · ${lastSource}</small></div>
      <div class="handoff-detail-tools">${closeComparison}</div></div>`;
    detail = `<div class="handoff-pair" aria-label="同号来件回执对照">${handoffPairSide(earlier, firstSource)}${handoffPairSide(later, lastSource, sameLot ? earlier : null)}</div>`;
  } else if (row) {
    const { record, latestReceipt, previousReceipt, documents } = row;
    const next = following.get(row.id);
    const editing = !latestReceipt && correctionFindings !== null;
    const findings = editing ? readFindings({ findings: correctionFindings }) : [];
    const correction = editing ? { action: 'correction-basis', selected: new Set(findings.map(({ key }) => key)) } : null;
    const attachedPapers = batchPapers.filter(({ caseId }) => caseId === row.id);
    const attached = attachedPapers.find(({ document }) => document.kind === documentIndex);
    const doc = attached?.document ?? documents[documentIndex];
    const tracePaper = attached?.document.kind === 'trace';
    const tabs = `<nav class="doc-tabs handoff-detail-tabs" aria-label="本批归档单据">
      ${button('回执', 'handoff-doc', 'tab', `data-key="receipt"${active(!doc)}`)}${documents.map(({ title, type }, index) =>
        button(types[type] ?? '归档', 'handoff-doc', 'tab', `data-i="${index}"${active(index === documentIndex)} aria-label="${esc(title)}" title="${esc(title)}"`)).join('')}
      ${attachedPapers.map(({ document }) => button(batchPaperLabels[document.kind].tab, 'handoff-doc', 'tab',
        `data-key="${esc(document.kind)}"${active(document === doc)} aria-label="${esc(document.title)}"`)).join('')}</nav>`;
    const citeTrace = tracePaper && traceReview;
    const editAction = !latestReceipt && !editing ? button(citeTrace ? '用原件更正' : '更正开单', 'edit-record', 'secondary handoff-detail-edit',
      `data-i="${esc(row.id)}"${citeTrace ? ' data-key="trace"' : ''}`) : '';
    const compareAction = canCompare && !editing ? button('并排核对', 'handoff-compare', 'secondary handoff-detail-compare', active(false)) : '';
    const tools = compareAction ? `<div class="handoff-detail-tools">${compareAction}${editAction}</div>` : editAction;
    const status = !latestReceipt && !editing && record.status === 'recallPending'
      ? receiveRecallAction(record, 'handoff-detail-status handoff-detail-recall')
      : `<span class="handoff-detail-status">${esc(dispositionLabel(latestReceipt ?? record))}</span>`;
    header = `<div class="handoff-detail-heading"><div class="handoff-detail-name"><h3>${esc(row.batch)}</h3><small>${esc(provenance(row))}</small></div>${status}
      ${tools}</div>${tabs}`;
    const related = [
      previousReceipt && button(previousReceipt.sameLot ? '前次回执' : '原批回执', 'handoff-focus', 'secondary', `data-i="${esc(previousReceipt.record.id)}"`),
      (latestReceipt || next) && button(next?.previousReceipt.sameLot === false ? '留厂件回执' : '后续回执', 'handoff-focus', 'secondary', `data-i="${esc(latestReceipt?.id ?? next.id)}"`),
    ].filter(Boolean).join('');
    const draft = correction ? correctionPanel(record, findings, correction.selected, supportingBasis) : '';
    const paper = tracePaper ? traceEvidencePair(row, doc)
      : doc ? sheet(doc, documentIndex, attached ? null : correction) : archivedReceipt(record, latestReceipt, previousReceipt);
    const quotingActivePaper = attached && attached.document.kind === supportingBasis?.kind;
    detail = `${quotingActivePaper ? draft + paper : paper + draft}
      ${related && !editing ? `<div class="modal-actions handoff-related">${related}</div>` : ''}`;
    if (tracePaper && !editing) {
      actions = handoffAttach(run, 'trace', doc) + actions;
      notice = traceHandoffNotice(row, traceReview, run.flags.traceAttached);
    }
    if (editing) actions = correctionStamps(row, next, row.id === TRACE_CASE_ID ? traceReview : null) +
      button('取消更正', 'edit-record', 'secondary handoff-cancel', `data-i="${esc(row.id)}"`);
  }

  return dialog('周五交接', `<div class="handoff-paper handoff-sheet"><p class="handoff-instruction">点批号核对原单，改章另开更正联。</p>
    <div class="handoff-workspace"><nav class="handoff-board" aria-label="批次与附件">${attachmentIndex}${groups || '<p>没有可查的回执。</p>'}</nav>
    <section class="handoff-detail${cls('handoff-comparing', comparing)}" aria-label="${comparing ? '两次来件的交接单' : '选中的交接单'}"><header class="handoff-detail-head">${header}</header><div class="handoff-detail-scroll">${detail}</div></section></div></div>`, 'handoff-modal',
  `<footer class="modal-actions handoff-actions">${notice}${actions}</footer>`);
}

export function egg(key, caseId) {
  if (key === 'cat') return '';
  const extra = EASTER_EGGS[key];
  return dialog(extra.title, `<div class="egg-note"><p>${esc(extra.line)}</p>${caseId === extra.slots[1] ? `<p>${esc(extra.returnLine)}</p>` : ''}</div>`, 'egg-modal');
}

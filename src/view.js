import { CHARACTERS, DAYS, EASTER_EGGS, FILM_TUTORIAL, PHONE } from './content.js';
import { intakeComparison, projectComparison } from './document-comparison.js';
import { receiptDisposition, receiptFeedback } from './engine.js';
import { readFindings } from './inspection-findings.js';
import { sampleAppearance, sampleObservation } from './samples.js';

export const asset = (file) => `${import.meta.env.BASE_URL}art/${file}`;
export const labels = { pass: '通过', fail: '不通过', review: '要求审查' };
export const statuses = { shipping: '排车', shipped: '已出库', returned: '退回', held: '隔离待查', recallPending: '待召回回执', recalled: '召回确认',
  supplementHeld: '补验联待查', supplementReturned: '补验联退回' };
const types = { label: '标签', report: '检验', order: '送检', archive: '留底' };
const glyphs = { pass: '✓', fail: '×', review: '…' };
const batchPaperLabels = {
  rework: { tab: '复核联', original: '查看周一原单', open: '查看周二复核联' },
  acceptance: { tab: '验收联', original: '查看对应出货单', open: '查看到货验收联' },
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
      <nav class="utility" aria-label="游戏设置">
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
        <div class="room" data-fixture="window"><div class="canvas-room" aria-hidden="true"><img class="static-worker" alt="" decoding="async" draggable="false" hidden></div><div class="booth-cargo" aria-hidden="true" hidden><span class="booth-cargo-lane"></span><span class="booth-cargo-crate"></span></div><span class="booth-cat" aria-hidden="true"></span><div class="booth-shutter" aria-hidden="true"></div><div class="glass-stripe" aria-hidden="true"></div><div class="room-hud" id="room-hud"></div></div>
        <aside class="booth-wing booth-right" aria-label="值班告示">
          <div id="wall-shift" data-fixture="shift"></div>
          <button class="wall-notice" data-act="rules" data-fixture="rules">查验要求<span aria-hidden="true">﹣﹣﹣</span></button>
        </aside>
        <div class="console" id="desk"></div>
      </div>
      <p class="arrival-status" id="arrival-status" role="status"></p>
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
    ? button(`<b>交班记录</b><span>${endings.length}／3</span>`, 'completed-shifts', 'home-history')
    : endings.length ? `<span>交班记录 ${endings.length}／3</span>` : '<span>五个工作日</span>';
  return `<section class="home-screen"><div class="home-art" aria-hidden="true"></div><div class="home-body">
    <div class="title-paper"><div class="eyebrow">南渡防护用品厂 · 代班通知</div><h1>质检员<br><em>的一天</em></h1>
      <p class="title-description">在出货窗口替五天班。<br>看样，对单，然后签你的名字。</p>
      <div class="home-actions">${actions}</div>
    </div><div class="home-sign" aria-hidden="true"><i></i><span>发货抽检窗口</span><b>01</b></div></div>
    <footer class="home-footer"><span>出货交接室</span>${history}</footer></section>`;
}

export function completedShifts(entries) {
  return `<ul class="completed-shifts">${entries.map(({ id, title, label }) => `<li>
    <button type="button" class="completed-shift" data-act="review-shift" data-key="${esc(id)}"><span><b>${esc(title)}</b>${label ? `<small>${esc(label)}</small>` : ''}</span><span class="completed-shift-arrow" aria-hidden="true">›</span></button>
  </li>`).join('')}</ul>`;
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
  if (sameCase && layer.dataset.cargoRoute === cargo.route) return;
  layer.toggleAttribute('data-cargo-moving', Boolean(cargo.animate && sameCase && layer.dataset.cargoRoute === 'ready'));
  layer.dataset.cargoId = id;
  layer.dataset.cargoRoute = cargo.route;
  layer.hidden = false;
}

export function room(run, item, tutorial, pressure, sceneEvent, previous) {
  const day = DAYS[run.day];
  const character = CHARACTERS[sceneEvent?.npc ?? (run.phase === 'brief' || run.phase === 'handoff' ? 'zhou' : item?.npc)];
  const record = run.phase === 'receipt' ? run.records.at(-1) : null;
  const reply = run.phase === 'case' && !sceneEvent ? item?.pressureReply : null;
  const exchange = pressure && !sceneEvent && !record;
  const line = sceneEvent?.line ?? (record ? receiptFeedback(run) : null) ?? reply ?? item?.line ?? day.intro;
  const earlier = run.phase === 'case' && !sceneEvent && previous?.record ? priorReceipt(previous) : '';
  return `<div class="speech${cls('dispatch-event', sceneEvent)}${cls('pressure-exchange', exchange)}"${sceneEvent?.kind ? ` data-visit-kind="${esc(sceneEvent.kind)}"` : ''} aria-live="polite"><div class="speaker"><strong>${esc(character?.name ?? '值班室')}</strong><small>${esc(character?.role ?? '')}</small></div>
      <p${reply ? ' class="pressure-reply"' : ''}>${esc(line)}</p>${exchange && !reply ? `<p class="pressure-line">${esc(pressure)}</p>` : ''}
      ${earlier}</div>
    ${tutorial && !sceneEvent ? `<div class="training" aria-live="polite"><span class="tutorial-index">${run.tutorial + 1} / 5</span><small>老周 · ${esc(tutorial.title)}</small><p>${esc(tutorial.line)}</p></div>` : ''}`;
}

function paperCard(doc, index, target, offset, lifted, disabled = false) {
  return `<button type="button" class="paper-card paper-${doc.type}${cls('instructed', target === doc.type)}" data-act="doc" data-i="${index}" data-drag="paper" data-fixture="doc${index}"${lifted ? ' data-lifted' : ''}${offset ? ` style="--paper-x:${offset.x}px;--paper-y:${offset.y}px"` : ''} aria-label="查看${esc(doc.title)}"${disabled ? ' disabled' : ''}>
    <small>${types[doc.type] ?? '归档'}</small><h3>${esc(doc.title)}</h3><b class="paper-num">${esc(doc.fields[0]?.[1])}</b><span class="paper-rules" aria-hidden="true"></span><span class="paper-seal" aria-hidden="true">${doc.type === 'label' ? '批' : doc.type === 'report' ? '检' : '联'}</span></button>`;
}

export function visitSlip(doc) {
  const [category, label] = {
    recall: ['收货方回签', '收下回执'],
    rework: ['周二复核', '收下复核联'],
    acceptance: ['到货验收', '收下验收联'],
  }[doc.kind] ?? ['回访留底', '收下留底'];
  return `<section class="paper-work visit-work"><div class="papers"><button type="button" class="paper-card paper-archive visit-slip" data-act="event-next" data-fixture="doc0" aria-label="收下${esc(doc.title)}">
    <small>${category}</small><h3>${label}</h3><b class="paper-num">${esc(doc.title)}</b><span class="paper-rules" aria-hidden="true"></span></button></div></section>`;
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
  return `<span class="sample-object" style="--sample-ratio:${ratio}">
    <img src="${asset(`${appearance.stem}${back ? '-back' : ''}.webp`)}" alt="${esc(alt)}" draggable="false">
    ${lensFilm ? `<span class="sample-film-sheet" aria-hidden="true">${spec.kind === 'film' ? '<span class="sample-film-trace"></span>' : ''}</span>` : ''}
    ${!back && spec.kind === 'crack' ? '<span class="sample-lens-crack" aria-hidden="true"></span>' : ''}
    ${back && spec.model ? `<span class="model-mark" aria-hidden="true">${esc(spec.model)}</span>` : ''}
    ${back && appearance.clasp && inspection ? claspArt(spec, inspection) : ''}
    ${wrapped ? '<span class="sample-wrap" aria-hidden="true"><span class="sample-wrap-mouth"></span></span>' : spec.kind === 'yellow' ? '<span class="sample-wrap-folded" aria-hidden="true"></span>' : ''}
    ${control}</span>
    ${!lensFilm && spec.kind !== 'yellow' ? '<span class="sample-mark" aria-hidden="true"></span>' : ''}`;
}

function gaugeArt(reading, measured) {
  return `<span class="sample-gauge" aria-hidden="true"><span class="gauge-slot" data-gauge-target></span><span class="gauge-rail"></span><span class="gauge-jaw"></span><span class="gauge-display">${measured ? esc(reading) : '—'}</span></span>`;
}

function sampleHotspot(action, className, text, label, pressed = null, instructed = false) {
  const gesture = { tug: 'clasp', measure: 'gauge', unpack: 'wrapper' }[action];
  return `<button type="button" class="sample-hotspot ${className}${cls('instructed', instructed)}" data-act="sample-${action}"${gesture ? ` data-drag="${gesture}"` : ''} aria-label="${label}"${pressed === null ? '' : active(pressed)}>${text}</button>`;
}

export function desk(run, item, tutorial, interaction) {
  if (!item) return '';
  const { note, positions, pencil, inspection, heldDocuments = [], sampleHeld, stampBlocked, benchFindingsOpen } = interaction;
  const appearance = sampleAppearance(item.sample);
  const sampleBack = inspection.back && (item.sample.kind !== 'yellow' || inspection.unpacked);
  const issued = run.phase === 'receipt';
  const target = tutorial?.key === 'signature' && !interaction.signed ? 'report' : tutorial?.target;
  const findings = readFindings(interaction);
  const showTo = item.pressure ? CHARACTERS[item.npc]?.name : null;
  const shown = item.shownFinding;
  const benchDraft = run.phase === 'case' && !stampBlocked && findings.length ? `<aside class="bench-draft" data-fixture="findings">
    ${button(`查验依据 ${findings.length}`, 'bench-findings', 'bench-draft-toggle', `aria-expanded="${Boolean(benchFindingsOpen)}" aria-controls="bench-findings"`)}
    <div class="bench-draft-body${cls('bench-facing-visitor', showTo)}" id="bench-findings" role="region" aria-label="出票前查验依据"${benchFindingsOpen ? '' : ' hidden'}>${benchFindingsOpen ? findingLines(findings, 'remove-finding', { showTo, shown }) : ''}</div>
  </aside>` : '';
  return `<section class="paper-work"><div class="section-label"><b>收件</b><span>${item.documents.length} 份</span></div><div class="papers">${item.documents.map((doc, index) => paperCard(doc, index, target, positions[index], heldDocuments.includes(index), issued)).join('')}</div>
      ${pencil ? '<button class="desk-pencil" data-act="egg" data-key="pencil" data-fixture="pencil" aria-label="按住滚过来的铅笔" title="一支铅笔滚过来了"></button>' : ''}</section>
    <section class="sample-work"><button class="sample-preview${cls('instructed', tutorial?.target === 'sample')}" data-act="sample" data-fixture="sample"${sampleHeld ? ' data-lifted' : ''} aria-label="检查${appearance.name}"${issued ? ' disabled' : ''}><span class="sample-visual sample-preview-art${cls('turned', sampleBack)}${cls('peeled', inspection.film)}${cls('unpacked', inspection.unpacked)}" data-kind="${esc(item.sample.kind)}" data-appearance="${appearance.key}">${sampleArt(item.sample, appearance, { back: sampleBack, unpacked: inspection.unpacked })}</span><span class="sample-caption">${appearance.name}</span></button></section>
    <aside class="stamp-rail"><div class="section-label"><b>出票</b><span>${esc(item.batch)}</span></div><div class="stamp-buttons">${stampButtons(tutorial?.key === 'stamp', stampBlocked || run.phase !== 'case' || Boolean(tutorial && tutorial.key !== 'stamp'))}</div>
      ${benchDraft || issued ? '' : `<p class="stamp-tip">${note ? `备注 · ${esc(note)}` : '可在纸上记下依据'}</p>`}</aside>${benchDraft}`;
}

function endingReceipt(record, detail) {
  const day = DAYS[record.day]?.title;
  const lot = record.batch === 'G-204' ? (record.id === 4 ? '原批' : '留厂件') : '';
  const label = [day, lot].filter(Boolean).join(' · ');
  return `<button type="button" class="summary-record ending-receipt" data-act="archive-receipt" data-i="${esc(record.id)}">
    <span class="ending-receipt-batch"><b>${esc(record.batch)}</b><small>${esc(label)}</small></span><span class="ending-receipt-detail">${esc(detail)}</span><span class="ending-receipt-arrow" aria-hidden="true">›</span>
  </button>`;
}

function endingRecallGroup(records, kind, title, detail) {
  if (!records.length) return '';
  return `<section class="ending-recall ending-recall-${kind}"><h3>${title}</h3><ul class="ending-receipts">
    ${records.map((record) => `<li>${endingReceipt(record, detail)}</li>`).join('')}</ul></section>`;
}

function endingView(ending, reviewingHistory) {
  const { delayedReceipts = [], traceReceipt, traceDisposition, pendingRecalls = [], confirmedRecalls = [], acceptedReceipt } = ending;
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
      const disposition = pendingIds.has(record.id) ? pendingText : record.answer === 'review' ? '暂缓入库' : '收货方复核';
      return `<li>${endingReceipt(record, `${disposition} · ${record.reason}`)}</li>`;
    }).join('')}</ul>`;
  }
  const trace = traceReceipt ? endingReceipt(traceReceipt, traceDisposition.replace(`${traceReceipt.batch} `, '')) : esc(traceDisposition);
  if (ending.id === 'trace' && trace) note = trace;
  return `<div class="stage-overlay ending-overlay"><section class="brief-card ending-card ending-${ending.id}${cls('ending-history', reviewingHistory)}">
    <header class="ending-head"><div class="eyebrow">南渡防护用品厂 · ${reviewingHistory ? '历史交班存根 <span class="ending-history-label">只读</span>' : '交班存根'}</div><h2>${esc(ending.title)}</h2></header>
    <div class="ending-body"><p>${esc(ending.line)}</p><div class="ending-note">${note}</div>
      ${ending.id === 'issue' && trace ? `<div class="ending-note">${trace}</div>` : ''}
      ${acceptedReceipt ? `<section class="ending-recall ending-acceptance"><h3>到货验收</h3>${endingReceipt(acceptedReceipt, '已签收，验收联已归档')}</section>` : ''}
      ${endingRecallGroup(pending, 'pending', '待召回回执', pendingText)}
      ${endingRecallGroup(confirmed, 'confirmed', '召回确认', '已收下收货方回执')}
      ${delayed.length ? `<details class="ending-delay"><summary><b>仍未放行</b> ${delayed.length} 批来件已符合放行要求</summary>
        <ul class="ending-receipts">${delayed.map((record) => `<li>${endingReceipt(record, dispositionLabel(record))}</li>`).join('')}</ul></details>` : ''}
      <div class="ending-counts">${Object.entries(ending.counts).map(([key, count]) => `<span><b>${count}</b>${labels[key]}</span>`).join('')}</div><div class="ending-stamp">${esc(ending.stamp ?? '交班已存档')}</div>
    </div>
    <footer class="brief-actions ending-footer">${button('翻交接簿', 'archive')}${button(reviewingHistory ? '返回首页' : '返回窗口', 'home')}${reviewingHistory ? '' : button('再接一周', 'new', 'primary')}</footer>
  </section></div>`;
}

export function overlay(run, ending, reviewingHistory = false, incomingCall = null) {
  const day = DAYS[run.day];
  if (run.phase === 'brief') return `<div class="stage-overlay"><section class="brief-card"><div class="eyebrow">代班记录 · 第 ${run.day + 1} 天</div><h2>${day.title}</h2><h3>${esc(day.subtitle)}</h3><p>${esc(day.intro)}</p>${button('拉起卷帘', 'start-day', 'primary')}</section></div>`;
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
  if (run.phase === 'handoff') return `<div class="stage-overlay"><section class="brief-card handoff-card"><div class="eyebrow">周五 · 交接板</div><h2>最后一张单</h2><p>老周「最后一趟车先等你。核对完这些单，再把板给我。」</p><div class="brief-actions">${button('核对与更正', 'archive')}${button(incomingCall ? '接电话' : '打电话', 'phone')}${button('打开交接板', 'handoff', 'primary')}</div></section></div>`;
  if (run.phase === 'ending') return endingView(ending, reviewingHistory);
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
    <p>有换签时对照登记上的旧号和新号。样品上的保护膜可以揭角。核对过的旧单会留在交接簿。</p>
    ${how ? '<p>点纸张可打开，拖动可移动，两指可在系统支持时缩放视图。可以先记下查验依据。回到桌面点印章开单，电脑也可用 1、2、3。Esc 合上面板。</p>' : ''}</div>`, 'rules-modal');
}

function sheet(doc, index, inspection, { clipboardFront = false, reportLookup = false, fieldActions } = {}) {
  const action = inspection?.action ?? 'basis';
  const rows = doc.fields.map(([key, value], field) => {
    const text = esc(value);
    const signatureTarget = doc.type === 'report' && inspection?.signature && key === '签发';
    const highlight = signatureTarget ||
      (inspection?.projects && ((doc.type === 'report' && ['外观', '扣合'].includes(key)) || (doc.type === 'order' && key === '检验项目')));
    const chosen = inspection?.selected.has(`doc:${index}:${field}`);
    const fieldValue = inspection ? `<button class="field-value${cls('instructed', highlight)}" data-act="${action}" data-i="${index}" data-field="${field}"${signatureTarget ? ' data-tutorial-signature' : ''}${active(chosen)}>${text}</button>` : text;
    const lookup = reportLookup && (key === '报告编号' || key === '原报告编号') && value;
    const extraAction = fieldActions?.get(key);
    const layout = lookup ? 'report-number-value' : extraAction ? 'document-action-value' : '';
    return `<div><dt>${esc(key)}</dt><dd${layout ? ` class="${layout}"` : ''}>${fieldValue}${lookup ? button('查号', 'report-search', 'secondary report-lookup', `data-key="${text}" aria-label="查报告号 ${text}"`) : ''}${extraAction ?? ''}</dd></div>`;
  }).join('');
  return `<article class="sheet sheet-${doc.type}${cls('sheet-clipboard', clipboardFront)}"><small>${types[doc.type] ?? '留底'} · 南渡防护用品厂</small><h3>${esc(doc.title)}</h3>${clipboardFront ? clipboardFlip(false) : ''}<dl class="fields">
    ${rows}</dl>${doc.note ? `<p class="sheet-note">${esc(doc.note)}</p>` : ''}</article>`;
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

function intakeSlip(comparison, orderIndex, selected) {
  const checked = selected.has(comparison.finding.key);
  return `<article class="sheet intake-slip"><small>质检窗口 · 本批收件</small><h3>实收点数条</h3>
    <ul class="intake-received" aria-label="实际收到的单据">${comparison.received.map((title) => `<li>${esc(title)}</li>`).join('')}</ul>
    <div class="modal-actions intake-actions">${button(checked ? '取回依据' : '记下点收', 'delivery-evidence', 'secondary intake-evidence', `data-i="${orderIndex}"${active(checked)}`)}</div></article>`;
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

function findingLines(findings, removeAction = '', { showTo, shown } = {}) {
  return `<ul class="finding-lines">${findings.map((finding) => {
    const { key, source, text } = finding;
    const wasShown = sameFinding(finding, shown);
    const marker = !showTo && wasShown ? '<small class="finding-shown">开单前已出示</small>' : '';
    const remove = removeAction ? button('取回', removeAction, 'finding-remove', `data-key="${esc(key)}" aria-label="取回依据 ${esc(text)}"`) : '';
    const show = showTo ? button(wasShown ? '已出示' : '递给他看', 'show-finding', 'finding-show',
      `data-key="${esc(key)}"${active(wasShown)} aria-label="${wasShown ? '已递给' : '递给'}${esc(showTo)}看 ${esc(source || text)}"`) : '';
    return `<li><div class="finding-description">${source ? `<small class="finding-source">${esc(source)}</small>` : ''}<span>${esc(text)}</span>${marker}</div>
      ${show ? `<div class="finding-actions">${show}${remove}</div>` : remove}</li>`;
  }).join('')}</ul>`;
}

function findingsDraft(findings, showFindings) {
  if (!findings.length) return { header: '', list: '' };
  return {
    header: button(`查验依据 ${findings.length}`, 'toggle-findings', 'findings-toggle', `aria-expanded="${Boolean(showFindings)}" aria-controls="working-findings"`),
    list: `<div class="working-findings" id="working-findings" role="region" aria-label="已经记录的查验依据"${showFindings ? '' : ' hidden'}>${showFindings ? findingLines(findings, 'remove-finding') : ''}</div>`,
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
      ${returnTabs(documents, 'previous-doc', previousIndex, '切换留底单据')}${sheet(documents[previousIndex], previousIndex, null, { reportLookup: true })}</section>
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
  const signature = tutorial?.key === 'signature';
  const sampleReady = tutorial?.key === 'sample';
  const visibleTypes = [doc.type, other?.type];
  const reportVisible = visibleTypes.includes('report');
  const target = signature && !progress.signed ? 'report' : tutorial?.target;
  const findings = readFindings(progress);
  const inspection = {
    signature: signature && !progress.signed,
    projects: sampleReady && reportVisible && visibleTypes.includes('order'),
    selected: new Set(findings.map(({ key }) => key)),
  };
  const draft = findingsDraft(findings, progress.showFindings);
  let guide = tutorial?.line;
  if (signature && progress.signed) guide = tutorial.orderLine;
  else if (signature && !reportVisible) guide = tutorial.reportLine;
  let guidedCompare = '';
  if (tutorial?.key === 'report' && doc.type === 'label' && !other) {
    guidedCompare = button('并排报告', 'compare', 'primary tutorial-next');
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
  const orderAtHand = (progress.deliveryCheck == null ? visible : [progress.deliveryCheck])
    .some((position) => item.documents[position]?.type === 'order');
  const bringOrder = !comparing && !progress.incomingCall && PHONE['204'].requests[item.id] && orderAtHand;
  const phoneLabel = progress.incomingCall ? '接电话' : bringOrder ? '带送检联问' : '拿电话';
  const phoneAction = tutorial ? '' : button(phoneLabel, 'phone', `reference-control phone-work-tool${cls('phone-bring-order', bringOrder)}`, bringOrder ? 'data-key="bring-order"' : '');
  const headerActions = guidedCompare + previousAction + spreadAction + sampleAction + phoneAction + draft.header;
  const activeSheet = (page, position) => sheet(page, position, inspection, {
    clipboardFront: position === clipboardIndex,
    reportLookup: !tutorial,
    fieldActions: !tutorial && !comparing && page.type === 'order' ? orderFieldActions(item, position, visible, inspection.selected) : undefined,
  });
  const intakeIndex = progress.deliveryCheck;
  const intake = !tutorial && intakeComparison(item, intakeIndex);
  if (intake) {
    const closeIntake = button('收起点收条', 'delivery-check', 'secondary intake-close', `data-i="${intakeIndex}"${active(true)}`);
    return deskSurface('桌面单据', `${draft.list}<div class="doc-grid pair intake-comparison">${sheet(item.documents[intakeIndex], intakeIndex, inspection)}
      ${intakeSlip(intake, intakeIndex, inspection.selected)}</div>`, 'documents-surface', '放回台面', `intake:${intakeIndex}`,
    { headerActions: closeIntake + phoneAction + draft.header });
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

export function sample(item, inspection, tutorial, progress) {
  const { film, clasp, tug, measured, unpacked } = inspection;
  const spec = item.sample;
  const kind = spec.kind;
  const appearance = sampleAppearance(spec);
  const packaged = kind === 'yellow' && !unpacked;
  const back = !packaged && inspection.back;
  const inGauge = measured && Boolean(spec.reading);
  const practicing = tutorial?.key === 'sample';
  const stampReady = tutorial?.key === 'stamp';
  const filmHint = item.id === 2 && !back && !film && !progress?.filmChecked;
  const guidedFlip = practicing && !back;
  let guide = '';
  if (stampReady) guide = tutorial.sampleLine;
  else if (practicing) guide = back ? (clasp ? tutorial.tugLine : tutorial.claspLine) : tutorial.frontLine;
  else if (tutorial) guide = '先放下检样，接着核对单据。';
  else if (filmHint) guide = FILM_TUTORIAL;
  const visual = inGauge ? '量爪贴住了插片的平面。' : sampleObservation(spec, { ...inspection, back });
  const findings = readFindings(progress);
  const draft = findingsDraft(findings, progress?.showFindings);
  const referenceIndex = progress?.referenceDoc;
  const reference = !tutorial && Number.isInteger(referenceIndex) ? item.documents[referenceIndex] : null;
  const referencePicker = reference ? `<aside class="sample-reference" data-reference-doc="${referenceIndex}"><nav class="doc-tabs reference-tabs" aria-label="对照单据">
    ${item.documents.map(({ title }, index) => button(esc(title), 'reference-doc', 'tab', `data-i="${index}"${active(index === referenceIndex)}`)).join('')}
    </nav>${sheet(reference, referenceIndex, { selected: new Set(findings.map(({ key }) => key)) }, { reportLookup: true })}</aside>` : '';
  const canCompare = !tutorial && item.documents.length > 0;
  const referenceActions = canCompare
    ? `${progress?.returnToDocs ? button('回到单据', 'reference-back', 'reference-control') : ''}${button(reference ? '收起单据' : '对照单据', 'reference', 'reference-control', active(Boolean(reference)))}`
    : '';
  const phoneAction = tutorial ? '' : button(progress?.incomingCall ? '接电话' : '拿电话', 'phone', 'reference-control phone-work-tool');
  let control = '';
  if (packaged) control = sampleHotspot('unpack', 'pack-handle', '拆袋', '拆开包装');
  if (!back && (kind === 'film' || kind === 'crack')) control = sampleHotspot('film', 'film-handle', film ? '放回' : '揭膜', film ? '放回保护膜' : '揭开膜角', film, filmHint);
  if (appearance.clasp && back && !tug) control = clasp
    ? sampleHotspot('tug', 'clasp-handle', '轻拉', '轻拉检查', null, practicing)
    : sampleHotspot('clasp', 'clasp-handle', '按合', '按合扣件', null, practicing);
  if (spec.reading) control = sampleHotspot('measure', 'gauge-handle', measured ? '取出' : '放入', measured ? '取出量规' : '放进量规', measured);
  const basis = packaged ? button('记下包装', 'sample-basis') : !tutorial || tug || film || measured || back || unpacked ? button('记为查验依据', 'sample-basis') : '';
  const flipAction = packaged || inGauge ? '' : button(back ? `看${appearance.front ?? '正面'}` : '翻到背面', 'sample-flip', guidedFlip ? 'primary tutorial-next sample-flip-control instructed' : 'secondary sample-flip-control');
  return deskSurface(`${item.batch} · ${appearance.name}`, `${guide ? tutorialGuide(guide, filmHint ? 'film-tutorial' : '') : ''}${draft.list}<div class="sample-workbench${cls('with-reference', reference)}"><div class="sample-work-main"><div class="sample-inspector"><div class="sample-visual sample-stage${cls('gauge-stage', spec.reading)}${cls('turned', back)}${cls('peeled', film)}${cls('pulled', tug)}${cls('unpacked', unpacked)}${cls('measured', measured)}" data-kind="${esc(kind)}" data-appearance="${appearance.key}">
    ${sampleArt(spec, appearance, { back, unpacked, control, inspection })}${spec.reading ? gaugeArt(spec.reading, measured) : ''}</div><div class="sample-findings"><b>${inGauge ? '已放入量规' : packaged ? '包装' : back ? '背面' : appearance.front ?? '正面'}</b><p>${esc(visual)}</p>
    ${back && appearance.clasp && clasp && !tug && !practicing ? '<p class="sample-clasp-feedback">已按下扣件，可以轻拉。</p>' : ''}
    ${inGauge ? `<p class="reading">量规读数 <strong>${esc(spec.reading)}</strong></p>` : ''}</div></div>
    <div class="modal-actions">${guidedFlip ? '' : flipAction}${basis}</div></div>${referencePicker}</div>`, 'sample-surface', stampReady ? '回台面开单' : '放下检样', undefined, {
    headerActions: (guidedFlip ? flipAction : '') + referenceActions + phoneAction + draft.header,
    closeLabel: stampReady ? '回台面开单' : '关闭面板', closeClass: stampReady ? 'tutorial-next tutorial-stamp-return' : '',
  });
}

function receiptFacts(record, destinationLabel = '去向', showEmptyNote = false, basisLabel = '开单依据') {
  const findings = readFindings(record);
  const shown = record.shownFinding;
  const separate = shown && !findings.some((finding) => sameFinding(finding, shown));
  return `<dl class="receipt-facts"><div><dt>${destinationLabel}</dt><dd>${esc(dispositionLabel(record))}</dd></div>
    ${findings.length || showEmptyNote ? `<div class="receipt-findings"><dt>${basisLabel}</dt><dd>${findings.length ? findingLines(findings, '', { shown }) : '未另记'}</dd></div>` : ''}
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

function archivedReceipt(record, latestReceipt, previousReceipt) {
  if (!record) return '';
  const changed = record.amendments?.length > 0;
  const latestAmendment = latestReceipt?.amendments?.at(-1);
  return `<article class="archive-receipt receipt-${record.decision}" aria-label="出票留底">
    <div class="archive-receipt-head"><div><strong>出票留底</strong><small>${esc(DAYS[record.day]?.title ?? '')}开单${changed ? ` · ${esc(labels[record.original])}` : ''}</small></div>
      <span class="receipt-result">${esc(labels[record.decision])}</span></div>
    ${receiptFacts(record, latestReceipt ? '前次去向' : '现去向', true, changed ? '原开单依据' : '开单依据')}
    ${latestReceipt ? `<p class="archive-current-disposition">${esc(DAYS[latestAmendment?.day ?? latestReceipt.day]?.title)}${latestAmendment ? '更正' : '复核'}后，现去向为<strong>${esc(dispositionLabel(latestReceipt))}</strong>。</p>` : ''}
    ${previousReceipt && previousReceipt.record.id === record.priorShipmentId ? `<p class="archive-current-disposition">补验时原批已出库，原出货单开于<strong>${esc(DAYS[previousReceipt.record.day]?.title)}</strong>。</p>` : ''}
    ${changed ? `<ol class="receipt-amendments" aria-label="更正记录">${record.amendments.map((entry, index) => `<li><b>${esc(DAYS[entry.day]?.title ?? '')}更正</b>
      <span>${esc(labels[entry.from])} → ${esc(labels[entry.to])}</span><small>${esc(amendmentDisposition(record, index, entry.from, entry.previousStatus))} → ${esc(amendmentDisposition(record, index + 1, entry.to, entry.status))}</small>${amendmentFindings(entry)}${recallConfirmation(record.recallReceipt, index)}</li>`).join('')}</ol>` : ''}</article>`;
}

export function receipt(record, previous) {
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
    ? button(`查看原出货回执 · ${esc(DAYS[previous.day]?.title)}`, 'archive-receipt', 'receipt-origin', `data-i="${esc(previous.id)}"`)
    : '';
  const body = `<div class="receipt-slip receipt-${record.decision}"><div class="eyebrow">成品抽检窗口 · 出票留底</div><b>${esc(record.batch)}</b><span class="receipt-result">${labels[record.decision]}</span>${disposition ? `<p class="receipt-disposition">${disposition}</p>` : ''}${receiptFacts(record)}</div>`;
  return deskSurface('出货回执', body, 'receipt-surface', undefined, undefined, { footer: original + button('接着值班', 'next', 'primary') });
}

function correctionPanel(record, findings, selected, reworkBasis) {
  const originals = readFindings(record).filter(({ key }) => key.startsWith('sample:') || key.startsWith('compare:'));
  const option = ({ key, source, text }) =>
    button(`<small>${esc(source)}</small><span>${esc(text)}</span>`, 'correction-original', 'secondary correction-original', `data-key="${esc(key)}"${active(selected.has(key))}`);
  return `<section class="correction-panel" aria-label="本次更正依据">
    ${findings.length ? `<div class="correction-draft"><b>更正依据 ${findings.length}</b>${findingLines(findings, 'correction-remove')}</div>`
      : reworkBasis ? '' : '<p class="correction-help">可点单据字段，留下本次更正依据。</p>'}
    ${reworkBasis ? `<div class="correction-originals"><b>引用复核联</b><div class="correction-original-options">${option(reworkBasis)}</div></div>` : ''}
    ${originals.length ? `<div class="correction-originals"><b>沿用原查验记录</b><div class="correction-original-options">${originals.map(option).join('')}</div></div>` : ''}
  </section>`;
}

export function archivePanel(rows, visits, focus, selected, query, editing, handoff, finished = false, { returnTo, canComparePrevious, correctionFindings = [], batchPapers = [], reworkBasis, reportSuggestion } = {}) {
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
    const original = attached ? button(batchPaperLabels[visit.kind].original, 'archive-followup', 'secondary', `data-i="${esc(attached.caseId)}"`)
      : visit.kind === 'lab-request' ? button('查看当时的单据', 'archive-followup', 'secondary registration-source', `data-i="${esc(visit.caseId)}"`) : '';
    details = (original ? `<div class="modal-actions archive-actions">${original}</div>` : '') + sheet(visit);
  }
  if (row) {
    const { latestReceipt, previousReceipt } = row;
    const canAmend = !finished && handoff && row.record && !latestReceipt;
    const correcting = Boolean(editing && canAmend);
    const findings = correcting ? readFindings({ findings: correctionFindings }) : [];
    const correction = correcting ? { action: 'correction-basis', selected: new Set(findings.map(({ key }) => key)) } : null;
    if (correcting) footer = `<div class="stamp-buttons archive-correction" aria-label="更正开单">${stampButtons(false, false, 'recheck', row.record.decision)}</div>`;
    const actions = [
      !finished && button(selected.includes(row.id) ? '已放到电话旁 · 取回' : '带到电话旁', 'archive-pin', 'secondary', `data-i="${row.id}"`),
      canComparePrevious && button('放到桌上对照', 'previous-compare', 'secondary', `data-i="${row.id}"`),
      previousReceipt && button(previousReceipt.sameLot ? '查看前次回执' : '查看前次同号回执', 'archive-followup', 'secondary', `data-i="${esc(previousReceipt.record.id)}"`),
      latestReceipt && button('查看后续回执', 'archive-followup', 'secondary', `data-i="${latestReceipt.id}"`),
      ...batchPapers.filter(({ caseId }) => caseId === row.id).map(({ key, document }) =>
        button(batchPaperLabels[document.kind].open, 'archive-evidence', 'secondary', `data-key="${esc(key)}"`)),
      canAmend && row.record.status === 'recallPending' && receiveRecallAction(row.record, 'archive-recall-action'),
      canAmend && button(editing ? '取消更正' : '更正开单', 'edit-record'),
    ].filter(Boolean).join('');
    details = `${actions ? `<div class="modal-actions archive-actions">${actions}</div>` : ''}
      ${correction ? correctionPanel(row.record, findings, correction.selected, reworkBasis) : ''}
      ${archivedReceipt(row.record, latestReceipt, previousReceipt)}<div class="doc-grid">${row.documents.map((doc, index) => sheet(doc, index, correction, { reportLookup: !editing })).join('')}</div>`;
  }
  const navigation = { phone: '回到电话', handoff: '回到交接板' }[returnTo];
  const suggestion = reportSuggestion && !editing ? button(`并排核对 ${esc(reportSuggestion)}`, 'report-search', 'secondary report-index-suggestion', `data-key="${esc(reportSuggestion)}"`) : '';
  return deskSurface('交接簿', `<div class="archive-layout"><div><form class="archive-search" data-form="archive"><label for="archive-query">查找批号或报告号</label><div><input id="archive-query" name="query" value="${esc(query)}" placeholder="输入编号"><button class="button secondary">查找</button></div></form>
    ${suggestion}<div class="drawer-list" aria-label="留档单据">${index || '<p>没有找到匹配的单据。</p>'}</div></div>
    <div class="archive-detail">${details}</div></div>`, 'archive-surface', navigation || '合上簿子', query,
    { footer, closeLabel: navigation || '关闭面板' });
}

export function archiveReportPanel(number, sources, pinned, { returnTo, finished } = {}) {
  const closeText = { phone: '回到电话', docs: '回到单据', sample: '回到检样' }[returnTo] ?? '合上簿子';
  const back = button('返回交接簿', 'report-index-back', 'secondary report-index-back');
  const phoneAction = !finished && returnTo !== 'phone' ? button('拿电话', 'phone', 'secondary report-index-phone') : '';
  const papers = sources.map(({ id, batch, day, document, index }) => {
    const selected = pinned.includes(id);
    const pinText = selected ? '取回单据' : '带到电话旁';
    const pin = finished ? '' : button(pinText, 'archive-pin', 'secondary report-index-pin', `data-i="${esc(id)}"${active(selected)} aria-label="${pinText} · ${esc(batch)}"`);
    const original = button('查看原单', 'archive-followup', 'secondary', `data-i="${esc(id)}" aria-label="查看 ${esc(batch)} 原单"`);
    return `<section class="report-index-paper" aria-label="${esc(batch)} ${esc(document.title)}"><div class="report-index-source"><b>${esc(batch)}</b><small>${esc(DAYS[day]?.title)}</small></div>
      <div class="modal-actions report-index-actions">${pin}${original}</div>${sheet(document, index)}</section>`;
  }).join('');
  return deskSurface(`报告号 ${number}`, papers ? `<div class="report-index-papers">${papers}</div>` : '<p class="archive-empty">交接簿里还没有这个报告号的留底。</p>',
    'archive-surface report-index-surface', closeText, number, { headerActions: back + phoneAction, closeLabel: closeText });
}

export function phone(number, call, pinned, numberGuide, phoneBack, current, { returnTo, incomingCall } = {}) {
  const canBring = current && !pinned.some(({ id }) => id === current.id);
  const bringLabel = canBring && PHONE['204'].requests[current.id] ? '带本批送检联' : '带本批单据';
  const papers = pinned.length ? `<div class="phone-pinned phone-papers" aria-label="电话旁的单据"><b>电话旁</b><ul>
    ${pinned.map(({ id, batch, title }) => {
    const paper = PHONE['204'].requests[id] ? '送检联' : title;
    return `<li><button type="button" class="phone-paper" data-act="archive-receipt" data-i="${esc(id)}" aria-label="查看 ${esc(batch)} ${esc(paper)}"><b>${esc(batch)}</b><span>${esc(paper)}</span></button></li>`;
  }).join('')}
  </ul></div>` : '';
  const actions = `<footer class="modal-actions phone-actions">${incomingCall ? button('接电话', 'phone-answer', 'secondary phone-answer') : ''}${canBring ? button(bringLabel, 'archive-pin', 'secondary', `data-i="${esc(current.id)}"`) : ''}${button('交接簿', 'archive')}${button(phoneBack ? '机底贴纸 · 880' : '翻看机底', 'phone-back')}</footer>`;
  const returnLabel = { docs: '回到单据', sample: '回到检样', archive: '回到编号索引' }[returnTo];
  const closeText = returnLabel || '放下听筒';
  const closeLabel = returnLabel ? `放下听筒，${returnLabel}` : closeText;
  const caller = call ? [call.kind === 'incoming' ? '来电' : '', CHARACTERS[call.npc]?.name ?? '内线', call.number].filter(Boolean).map(esc).join(' · ') : '';
  const registration = PHONE['204'].requests[call?.caseId] ? button('查看登记留底', 'archive-call', 'secondary phone-registration', `data-i="${esc(call.caseId)}"`) : '';
  return dialog('窗口电话', `<div class="phone-layout"><div class="phone-machine"><div class="phone-screen" aria-live="polite">${esc(number || '— — —')}</div><div class="phone-pad">${'1234567890'.split('').map((n) => `<button data-act="phone-digit" data-key="${n}">${n}</button>`).join('')}<button data-act="phone-clear" aria-label="删除一位">⌫</button><button class="phone-call" data-act="dial" aria-label="拨出">拨出</button></div></div>
    <div class="phone-side">${numberGuide ? '<div class="phone-directory"><button class="button secondary" data-act="phone-select" data-key="204">实验室 204</button></div>' : ''}
    ${papers}
    <div class="phone-log" aria-live="polite">${call ? `<b>${caller}</b>${call.lines.map((line) => `<p>${esc(line)}</p>`).join('')}` : '<p>拨出内线，或从交接簿拿一张单来问。</p>'}${registration}</div>
    </div></div>`, 'phone-modal', actions, { closeText, closeLabel, closeClass: 'phone-hangup' });
}

export function handoffPanel(run, evidence, rows, { focus, documentIndex, correctionFindings = null, batchPapers = [], reworkBasis } = {}) {
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
  let header = '<h3>出货回执</h3>';
  let detail = '<p class="handoff-empty">从板上选一张回执核对。</p>';
  let actions = `${button('回看全周出货', 'archive')}${button('拉铃交班', 'finish', 'primary')}`;

  if (focus === 'attachments' && attachmentKeys.length) {
    header = '<h3>交接附件</h3>';
    detail = `<div class="handoff-attachments">${attachmentKeys.map((key) => {
      const attached = run.flags[`${key}Attached`];
      return `<div class="handoff-evidence">${sheet(evidence[key])}${button(attached ? '已夹入 · 取回' : '夹入交接板', 'attach', attached ? 'primary' : 'secondary', `data-key="${key}" aria-label="${attached ? '取回' : '夹入'}${esc(evidence[key].title)}"`)}</div>`;
    }).join('')}</div>`;
  } else if (row) {
    const { record, latestReceipt, previousReceipt, documents } = row;
    const next = following.get(row.id);
    const editing = !latestReceipt && correctionFindings !== null;
    const findings = editing ? readFindings({ findings: correctionFindings }) : [];
    const correction = editing ? { action: 'correction-basis', selected: new Set(findings.map(({ key }) => key)) } : null;
    const attachedPapers = batchPapers.filter(({ caseId }) => caseId === row.id);
    const attached = attachedPapers.find(({ document }) => document.kind === documentIndex);
    const doc = attached?.document ?? documents[documentIndex];
    const tabs = `<nav class="doc-tabs handoff-detail-tabs" aria-label="本批归档单据">
      ${button('回执', 'handoff-doc', 'tab', `data-key="receipt"${active(!doc)}`)}${documents.map(({ title, type }, index) =>
        button(types[type] ?? '归档', 'handoff-doc', 'tab', `data-i="${index}"${active(index === documentIndex)} aria-label="${esc(title)}" title="${esc(title)}"`)).join('')}
      ${attachedPapers.map(({ document }) => button(batchPaperLabels[document.kind].tab, 'handoff-doc', 'tab',
        `data-key="${esc(document.kind)}"${active(document === doc)} aria-label="${esc(document.title)}"`)).join('')}</nav>`;
    header = `<div class="handoff-detail-heading"><div class="handoff-detail-name"><h3>${esc(row.batch)}</h3><small>${esc(provenance(row))}</small></div><span class="handoff-detail-status">${esc(dispositionLabel(latestReceipt ?? record))}</span>
      ${!latestReceipt && !editing ? button('更正开单', 'edit-record', 'secondary handoff-detail-edit', `data-i="${esc(row.id)}"`) : ''}</div>${tabs}`;
    const related = [
      previousReceipt && button(previousReceipt.sameLot ? '前次回执' : '原批回执', 'handoff-focus', 'secondary', `data-i="${esc(previousReceipt.record.id)}"`),
      (latestReceipt || next) && button(next?.previousReceipt.sameLot === false ? '留厂件回执' : '后续回执', 'handoff-focus', 'secondary', `data-i="${esc(latestReceipt?.id ?? next.id)}"`),
    ].filter(Boolean).join('');
    const draft = correction ? correctionPanel(record, findings, correction.selected, reworkBasis) : '';
    const paper = doc ? sheet(doc, documentIndex, attached ? null : correction) : archivedReceipt(record, latestReceipt, previousReceipt);
    detail = `${attached?.document.kind === 'rework' ? draft + paper : paper + draft}
      ${related && !editing ? `<div class="modal-actions handoff-related">${related}</div>` : ''}`;
    if (editing) actions = `<div class="stamp-buttons archive-correction" aria-label="更正开单">${stampButtons(false, false, 'recheck', record.decision)}</div>${button('取消更正', 'edit-record', 'secondary handoff-cancel', `data-i="${esc(row.id)}"`)}`;
  }

  return dialog('周五交接', `<div class="handoff-paper handoff-sheet"><p class="handoff-instruction">点批号核对原单，改章另开更正联。</p>
    <div class="handoff-workspace"><nav class="handoff-board" aria-label="批次与附件">${attachmentIndex}${groups || '<p>没有可查的回执。</p>'}</nav>
    <section class="handoff-detail" aria-label="选中的交接单"><header class="handoff-detail-head">${header}</header><div class="handoff-detail-scroll">${detail}</div></section></div></div>`, 'handoff-modal',
  `<footer class="modal-actions handoff-actions">${actions}</footer>`);
}

export function egg(key, caseId) {
  if (key === 'cat') return '';
  const extra = EASTER_EGGS[key];
  return dialog(extra.title, `<div class="egg-note"><p>${esc(extra.line)}</p>${caseId === extra.slots[1] ? `<p>${esc(extra.returnLine)}</p>` : ''}</div>`, 'egg-modal');
}

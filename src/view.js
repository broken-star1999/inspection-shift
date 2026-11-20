import { CHARACTERS, DAYS, EASTER_EGGS } from './content.js';
import { sampleAppearance, sampleObservation } from './samples.js';

export const asset = (file) => `${import.meta.env.BASE_URL}art/${file}`;
export const labels = { pass: '通过', fail: '不通过', review: '要求审查' };
export const statuses = { shipping: '排车', shipped: '已出库', returned: '退回', held: '隔离待查', recalled: '召回确认' };
const types = { label: '标签', report: '检验', order: '送检', archive: '留底' };
const glyphs = { pass: '✓', fail: '×', review: '…' };

export const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const cls = (name, enabled) => enabled ? ` ${name}` : '';
const active = (selected) => selected ? ' aria-pressed="true"' : ' aria-pressed="false"';

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
          <button class="wall-tool wall-phone" data-act="phone" data-fixture="phone"><img src="${asset('tool-phone.webp')}" alt="" draggable="false"><b>内线电话</b></button>
          <button class="wall-tool wall-archive" data-act="archive" data-fixture="archive"><img src="${asset('tool-archive.webp')}" alt="" draggable="false"><b>交接簿</b></button>
        </aside>
        <div class="room" data-fixture="window"><div class="canvas-room" aria-hidden="true"></div><div class="glass-stripe" aria-hidden="true"></div><div class="room-hud" id="room-hud"></div></div>
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

export function home(save, endings) {
  return `<section class="home-screen"><div class="home-art" aria-hidden="true"></div><div class="home-body">
    <div class="title-paper"><div class="eyebrow">南渡防护用品厂 · 代班通知</div><h1>质检员<br><em>的一天</em></h1>
      <p class="title-description">在出货窗口替五天班。<br>看样，对单，然后签你的名字。</p>
      <div class="home-actions">${save ? button(`继续值班 <small>${DAYS[save.day].title}</small>`, 'resume', 'primary') + button('重新接班', 'new') : button('接班', 'start', 'primary')}</div>
    </div><div class="home-sign" aria-hidden="true"><i></i><span>发货抽检窗口</span><b>01</b></div></div>
    <footer class="home-footer"><span>出货交接室</span>${endings.length ? `<span>交班记录 ${endings.length}／3</span>` : '<span>五个工作日</span>'}</footer></section>`;
}

export function wallShift(run) {
  const day = DAYS[run.day];
  return `<div class="room-status"><span class="room-tag"><i></i> ${run.phase === 'receipt' ? '出单中' : '窗口值班'}</span><strong>${day.title}</strong>
    <div class="batch-progress" aria-label="当班来件 ${run.index + 1} / 4">${day.cases.map((_, index) => `<span class="${index <= run.index ? 'done' : ''}"></span>`).join('')}</div></div>`;
}

export function room(run, item, tutorial, firstIssue, pressure, sceneEvent) {
  const day = DAYS[run.day];
  const character = CHARACTERS[sceneEvent?.npc ?? (run.phase === 'brief' || run.phase === 'handoff' ? 'zhou' : item?.npc)];
  const record = run.phase === 'receipt' ? run.records.at(-1) : null;
  const line = sceneEvent?.line ?? record?.response ?? item?.line ?? day.intro;
  return `<div class="speech${cls('dispatch-event', sceneEvent)}" aria-live="polite"><div class="speaker"><strong>${esc(character?.name ?? '值班室')}</strong><small>${esc(character?.role ?? '')}</small></div>
      <p>${esc(line)}</p>${pressure && !sceneEvent && !record ? `<p class="pressure-line">${esc(pressure)}</p>` : ''}
      ${sceneEvent ? button('收下留底', 'event-next', 'primary') : ''}</div>
    ${tutorial && !sceneEvent ? `<div class="training" aria-live="polite"><span class="tutorial-index">${run.tutorial + 1} / 5</span><small>老周 · ${esc(tutorial.title)}</small><p>${esc(tutorial.line)}</p></div>` : firstIssue ? `<div class="training"><span class="tutorial-index">查验卡</span><small>老周</small><p>${esc(firstIssue)}</p></div>` : ''}`;
}

function paperCard(doc, index, tutorial, offset, lifted) {
  return `<button type="button" class="paper-card paper-${doc.type}${cls('instructed', tutorial?.target === doc.type)}" data-act="doc" data-i="${index}" data-drag="paper" data-fixture="doc${index}"${lifted ? ' data-lifted' : ''}${offset ? ` style="--paper-x:${offset.x}px;--paper-y:${offset.y}px"` : ''} aria-label="查看${esc(doc.title)}">
    <small>${types[doc.type] ?? '归档'}</small><h3>${esc(doc.title)}</h3><b class="paper-num">${esc(doc.fields[0]?.[1])}</b><span class="paper-rules" aria-hidden="true"></span><span class="paper-seal" aria-hidden="true">${doc.type === 'label' ? '批' : doc.type === 'report' ? '检' : '联'}</span></button>`;
}

function stampButtons(instructed, disabled = false, action = 'stamp') {
  return Object.entries(labels).map(([key, value]) => `<button class="stamp ${key}${cls('instructed', instructed && key === 'pass')}" data-act="${action}" data-key="${key}"${action === 'stamp' ? ` data-fixture="${key}"` : ''} ${disabled ? 'disabled' : ''}><span class="stamp-glyph" aria-hidden="true">${glyphs[key]}</span><b>${value}</b></button>`).join('');
}

function sampleArt(spec, appearance, back, measurement) {
  return `<img src="${asset(`${appearance.stem}${back ? '-back' : ''}.webp`)}" alt="${appearance.name}${back ? '背面' : appearance.front ?? '正面'}" draggable="false">
    <span class="sample-mark" aria-hidden="true"></span>
    ${back && spec.model ? `<span class="model-mark">${esc(spec.model)}</span>` : ''}
    ${measurement ? `<span class="sample-gauge" aria-hidden="true"><span class="gauge-rail"></span><span class="gauge-jaw"></span><span class="gauge-display">${esc(spec.reading)}</span></span>` : ''}`;
}

export function desk(run, item, tutorial, interaction) {
  if (!item) return '';
  const { note, positions, pencil, inspection, heldDocuments, sampleHeld } = interaction;
  const appearance = sampleAppearance(item.sample);
  return `<section class="paper-work"><div class="section-label"><b>收件</b><span>${item.documents.length} 份</span></div><div class="papers">${item.documents.map((doc, index) => paperCard(doc, index, tutorial, positions[index], heldDocuments.includes(index))).join('')}</div>
      ${pencil ? '<button class="desk-pencil" data-act="egg" data-key="pencil" data-fixture="pencil" aria-label="按住滚过来的铅笔" title="一支铅笔滚过来了"></button>' : ''}</section>
    <section class="sample-work"><button class="sample-preview${cls('instructed', tutorial?.target === 'sample')}" data-act="sample" data-fixture="sample"${sampleHeld ? ' data-lifted' : ''} aria-label="检查${appearance.name}"><span class="sample-visual sample-preview-art${cls('turned', inspection.back)}${cls('peeled', inspection.film)}${cls('unpacked', inspection.unpacked)}" data-kind="${esc(item.sample.kind)}" data-appearance="${appearance.key}">${sampleArt(item.sample, appearance, inspection.back, false)}</span><span class="sample-caption">${appearance.name}</span></button></section>
    <aside class="stamp-rail"><div class="section-label"><b>出票</b><span>${esc(item.batch)}</span></div><div class="stamp-buttons">${stampButtons(tutorial?.key === 'stamp', run.phase !== 'case' || Boolean(tutorial && tutorial.key !== 'stamp'))}</div>
      <p class="stamp-tip">${note ? `备注 · ${esc(note)}` : '可在纸上选一项作为依据'}</p></aside>`;
}

export function overlay(run, ending) {
  const day = DAYS[run.day];
  if (run.phase === 'brief') return `<div class="stage-overlay"><section class="brief-card"><div class="eyebrow">代班记录 · 第 ${run.day + 1} 天</div><h2>${day.title}</h2><h3>${esc(day.subtitle)}</h3><p>${esc(day.intro)}</p>${button('拉起卷帘', 'start-day', 'primary')}</section></div>`;
  if (run.phase === 'summary') {
    const records = run.records.filter(({ day: dayIndex }) => dayIndex === run.day);
    return `<div class="stage-overlay"><section class="brief-card summary-card"><div class="eyebrow">${day.title} · 收班回执</div><h2>当班交接</h2><ul class="summary-list">${records.map((record) => `<li><b>${record.batch}</b><span>${labels[record.decision]} · ${statuses[record.status]}</span></li>`).join('')}</ul><p>${esc(day.outro)}</p>${button('下一班', 'advance-day', 'primary')}</section></div>`;
  }
  if (run.phase === 'handoff') return `<div class="stage-overlay"><section class="brief-card handoff-card"><div class="eyebrow">周五 · 交接板</div><h2>最后一张单</h2><p>老周「最后一趟车先等你。核对完这些单，再把板给我。」</p><div class="brief-actions">${button('核对与更正', 'archive')}${button('打电话', 'phone')}${button('交接', 'handoff', 'primary')}</div></section></div>`;
  if (run.phase === 'ending') {
    const { count, batches } = ending.delayed;
    const delayed = count ? `${batches.join('、')}${count > batches.length ? ' 等 ' : '，共 '}${count} 批经核对可以放行的货，还在待审区或退件区。` : '';
    return `<div class="stage-overlay ending-overlay"><section class="brief-card ending-card ending-${ending.id}"><div class="eyebrow">南渡防护用品厂 · 交班存根</div>
      <h2>${esc(ending.title)}</h2><p>${esc(ending.line)}</p><div class="ending-note">${esc(ending.detail).replace(/\n/g, '<br>')}</div>
      ${ending.id === 'issue' && ending.traceDisposition ? `<p>${esc(ending.traceDisposition)}</p>` : ''}
      ${delayed ? `<p class="ending-delay"><b>未放行</b> ${esc(delayed)}</p>` : ''}
      <div class="ending-counts">${Object.entries(ending.counts).map(([key, count]) => `<span><b>${count}</b>${labels[key]}</span>`).join('')}</div><div class="ending-stamp">${esc(ending.stamp ?? '交班已存档')}</div>
      <div class="brief-actions">${button('返回窗口', 'home')}${button('再接一周', 'new', 'primary')}</div></section></div>`;
  }
  return '';
}

export function dialog(title, body, type = '') {
  return `<div class="modal-shade" data-act="shade"><section class="modal ${type}" role="dialog" aria-modal="true" aria-labelledby="panel-title"><header class="modal-head"><h2 id="panel-title">${esc(title)}</h2><button class="modal-close" data-act="close" aria-label="关闭面板">×</button></header><div class="modal-body">${body}</div></section></div>`;
}

function deskSurface(title, body, type, closeText, page) {
  return `<section class="desk-surface ${type}" data-desk-surface="${type}"${page === undefined ? '' : ` data-surface-page="${esc(page)}"`} role="region" aria-labelledby="panel-title">
    ${closeText ? `<header class="desk-surface-bar"><h2 id="panel-title">${esc(title)}</h2><button class="modal-close surface-close" data-act="close" aria-label="关闭面板">${closeText}</button></header>` : `<h2 class="visually-hidden" id="panel-title">${esc(title)}</h2>`}
    <div class="desk-surface-content">${body}</div></section>`;
}

export function instructions(how) {
  return dialog(how ? '接班说明' : '桌边查验卡', `<div class="rule-sheet"><p>先认箱签，按送检联核对收到的报告。看批号、签发和检验项目，再按实际品类查镜片、罩壳、手套接缝或插片。</p>
    <ol><li><b>通过</b>　样品合格，有效报告能对应这批，并覆盖送检要求。</li><li><b>不通过</b>　实物确有裂纹、划伤、扣件问题或已查明的错型、超差。</li><li><b>要求审查</b>　报告没交、对不上或没验齐，先隔离，等对方补证或安排复检。</li></ol>
    <p>有换签时对照登记上的旧号和新号。样品上的保护膜可以揭角。核对过的旧单会留在交接簿。</p>
    ${how ? '<p>点纸张可打开，拖动可移动，两指可在系统支持时缩放视图。电脑也可用 1、2、3 开单，Esc 合上面板。</p>' : ''}</div>`, 'rules-modal');
}

function sheet(doc, index, inspection) {
  const rows = doc.fields.map(([key, value], field) => {
    const text = esc(value);
    const highlight = inspection?.signature && key.includes('签发');
    const chosen = inspection?.note === `${key} · ${value}`;
    const fieldValue = inspection ? `<button class="field-value${cls('instructed', highlight)}" data-act="basis" data-i="${index}" data-field="${field}"${active(chosen)}>${text}</button>` : text;
    return `<div><dt>${esc(key)}</dt><dd>${fieldValue}</dd></div>`;
  }).join('');
  return `<article class="sheet sheet-${doc.type}"><small>${types[doc.type] ?? '留底'} · 南渡防护用品厂</small><h3>${esc(doc.title)}</h3><dl class="fields">
    ${rows}</dl>${doc.note ? `<p class="sheet-note">${esc(doc.note)}</p>` : ''}</article>`;
}

export function documents(item, index, compare, tutorial, progress) {
  const doc = item.documents[index];
  if (!doc) return '';
  const extras = [3, 15].includes(item.id) ? button('翻工艺夹板背面', 'egg', 'secondary', 'data-key="cat"') : item.id === 16 ? button('翻登记本后页', 'egg', 'secondary', 'data-key="umbrella"') : '';
  const other = item.documents[compare];
  const signature = tutorial?.key === 'signature';
  const inspection = { signature, note: progress.note };
  const guide = signature ? `${progress.signed ? '签发已核对。' : '点报告上的「已签发」。'}${progress.orderSeen ? '送检联已核对。' : '再并排翻看送检联的检验项目。'}` : tutorial?.line;
  const tabs = item.documents.map(({ title, type }, position) => {
    const side = other ? (position === index ? '左' : position === compare ? '右' : '') : '';
    return `<button class="button tab${cls('instructed', tutorial?.target === type)}" data-act="doc" data-i="${position}"${active(position === index || position === compare)}>${esc(title)}${side ? `<small class="sheet-side">${side}</small>` : ''}</button>`;
  }).join('');
  return deskSurface('桌面单据', `${guide ? `<p class="modal-guide"><b>老周</b> ${esc(guide)}</p>` : ''}<nav class="doc-tabs" aria-label="${other ? '切换右侧单据' : '单据切换'}">${tabs}</nav>
    <div class="doc-grid${cls('pair', other)}">${sheet(doc, index, inspection)}${other ? sheet(other, compare, inspection) : ''}</div>
    <div class="modal-actions">${item.documents.length > 1 ? button(other ? '收起右页' : '并排核对', 'compare') : ''}${tutorial?.key === 'sample' ? button('检查样品', 'sample', 'primary') : ''}${extras}</div>`, 'documents-surface', '放回台面', `${index}:${compare ?? ''}`);
}

export function sample(item, inspection, tutorial) {
  const { back, film, clasp, tug, measured, unpacked } = inspection;
  const spec = item.sample;
  const kind = spec.kind;
  const appearance = sampleAppearance(spec);
  const packaged = kind === 'yellow' && !unpacked;
  const visual = sampleObservation(spec, inspection);
  return deskSurface(`${item.batch} · ${appearance.name}`, `${tutorial ? `<p class="modal-guide"><b>老周</b> ${esc(tutorial.line)}</p>` : ''}<div class="sample-inspector"><div class="sample-visual sample-stage${cls('turned', back)}${cls('peeled', film)}${cls('pulled', tug)}${cls('unpacked', unpacked)}${cls('measured', measured)}" data-kind="${esc(kind)}" data-appearance="${appearance.key}">
    ${sampleArt(spec, appearance, back, measured && spec.reading)}</div><div class="sample-findings"><b>${packaged ? '包装' : back ? '背面' : appearance.front ?? '正面'}</b><p>${esc(visual)}</p>
    ${measured && spec.reading ? `<p class="reading">量规读数 <strong>${esc(spec.reading)}</strong></p>` : ''}</div></div>
    <div class="modal-actions">${packaged ? button('拆开包装', 'sample-unpack', 'primary') : button(back ? `看${appearance.front ?? '正面'}` : '翻到背面', 'sample-flip', !back && tutorial ? 'primary' : 'secondary')}
    ${!back && ['film', 'crack'].includes(kind) ? button(film ? '放回保护膜' : '揭开膜角', 'sample-film') : ''}
    ${appearance.clasp && back && !tug ? button(!clasp ? '按合扣件' : '轻拉检查', !clasp ? 'sample-clasp' : 'sample-tug', tutorial?.key === 'sample' ? 'primary' : 'secondary') : ''}
    ${spec.reading ? button(measured ? '取出量规' : '放进量规', 'sample-measure') : ''}${tug || film || measured || back || unpacked ? button('记为查验依据', 'sample-basis') : ''}${tutorial?.key === 'stamp' ? button('回台面开单', 'close', 'primary') : ''}</div>`, 'sample-surface', '放下检样');
}

function receiptFacts(record, destinationLabel = '去向', showEmptyNote = false) {
  return `<dl class="receipt-facts"><div><dt>${destinationLabel}</dt><dd>${esc(statuses[record.status] ?? '待登记')}</dd></div>
    ${record.note || showEmptyNote ? `<div><dt>开单依据</dt><dd>${esc(record.note || '未另记')}</dd></div>` : ''}</dl>`;
}

function archivedReceipt(record, latestReceipt) {
  if (!record) return '';
  const changed = record.amendments?.length > 0;
  return `<article class="archive-receipt receipt-${record.decision}" aria-label="出票留底">
    <div class="archive-receipt-head"><div><strong>出票留底</strong><small>${esc(DAYS[record.day]?.title ?? '')}开单${changed ? ` · ${esc(labels[record.original])}` : ''}</small></div>
      <span class="receipt-result">${esc(labels[record.decision])}</span></div>
    ${receiptFacts(record, latestReceipt ? '前次去向' : '现去向', true)}
    ${latestReceipt ? `<p class="archive-current-disposition">${esc(DAYS[latestReceipt.day]?.title ?? '')}复核后，现去向为<strong>${esc(statuses[latestReceipt.status])}</strong>。</p>` : ''}
    ${changed ? `<ol class="receipt-amendments" aria-label="更正记录">${record.amendments.map((entry) => `<li><b>${esc(DAYS[entry.day]?.title ?? '')}更正</b>
      <span>${esc(labels[entry.from])} → ${esc(labels[entry.to])}</span><small>${esc(statuses[entry.previousStatus] ?? '待登记')} → ${esc(statuses[entry.status] ?? '待登记')}</small></li>`).join('')}</ol>` : ''}</article>`;
}

export function receipt(record) {
  return deskSurface('出货回执', `<div class="receipt-slip receipt-${record.decision}"><div class="eyebrow">成品抽检窗口 · 出票留底</div><b>${esc(record.batch)}</b><span class="receipt-result">${labels[record.decision]}</span>${receiptFacts(record)}</div><div class="modal-actions">${button('接着值班', 'next', 'primary')}</div>`, 'receipt-surface');
}

export function archivePanel(rows, visits, focus, selected, query, editing, handoff) {
  const row = rows.find(({ id }) => id === focus);
  const visit = visits.find(([key]) => key === focus)?.[1];
  const visitIndex = visits.length ? `<h3 class="archive-group-title">回访留底</h3>${visits.map(([key, doc]) =>
    `<button class="record-button archive-visit-row" data-act="archive-evidence" data-key="${esc(key)}"${active(key === focus)}><b>${esc(doc.title)}</b></button>`).join('')}` : '';
  const records = rows.slice().reverse().map(({ id, batch, title, record, latestReceipt }) => {
    const status = latestReceipt ? '前次回执' : record ? statuses[record.status] : '本班来件';
    return `<button class="record-button" data-act="archive-focus" data-i="${id}"${active(id === focus)}><b>${esc(batch)}</b><span>${esc(title)}</span><small>${esc(status)}</small></button>`;
  }).join('');
  const index = `${visitIndex}${visits.length && rows.length ? '<h3 class="archive-group-title">批次单据</h3>' : ''}${records}`;
  let details = '<p class="archive-empty">选一张留底，可以翻看原来的单据。</p>';
  if (visit) details = sheet(visit);
  if (row) {
    const { latestReceipt } = row;
    const canAmend = handoff && row.record && !latestReceipt;
    details = `<div class="modal-actions archive-actions">${button(selected.includes(row.id) ? '已放到电话旁 · 取回' : '带到电话旁', 'archive-pin', 'secondary', `data-i="${row.id}"`)}
      ${latestReceipt ? button('查看后续回执', 'archive-followup', 'secondary', `data-i="${latestReceipt.id}"`) : ''}
      ${canAmend ? button(editing ? '取消更正' : '更正开单', 'edit-record') : ''}</div>
      ${editing && canAmend ? `<div class="stamp-buttons archive-correction">${stampButtons(false, false, 'recheck')}</div>` : ''}
      ${archivedReceipt(row.record, latestReceipt)}<div class="doc-grid">${row.documents.map((doc) => sheet(doc)).join('')}</div>`;
  }
  return deskSurface('交接簿', `<div class="archive-layout"><div><form class="archive-search" data-form="archive"><label for="archive-query">查找批号或报告号</label><div><input id="archive-query" name="query" value="${esc(query)}" placeholder="输入编号"><button class="button secondary">查找</button></div></form>
    <div class="drawer-list" aria-label="留档单据">${index || '<p>没有找到匹配的单据。</p>'}</div></div>
    <div class="archive-detail">${details}</div></div>`, 'archive-surface', '合上簿子', query);
}

export function phone(number, call, pinned, numberGuide, phoneBack) {
  return dialog('窗口电话', `<div class="phone-layout"><div class="phone-machine"><div class="phone-screen" aria-live="polite">${esc(number || '— — —')}</div><div class="phone-pad">${'1234567890'.split('').map((n) => `<button data-act="phone-digit" data-key="${n}">${n}</button>`).join('')}<button data-act="phone-clear" aria-label="删除一位">⌫</button><button class="phone-call" data-act="dial" aria-label="拨出">拨出</button></div></div>
    <div class="phone-side">${numberGuide ? '<div class="phone-directory"><button class="button secondary" data-act="phone-select" data-key="204">实验室 204</button></div>' : ''}
    ${pinned.length ? `<p class="phone-pinned">电话旁 ${pinned.map(({ batch }) => esc(batch)).join('、')}</p>` : ''}
    <div class="phone-log" aria-live="polite">${call ? `<b>${esc(CHARACTERS[call.npc]?.name ?? '内线')} · ${esc(call.number)}</b>${call.lines.map((line) => `<p>${esc(line)}</p>`).join('')}` : '<p>拨出内线，或从交接簿拿一张单来问。</p>'}</div>
    <div class="modal-actions">${button('交接簿', 'archive')}${button(phoneBack ? '机底贴纸 · 880' : '翻看机底', 'phone-back')}</div></div></div>`, 'phone-modal');
}

export function handoffPanel(run, evidence) {
  return dialog('周五交接', `<div class="handoff-paper"><p>确认下一班拿到你手里的回执和留底。</p>
    ${['trace', 'night'].map((key) => run.flags[`${key}Document`] ? `<div class="handoff-evidence">${sheet(evidence[key])}${button(run.flags[`${key}Attached`] ? '已夹入 · 取回' : '夹入交接板', 'attach', run.flags[`${key}Attached`] ? 'primary' : 'secondary', `data-key="${key}"`)}</div>` : '').join('')}
    <div class="modal-actions">${button('回看全周出货', 'archive')}${button('拉铃交班', 'finish', 'primary')}</div></div>`, 'handoff-modal');
}

export function egg(key, caseId) {
  const extra = EASTER_EGGS[key];
  return dialog(extra.title, `<div class="egg-note"><p>${esc(extra.line)}</p>${caseId === extra.slots[1] ? `<p>${esc(extra.returnLine)}</p>` : ''}</div>`, 'egg-modal');
}

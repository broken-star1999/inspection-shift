export const CHARACTERS = {
  luo: { name: '小罗', role: '仓管 · 罗诚' },
  tang: { name: '小唐', role: '轮岗实习生 · 唐禾' },
  xu: { name: '许师傅', role: '装配线返工员' },
  chen: { name: '小陈', role: '实验员 · 陈敏' },
  zhou: { name: '老周', role: '代班交接 · 周建' },
  sun: { name: '孙姐', role: '夜班接货员' },
};

const seal = ['签发', '已签发'];
const visual = ['外观', '符合'];
const clasp = ['扣合', '符合'];
const gloveReport = [['缝线', '符合'], ['掌面覆层', '符合'], seal];
const earmuffReport = [visual, ['头带调节', '符合'], ['隔声抽测', '符合'], seal];
const earmuffChecks = [['检验项目', '外观、头带调节、隔声抽测']];
const shieldReport = [visual, ['耐冲击', '符合'], seal];

function label(batch, fields = [], product = '防护护目镜') {
  return { type: 'label', title: '外箱标签', fields: [['批号', batch], ['品名', product], ...fields] };
}

function report(batch, number, fields = [visual, clasp, seal], title = '检验报告', note) {
  return { type: 'report', title, fields: [['批号', batch], ['报告编号', number], ...fields], note };
}

function order(batch, fields = [['检验项目', '外观、扣合']]) {
  return { type: 'order', title: '送检联', fields: [['批号', batch], ...fields] };
}

function archive(title, fields, note) {
  return { type: 'archive', title, fields, note };
}

function standard(batch, number) {
  return [label(batch), report(batch, number), order(batch)];
}

const clear = { kind: 'clear', appearance: 'classic', front: '视窗平整，转一个角度也看不到裂纹或划伤。', back: '两侧插片完整。扣上后轻拉，没有脱开。' };
const shield = { kind: 'clear', appearance: 'shield', front: '弧形透明面屏的视野内没有划伤，前缘完整。', back: '沿内侧接缝检查，面屏与头带固定座贴合，连接点没有开裂。' };
const glove = { kind: 'clear', appearance: 'glove', front: '掌面覆层平整，指尖没有起皮或破口。', back: '背面的缝线连续，织布腕口边缘收得齐整。' };
const earmuff = { kind: 'clear', appearance: 'earmuff', front: '双侧耳罩壳体完整，头带可以顺畅调节。', back: '两圈软垫都贴着壳沿，没有明显凹陷或脱开。' };

export const TUTORIAL = [
  { target: 'label', title: '先认箱', line: '先看箱子是谁。这儿写二零一。你点开看看。' },
  { target: 'report', title: '对批号', line: '拿起检验报告，看看批号是不是二零一。' },
  { target: 'order', title: '核对签发与项目', line: '号对了，再找报告的签发栏。拿送检联挨着它放，外观和扣合两项都得有结果。' },
  { target: 'sample', title: '动手检查', line: '拿起这副。正面看镜片，再翻到背面。扣上以后轻拉一下。' },
  { target: 'pass', title: '把单交出去', line: '镜片好，扣件也牢。你自己盖个通过，把这张交给小罗。' },
];

export const PRESSURE = [
  { slots: [5, 16], line: '这车要是赶得上，周五收尾我帮你找人顶。' },
  { slots: [10, 20], line: '你要压这批也行。主任问起来，我就把这张带你名字的单给他看。' },
];

export const PHONE = {
  '204': {
    npc: 'chen',
    greeting: '实验室，小陈。把要查的单据放到电话旁，我帮你核对上面的报告号。',
    archiveHint: '这批已经换过报告。拿作废随货联上的原报告号去交接簿查查，找到别的随货联，也放到电话旁。',
    relatedHint: '我先记下这张随货联。你拿上面的报告号去交接簿查查，找到别的随货联，也放到电话旁。',
    inquiry: '另一张也是 R-071？你等我翻翻原本。',
    found: '找到了。原件只测过试样 S-019。二四八已经有新结果，二四一要另查。我把签的那页带下来。',
    delivery: '你看样品来源那一栏。我能证明的是这一页，你把它夹在二四一随货联后面。',
    received: '原件已经送到了。你从交接簿翻出那一页，核对一下样品来源。',
    evidence: archive('R-071 实验室原件', [['报告编号', 'R-071'], ['样品来源', '试样 S-019'], ['检验范围', '仅限试样'], ['签发', '陈敏']], '本页为实验室留底。'),
  },
  '107': {
    npc: 'sun',
    greeting: '夜班窗口。把你要查的单据放到电话旁，我照手上的登记查。',
    found: '周二晚上唐禾来问过。我退了那份批号不对的单。我把回执拿给你。',
    delivery: '给你，周二夜班那份。时间写在右边，我签过了。',
    received: '存根已经送到了。你从交接簿翻出来，时间和签收人都在上面。',
    evidence: archive('夜班退单存根', [['批号', 'G-211'], ['经手人', '唐禾'], ['退单缘由', '换签登记未对应来箱'], ['记录时间', '周二 22:18'], ['签收人', '孙姐']]),
  },
  '880': {
    npc: 'zhou',
    greeting: '一声短音过去，挂断后桌上的电话自己响了起来。',
    found: '听见响就合格。别拍话筒，拍坏了也得开单。',
  },
};

export const HANDOFF = {
  normal: { title: '周五交班', line: '老周把交接单翻到最后一页。「该留下一班的都在这儿。行，你下班吧。」', stamp: '本周交班完成' },
  investigation: { title: '第二张复检单', line: '老周对着电话念了一遍二四一。他等对方把号码重复一遍，才在回执上圈住那个号。', stamp: 'G-241 追加复检' },
  escaped: { title: '车已经走了', line: '电话又响了一声。老周用手背按住要卷起来的回执。「你把那箱的号再说一遍。」', stamp: '待接收方确认' },
};

export const EASTER_EGGS = {
  cat: {
    slots: [3, 15],
    title: '巡检临时工牌',
    line: '岗位：巡检。工作范围：晒太阳。',
    returnLine: '上面多了一行字：「因在岗睡觉，调夜班。」',
  },
  umbrella: {
    slots: [16, 17],
    title: '绿格子伞借用条',
    line: '物品：绿格子伞。归还：送回来了，还滴水。',
    returnLine: '你也看见了？老周这两天看见我就催我晾伞。',
  },
  pencil: {
    slots: [8, 12],
    title: '滚过来的铅笔',
    line: '谢了，这支再掉就只剩橡皮了。',
    returnLine: '还是那支笔。尾巴上横绑了一小截木条，放下来果然不会滚。',
  },
};

export const DAYS = [
  {
    title: '周一', subtitle: '老周带你接班',
    intro: '窗口这周你顶。单走一个，货才走一个。先看这批。',
    outro: '小罗从窗外把本班回执递回来。远处响过一声铃，卷帘拉下。',
    cases: [
      {
        id: 1, batch: 'G-201', npc: 'luo', title: '小罗的第一箱',
        line: '二零一，单都在这儿。那张出门联给我就行。',
        answer: 'pass', reason: '实物与材料齐全', response: '好，我去叫车。下一批就在门外。',
        documents: standard('G-201', 'R-061'), sample: clear,
      },
      {
        id: 2, batch: 'G-202', npc: 'tang', title: '灯下那道白痕',
        line: '我在灯下看到一条白的。要不我先拿回去？',
        answer: 'pass', reason: '白痕随保护膜脱离', response: '原来在膜上。下回我自己先看一眼。',
        documents: standard('G-202', 'R-062'),
        sample: {
          ...clear, kind: 'film', front: '视窗上有一道斜过来的白痕。膜角还没有粘紧。',
          afterFilm: '白痕随薄膜掀起。下方的镜片平整。',
        },
      },
      {
        id: 3, batch: 'G-203', npc: 'xu', title: '老模子的细线',
        line: '耳罩外壳这条线每次都有人问。你拿夹板上的图对一对。',
        answer: 'pass', reason: '细线与允许的合模线相符', response: '这套模子比我进厂还早两年。',
        documents: [label('G-203', [], '防噪耳罩'), report('G-203', 'R-063', earmuffReport), archive('耳罩外壳工艺示意', [['图号', 'WX-3'], ['合模线允许位置', '耳杯外壳下沿'], ['目视限制', '不得贯穿壳体或延伸到软垫']], '逆着这张纸看，夹板背面还压了东西。')],
        sample: { kind: 'line', appearance: 'earmuff', front: '耳杯外壳下沿有一道细线，边缘很整齐。', back: '细线沿外壳收住，内侧壳体没有裂口，软垫也完整。' },
      },
      {
        id: 4, batch: 'G-204', npc: 'zhou', title: '最后一趟车',
        line: '今天这趟还剩一个位子。你先看，有问题我让车等。',
        answer: 'fail', reason: '镜片内侧有分叉裂纹', response: '二零四先卸下来。记一下裂的地方，明早返工的人好找。',
        documents: standard('G-204', 'R-064'),
        sample: {
          ...clear, kind: 'crack', front: '一道分叉白纹伸进镜片中间。',
          afterFilm: '膜角已经掀起，分叉白纹还留在镜片上。',
        },
      },
    ],
  },
  {
    title: '周二', subtitle: '少了一份报告',
    intro: '小罗在窗下压了一张内线表。「缺报告找 204，小陈。」',
    outro: '204 响过一声。小陈说今天晚交的几份报告，明早一起送。',
    cases: [
      {
        id: 5, batch: 'G-205', npc: 'luo', title: '少来了一张报告',
        line: '二零五的箱签和送检联我都带了。实验室那份还没送下来。',
        answer: 'review', reason: '未随货提供本批检验报告', response: '行，我让他们别装这箱。拿到报告我再来。',
        documents: [label('G-205', [], '防噪耳罩'), order('G-205', earmuffChecks)], sample: earmuff,
      },
      {
        id: 6, batch: 'G-206', npc: 'tang', title: '换过一只纸箱',
        line: '外箱昨晚淋湿了，换了干箱子。旧签还夹在登记上。',
        answer: 'pass', reason: '换签登记对应本箱', response: '我就怕丢了这张。下回我把它夹在第一张。',
        documents: [label('G-206', [], '作业防护手套'), report('G-106', 'R-066', gloveReport), archive('换签登记', [['原箱批号', 'G-106'], ['现箱批号', 'G-206'], ['缘由', '外箱受潮；原货转箱'], seal])], sample: glove,
      },
      {
        id: 7, batch: 'G-241', npc: 'luo', title: '横折过的随货联',
        line: '二四一。补印那张给你夹好了，几箱一趟走，我去喊车。',
        answer: 'pass', reason: '随货核验联与实物一致', response: '我把这联压平再交给装车的，折过有点翘。',
        documents: [label('G-241', [], '防护面屏'), report('G-241', 'R-071', shieldReport, '随货核验联', '横折痕很浅，没有盖住签发栏。'), order('G-241', [['发货区', '二号装货台'], ['检验项目', '外观、耐冲击']])], sample: shield,
      },
      {
        id: 8, batch: 'G-208', npc: 'xu', title: '框里一行刻字',
        line: '外箱是 A。框里头有一行小字，你帮我对一下。',
        answer: 'pass', reason: '框内为发货指定型号 A', response: '好，这回我拿对格子了。',
        documents: [label('G-208', [['型号', 'A']]), report('G-208', 'R-072', [visual, clasp, ['型号', 'A'], seal]), order('G-208', [['指定型号', 'A'], ['接口要求', 'A 型卡口']])],
        sample: { kind: 'clear', appearance: 'vented', front: '视窗无伤。接口型号刻在框的内侧。', back: '内框刻字：型号 A。', model: 'A' },
        variants: [
          {},
          { answer: 'fail', reason: '检样刻字 B，发货要求 A', response: '还真拿错了。库里左边那两格贴得太像。', sample: { kind: 'wrongModel', back: '内框刻字：型号 B。', model: 'B' } },
        ],
      },
    ],
  },
  {
    title: '周三', subtitle: '有些东西会回来',
    intro: '卷帘刚拉过半，黄线那头就有人把昨天的箱子挪了回来。',
    outro: '小唐来拿落在台边的笔。他说，明早自己会把登记原件带来。',
    cases: [
      {
        id: 9, batch: 'G-205', npc: 'luo', title: '送到窗口的二零五报告',
        line: '昨天等的那份送到了。你对一下签发栏。',
        answer: 'pass', reason: '本批已签发报告齐全，检样合格', response: '行，这回我把回单和报告钉在一起。',
        documents: [label('G-205', [], '防噪耳罩'), report('G-205', 'R-065', [...earmuffReport, ['签发时间', '周三 08:06']], '耳罩检验报告'), order('G-205', earmuffChecks)], sample: earmuff,
        followUp: { caseId: 5, sameLot: true, lines: { pass: '车那边还收着回单。昨天缺的报告刚领到，你帮我核一下。', fail: '二零五从退件区搬回来了。实验室报告也拿到了。', review: '昨天等的那份送到了。那箱耳罩还在黄线里，你对一下。' } },
      },
      {
        id: 10, batch: 'G-248', npc: 'zhou', title: '等着上车的二四八',
        line: '装车那边在等二四八。我能多留一会儿，你告诉我缺的是哪张。',
        answer: 'review', reason: '缺少本批耐冲击结果', response: '二四八先挪到黄线内，实验室那份我明早去问。',
        documents: [label('G-248', [], '防护面屏'), report('G-248', 'R-079', [visual, seal], '外观抽检报告'), order('G-248', [['必查项目', '外观、耐冲击'], ['随货要求', '附本批实验室耐冲击结果']])], sample: shield,
      },
      {
        id: 11, batch: 'G-211', npc: 'tang', title: '记录差了一行',
        line: '还是昨晚那一摞。这个我对过，应该一样。',
        answer: 'review', reason: '登记的新签号不是本箱', response: '夜班退过一次。我问了两个人，都叫我先送来看看。',
        documents: [label('G-211', [], '作业防护手套'), report('G-111', 'R-081', gloveReport), archive('换签登记', [['原箱批号', 'G-111'], ['现箱批号', 'G-216'], ['夜班退单', '请核对实物对应批号'], ['经手窗口', '内线 107']], '右下是前一晚的退单章。')], sample: glove,
      },
      {
        id: 12, batch: 'G-212', npc: 'xu', title: '响了一声的卡扣',
        line: '这批扣子偏紧。压到头的时候响一声，你听听。',
        answer: 'pass', reason: '扣合后轻拉保持闭合', response: '行，我回去教他们怎么按，好多人按到一半就松手。',
        documents: [label('G-212'), report('G-212', 'R-083'), order('G-212', [['检验项目', '外观、扣合'], ['扣合要求', '按合后轻拉，扣件不得脱开']])],
        sample: { kind: 'clear', appearance: 'compact', front: '镜片无伤，卡扣放开时张得比较大。', back: '按紧有一声咔哒。再轻拉，扣件仍然闭合。' },
        variants: [
          {},
          { answer: 'fail', reason: '卡扣发声后轻拉脱开', response: '响是响了，拔一下就开。这箱我带回去。', sample: { kind: 'loose', appearance: 'compact', front: '镜片无伤，卡扣放开时张得比较大。', back: '按紧有一声咔哒。再轻拉，扣件一下弹了开。' } },
        ],
      },
    ],
  },
  {
    title: '周四', subtitle: '一张新的，一张旧的',
    intro: '窗角贴着一张纸，「周五交班，改章请在原回执旁另开一联。」',
    outro: '老周把交接板靠在窗边，教你把原来的回执留在新单后面。',
    cases: [
      {
        id: 13, batch: 'G-211', npc: 'tang', title: '换签登记的原件',
        line: '这次是原件。我自己顺着出货栏对了一遍。',
        answer: 'pass', reason: '原件显示 G-111 更为 G-211', response: '昨天说是我夹错的。也有可能吧，我今天先把单收好。',
        documents: [label('G-211', [], '作业防护手套'), report('G-111', 'R-081', gloveReport), archive('换签原件', [['原箱批号', 'G-111'], ['现箱批号', 'G-211'], ['签发人', '库管二班'], ['签发时间', '周四 07:48'], seal])], sample: glove,
        followUp: { caseId: 11, sameLot: true, lines: { pass: '我重对过出货栏，这是原件，你再把它夹在昨天那一联旁边。', fail: '不是返工出来的。昨晚重新找了原签，这回我带在最上面。', review: '这次是原件。我自己顺着出货栏对了一遍。' } },
        nightResponse: '孙姐也给我留了那晚的回执。',
      },
      {
        id: 14, batch: 'G-248', npc: 'luo', title: '夹回来的作废联',
        line: '二四八，这回结果签了。实验室把那张作废随货联也夹来了。',
        answer: 'pass', reason: 'R-084 补齐了本批耐冲击结果', response: '耐冲击报告总算签了。你把旧联留着，我喊下一位进来。',
        documents: [label('G-248', [], '防护面屏'), report('G-248', 'R-084', shieldReport, '本批复检报告'), archive('作废随货联', [['批号', 'G-248'], ['原报告编号', 'R-071'], ['状态', '已撤回'], ['复检通知', '改用 R-084']], '原随货联仅留档。')], sample: shield,
        followUp: { caseId: 10, sameLot: true, lines: { pass: '二四八的留样和补检回执。上一车那批也记在这张新报告上。', fail: '返送的二四八在这儿。这次实验室把结果签完了。', review: '黄线里面那箱二四八，这回结果签了。实验室把作废联也夹来了。' } },
      },
      {
        id: 15, batch: 'G-204', npc: 'xu', title: '修好的镜片',
        line: '二零四换了镜片。头一天那道缝，从边上就看得出来。',
        answer: 'fail', reason: '扣件插片折断', response: '镜片做完了，扣还是老的。回去按整件修。',
        documents: [label('G-204'), report('G-204', 'R-085', [['返工项目', '换镜片'], ['镜片复测', '符合'], seal], '返工复检联'), order('G-204')],
        sample: {
          kind: 'broken', appearance: 'classic', front: '新镜片透亮。正面盖住了扣件插片。',
          back: '扣件内侧少了一截插片。', afterTug: '轻拉一下，缺了一截插片的扣件立刻弹开。',
        },
        followUp: { caseId: 4, sameLot: false, lines: { pass: '这趟是厂里留下的几箱，先装车的你翻周一那张回单。这副换了镜片。' } },
      },
      {
        id: 16, batch: 'G-216', npc: 'luo', title: '泛黄的纸袋',
        line: '上面那只袋子黄成这样，你拆开看看里头。',
        answer: 'pass', reason: '泛黄在外包，实物正常', response: '外面晒过太阳。库里还有一卷，我拿去装湿雨鞋吧。',
        documents: [label('G-216', [], '作业防护手套'), report('G-112', 'R-086', gloveReport), archive('本箱换签登记', [['原箱批号', 'G-112'], ['现箱批号', 'G-216'], seal], '背面夹着一张作废单，像是顺手写的借伞条。')],
        sample: { kind: 'yellow', appearance: 'glove', front: '外层包装袋泛黄，开口能看到手套的织布腕口。', unwrapped: '取出后，手套织物与掌面覆层的颜色均匀，泛黄留在包装袋上。', back: '翻过手套，背面的缝线连续，织布腕口没有松脱。' },
      },
    ],
  },
  {
    title: '周五', subtitle: '最后一趟车',
    intro: '交接板已经摊开。老周说，最后一笔办完，原回执还能翻出来复核。',
    outro: '铃声停下了。老周把交接板推到你手边，等你核完上头的箱号。',
    cases: [
      {
        id: 17, batch: 'G-217', npc: 'luo', title: '掉了的箱签',
        line: '签掉了。我肯定这是二一七，库里那排只剩这一箱。',
        answer: 'review', reason: '箱与本批报告无法对应', response: '我先把它放黄线里，审查单夹在箱盖上。',
        documents: [label('无法识别', [['残留', '只剩空白底纸']], '防噪耳罩'), report('G-217', 'R-087', earmuffReport), order('G-217', earmuffChecks)], sample: earmuff,
      },
      {
        id: 18, batch: 'G-218', npc: 'xu', title: '卡扣插片的厚度',
        line: '这盒颜色跟昨天的一样。你量一下这个地方。',
        answer: 'fail', reason: '实测 1.80 mm，低于 2.00 mm', response: '这盒装上去会滑出来。我带回装配二线。',
        documents: [label('G-218', [], '卡扣插片'), report('G-218', 'R-088', [['厚度', '2.10 mm'], seal]), order('G-218', [['检查部位', '卡扣插片'], ['厚度范围', '2.00–2.20 mm']])],
        sample: { kind: 'thin', appearance: 'clip', front: '一枚灰色插片。厚薄需要放进量规确认。', back: '插片两端平整，中间的平面可以贴住量规。', reading: '1.80 mm' },
      },
      {
        id: 19, batch: 'G-219', npc: 'tang', title: '小唐自己对过的单',
        line: '这回我把旧签带着。红夹子也换下来了。',
        answer: 'pass', reason: '旧签、换签登记和现箱一致', response: '我记住了，得是手里这箱。',
        documents: [label('G-219', [], '作业防护手套'), report('G-119', 'R-089', gloveReport), archive('换签登记', [['原箱批号', 'G-119'], ['现箱批号', 'G-219'], ['随附', 'G-119 原箱签'], seal])], sample: glove,
        nightResponse: '孙姐的回执我也留了一份。以后谁先接、谁退回，顺着这摞都能找着。',
      },
      {
        id: 20, batch: 'G-220', npc: 'zhou', title: '交班前的最后一箱',
        line: '最后一箱。车先等你，你慢慢看。',
        answer: 'pass', reason: '本批实物与全部材料吻合', response: '还记得谁说明天来顶班吗？我呀。把交接板递给我看一眼。',
        documents: [label('G-220', [], '防噪耳罩'), report('G-220', 'R-090', earmuffReport), order('G-220', earmuffChecks)], sample: earmuff,
      },
    ],
  },
];

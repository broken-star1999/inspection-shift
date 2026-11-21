export const CHARACTERS = {
  luo: { name: '小罗', role: '仓管 · 罗诚' },
  tang: { name: '小唐', role: '轮岗实习生 · 唐禾' },
  xu: { name: '许师傅', role: '装配线返工员' },
  chen: { name: '小陈', role: '实验员 · 陈敏' },
  zhou: { name: '老周', role: '代班交接 · 周建' },
  sun: { name: '孙姐', role: '夜班接货员' },
};

export const RECEIPT_HANDLING = {
  default: {
    shipping: '我把这张送装货台，货先排着。',
    shipped: '货已经出库，我把补联夹在原回执后面。',
    returned: '我带这张去退件区，单跟件走。',
    held: '我先把货放到黄线里，审查单跟着走。',
    supplementReturned: '这次送来的留样我带回退件区，原来的出库回执还留着。',
    supplementHeld: '这次送来的留样先放黄线里，原来的出库回执还留着。',
  },
  luo: {
    shipping: '这张给装货台，我去排车。',
    shipped: '货已经出库了，我把这联送去并单。',
    returned: '我从退件门走，回单压在箱盖上。',
    held: '我先把箱子推到黄线里，这张夹箱盖上。',
    supplementReturned: '补验联我带回去，原批还在收货方。',
    supplementHeld: '补验联先留在你这儿，原批还在收货方。',
  },
  tang: {
    shipping: '那我拿这联去装货台。',
    shipped: '车已经走了。这张我夹回原单后面。',
    returned: '这份我先带回退件区，单也一块儿交。',
    held: '这张我夹在上面，货先放黄线里。',
    supplementReturned: '我先带这次的留样去退件区，装车那天的回单另外存。',
    supplementHeld: '我先把这次的留样放黄线里，装车那天的回单另外存。',
  },
  xu: {
    shipping: '让装货台照这联排。我顺路给他们带过去。',
    returned: '返工区我熟。单跟件走，省得他们回头找。',
    held: '我把件搁在黄线里，单压在上头。',
  },
  zhou: {
    shipping: '这联给装货台，我叫他们排上。',
    returned: '我让返工区接一下，单跟货走。',
    held: '先放黄线里。这张我夹在隔离架上。',
  },
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
  const hasMaterialRequirement = fields.some(([name]) => name === '随货要求' || name === '随货材料');
  const materials = hasMaterialRequirement ? [] : [['随货材料', '随货附本批检验报告']];
  return { type: 'order', title: '送检联', fields: [['批号', batch], ...fields, ...materials] };
}

function archive(title, fields, note) {
  return { type: 'archive', title, fields, note };
}

function g202RecheckDocument(title, stamp, location, department) {
  return {
    ...archive(title, [
      ['批号', 'G-202'],
      ['原报告编号', 'R-062'],
      ['原单日期', '周一'],
      ['原单印章', stamp],
      ['检查记录', '揭膜检查，视窗无损'],
      ['复核结论', '实物无需返修'],
      ['货物仍在', location],
      ['出单部门', department],
      ['复核日期', '周二'],
      ['复核签名', '许师傅'],
    ], '周一原单随本联留存。需要改变货物去向时，由原出票人另开更正联。'),
    kind: 'rework',
  };
}

export const G202_RECHECK = {
  fail: {
    npc: 'xu',
    title: 'G-202 返工复核联',
    line: '返工区复核过了，白印跟着膜揭下来了。箱子还在那儿，单给你。',
    document: g202RecheckDocument('G-202 返工复核联', '不通过', '返工区', '装配二线 · 返工复核'),
  },
  review: {
    npc: 'xu',
    title: 'G-202 隔离复核联',
    line: '黄线里那箱我揭膜看过，视窗没伤。箱子先留着，复核联给你。',
    document: g202RecheckDocument('G-202 隔离复核联', '要求审查', '黄线隔离区', '装配二线 · 隔离复核'),
  },
};

function standard(batch, number) {
  return [label(batch), report(batch, number), order(batch)];
}

function g206Documents(reportBatch) {
  return [
    label('G-206', [], '作业防护手套'),
    report(reportBatch, 'R-066', gloveReport),
    archive('换签登记', [['原箱批号', 'G-106'], ['现箱批号', 'G-206'], ['缘由', '外箱受潮；原货转箱'], seal]),
  ];
}

function g217Documents(orderFields = earmuffChecks) {
  return [
    label('无法识别', [['残留', '只剩空白底纸']], '防噪耳罩'),
    report('G-217', 'R-087', earmuffReport),
    order('G-217', orderFields),
  ];
}

const g217ExpectedCode = 'C-217-03';
const g217ReplayDocuments = g217Documents([...earmuffChecks, ['箱底喷码', g217ExpectedCode]]);

const clear = { kind: 'clear', appearance: 'classic', front: '视窗平整，转一个角度也看不到裂纹或划伤。', back: '两侧插片完整。扣上后轻拉，没有脱开。' };
const shield = { kind: 'clear', appearance: 'shield', front: '弧形透明面屏的视野内没有划伤，前缘完整。', back: '沿内侧接缝检查，面屏与头带固定座贴合，连接点没有开裂。' };
const glove = { kind: 'clear', appearance: 'glove', front: '掌面覆层平整，指尖没有起皮或破口。', back: '背面的缝线连续，织布腕口边缘收得齐整。' };
const earmuff = { kind: 'clear', appearance: 'earmuff', front: '双侧耳罩壳体完整，头带可以顺畅调节。', back: '两圈软垫都贴着壳沿，没有明显凹陷或脱开。' };

export const TUTORIAL = [
  { target: 'label', title: '先认箱', line: '点开箱签，找批号。' },
  { target: 'report', title: '对批号', line: '把报告放在箱签旁，对一对两边的批号。' },
  {
    target: 'order', title: '核对签发和项目', line: '点报告上的「已签发」。',
    reportLine: '翻到检验报告，找签发栏。',
    orderLine: '把送检联放在报告旁，对照外观和扣合两项。',
  },
  {
    target: 'sample', title: '动手检查', line: '对照外观和扣合两项，再拿起检样。',
    frontLine: '看看镜片有没有裂痕，然后翻面。',
    claspLine: '按合背面的扣件。',
    tugLine: '轻拉一下，看看扣件会不会松。',
  },
  { target: 'pass', title: '把单交出去', line: '盖「通过」，把单交给小罗。', sampleLine: '镜片没有裂痕，扣件也没松。' },
];

export const FILM_TUTORIAL = '点一下膜角，或往右上拉，看看白痕跟着哪一层。';

export const G205_SUPPLEMENT_REQUEST = {
  shown: '就这两张，报告没夹进来。你开审查，我拿补件联去趟实验室。',
  receipt: '我带补件联去趟实验室，签好的那份我先送窗口。',
  delivery: '周二那张补件联我带去了，这一箱我先推过来。',
};

export const PRESSURE = [
  {
    slots: [5, 16], line: '这车赶得上，周五我找人替你。',
    shown: {
      intake: '箱签和送检联我点过了。那份报告我去催。',
      projects: '两张我都看了。写了哪些项目，你照纸上记。',
      relabel: '你指的两个号我看到了。照纸上记，我去和装货台说一声。',
      sample: '我看过你记的检样了。车那边我去说。',
      paper: '那一栏我看见了。你开单，我拿过去。',
    },
  },
  {
    slots: [10, 20], line: '压这批也行。主任问起来，我就递你签的单。',
    shown: {
      intake: '这几张我看过了。实收照你点的留底。',
      projects: '送检联和报告我都看了。照纸上记，你继续开单。',
      relabel: '登记和这张单我都看了。两个号照原样留底。',
      sample: '检样这一条我看到了。你按手里的记录开单。',
      paper: '那一栏我看到了。把它留在记录里，你开单吧。',
    },
  },
];

export const PHONE = {
  '204': {
    npc: 'chen',
    greeting: '实验室，小陈。把单据放到电话旁，我按批号或报告号查。',
    requests: {
      5: {
        followupId: 9,
        requested: '二零五，我在送件簿上记一笔。签好就送窗口，签字以纸联为准。',
        repeat: '二零五已经记了。签好会给你送纸，不用再登一遍。',
        arrived: '二零五的 R-065 已经递到窗口了。你翻那张耳罩检验报告。',
        delivery: '小陈说你电话里问过这张。',
      },
      10: {
        followupId: 14,
        requested: 'R-079 是外观报告。二四八的耐冲击我另记一笔，签了就送纸联。',
        repeat: '二四八的耐冲击记过了。签好的纸还没递到窗口，你等那张。',
        arrived: '二四八的耐冲击结果已经送下去了。找 R-084 那张复检报告。',
        delivery: '这张耐冲击结果，就是电话里问的。',
      },
    },
    archiveHint: '这批已经换过报告。拿作废随货联上的原报告号去交接簿查查，找到别的随货联，也放到电话旁。',
    relatedHint: '我先记下这张随货联。你拿上面的报告号去交接簿查查，找到别的随货联，也放到电话旁。',
    retestHint: '这张是二四八的 R-084，本批复检用的。要问旧联，把写着「原报告编号」的作废随货联放到电话旁。',
    inquiry: '另一张也是 R-071？你等我翻翻原本。',
    found: '找到了。原件只测过试样 S-019。二四八已经有新结果，二四一要另查。我把签的那页带下来。',
    delivery: '你看样品来源那一栏。我能证明的是这一页，你把它夹在二四一随货联后面。',
    received: '原件已经送到了。你从交接簿翻出那一页，核对一下样品来源。',
    evidence: archive('R-071 实验室原件', [['报告编号', 'R-071'], ['样品来源', '试样 S-019'], ['检验范围', '仅限试样'], ['签发', '陈敏']], '本页为实验室留底。'),
  },
  '107': {
    npc: 'sun',
    greeting: '夜班窗口。把你要查的单据放到电话旁，我照手上的登记查。',
    found: '周二晚上唐禾来问过。我退了那份批号不对的单。',
    delivery: '给你，周二夜班那份。时间写在右边，我签过了。',
    received: '存根已经送到了。你从交接簿翻出来，时间和签收人都在上面。',
    evidence: archive('夜班退单存根', [['批号', 'G-211'], ['经手人', '唐禾'], ['退单缘由', '换签登记未对应来箱'], ['记录时间', '周二 22:18'], ['签收人', '孙姐']]),
  },
  '880': {
    npc: 'zhou',
    greeting: '听筒里响了一声短音。',
    found: '听见响就合格。别拍话筒，拍坏了也得开单。',
  },
};

export function documentExtension(field) {
  if (field?.[0] !== '经手窗口') return null;
  const number = /^内线\s+(\d{3})$/.exec(field[1])?.[1];
  return PHONE[number] ? number : null;
}

export const INCOMING_CALLS = {
  'lab-close': {
    number: '204', npc: PHONE['204'].npc,
    lines: ['今天晚交的那几份，明早一起送。', '你要问哪一份，把号留在回执上就好。'],
  },
  ringback: { number: '880', npc: PHONE['880'].npc, lines: [PHONE['880'].found] },
};

export const SHIPMENT_ACCEPTANCE = {
  title: '到货验收联',
  delivery: (batch) => `这张是先前 ${batch} 的。收货方签过了，夹回那批旧单。`,
  receiver: '收货方仓库 · 验收岗',
  result: '已签收，验收通过',
};

export const SHIPMENT_EXCEPTION = {
  title: '到货复核联',
  delivery: (batch) => `收货方把 ${batch} 留在待验区了。这张复核联你夹回原单，交班时一起看。`,
  receiver: '收货方仓库 · 验收岗',
  result: '暂缓入库，等待厂方回复',
};

export const HANDOFF = {
  normal: { title: '周五交班', line: '老周把交接单翻到最后一页。「该留下一班的都在这儿。行，你下班吧。」', stamp: '本周交班完成' },
  investigation: { title: '第二张复检单', line: '老周把两份原件摊在交接板上，圈住二四一。「这批单独复检。货在哪儿，按交接回执办。」', stamp: 'G-241 追加复检' },
  escaped: { title: '车已经走了', line: '电话又响了一声。老周用手背按住要卷起来的回执。「你把那箱的号再说一遍。」', stamp: '待接收方确认' },
};

export const EASTER_EGGS = {
  cat: {
    slots: [3, 15],
    documents: { 3: 2, 15: 1 },
    title: '巡检临时工牌',
    fields: [['岗位', '巡检'], ['工作范围', '晒太阳']],
    returnLine: '因在岗睡觉，调夜班。',
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
    outro: '小罗「今天的回执都在这儿。」',
    cases: [
      {
        id: 1, batch: 'G-201', npc: 'luo', title: '小罗的第一箱',
        line: '二零一，单都在这儿。那张出门联给我就行。',
        answer: 'pass', reason: '实物与材料齐全', receiptAside: '下一批就在门外。',
        documents: standard('G-201', 'R-061'), sample: clear,
      },
      {
        id: 2, batch: 'G-202', npc: 'tang', title: '灯下那道白痕',
        line: '我在灯下看到一条白的。要不我先拿回去？',
        answer: 'pass', reason: '白痕随保护膜脱离',
        documents: standard('G-202', 'R-062'),
        sample: {
          ...clear, kind: 'film', front: '视窗上有一道斜过来的白痕。膜角还没有粘紧。',
          afterFilm: '白痕随薄膜掀起。下方的镜片平整。',
        },
      },
      {
        id: 3, batch: 'G-203', npc: 'xu', title: '老模子的细线',
        line: '耳罩外壳这条线每次都有人问。你拿夹板上的图对一对。',
        answer: 'pass', reason: '细线与允许的合模线相符',
        documents: [
          label('G-203', [], '防噪耳罩'), report('G-203', 'R-063', earmuffReport),
          { ...archive('耳罩外壳工艺示意', [['图号', 'WX-3'], ['合模线允许位置', '耳杯外壳下沿'], ['目视限制', '不得贯穿壳体或延伸到软垫']], '逆着这张纸看，夹板背面还压了东西。'), kind: 'mold-sketch' },
        ],
        sample: { kind: 'line', appearance: 'earmuff', front: '耳杯外壳下沿有一道细线，边缘很整齐。', back: '细线沿外壳收住，内侧壳体没有裂口，软垫也完整。' },
        variants: [
          {},
          { answer: 'fail', reason: '裂纹跨过外壳与软垫的接缝', sample: {
            earCupSplit: true,
            front: '耳杯下沿有一道细线，靠近外壳和软垫的接缝时转向内侧。',
            back: '沿内侧看，那道线越过外壳边缘，在软垫边上也能看到一截。',
          } },
        ],
      },
      {
        id: 4, batch: 'G-204', npc: 'zhou', title: '最后一趟车',
        line: '今天这趟还剩一个位子。你先看，有问题我让车等。',
        answer: 'fail', reason: '镜片内侧有分叉裂纹',
        documents: standard('G-204', 'R-064'),
        sample: {
          ...clear, kind: 'crack', front: '一道分叉白纹伸进镜片中间。',
          afterFilm: '膜角已经掀起，分叉白纹还留在镜片上。',
        },
      },
    ],
  },
  {
    title: '周二', subtitle: '装货台在等回单',
    intro: '小罗在窗下压了一张内线表。「缺报告找 204，小陈。」',
    cases: [
      {
        id: 5, batch: 'G-205', npc: 'luo', title: '少来了一张报告',
        line: '二零五，先看这摞。装货台还等着回单。',
        answer: 'review', reason: '未随货提供本批检验报告', receiptAside: '拿到报告我再来一趟。',
        documents: [label('G-205', [], '防噪耳罩'), order('G-205', earmuffChecks)], sample: earmuff,
      },
      {
        id: 6, batch: 'G-206', npc: 'tang', title: '换过一只纸箱',
        line: '外箱昨晚淋湿了，换了干箱子。旧签还夹在登记上。',
        answer: 'pass', reason: '换签登记对应本箱',
        documents: g206Documents('G-106'), sample: glove,
        variants: [
          {},
          { answer: 'review', reason: '报告批号 G-160 与换签登记的原箱 G-106 不符', documents: g206Documents('G-160') },
        ],
      },
      {
        id: 7, batch: 'G-241', npc: 'luo', title: '横折过的随货联',
        line: '二四一。补印那张给你夹好了，几箱一趟走，我去喊车。',
        answer: 'pass', reason: '随货核验联与实物一致', receiptAside: '这联折过，有点翘。我先压平。',
        documents: [label('G-241', [], '防护面屏'), report('G-241', 'R-071', shieldReport, '随货核验联', '横折痕很浅，没有盖住签发栏。'), order('G-241', [['发货区', '二号装货台'], ['检验项目', '外观、耐冲击']])], sample: shield,
      },
      {
        id: 8, batch: 'G-208', npc: 'xu', title: '框里一行刻字',
        line: '外箱是 A。框里头有一行小字，你帮我对一下。',
        answer: 'pass', reason: '框内为发货指定型号 A',
        documents: [label('G-208', [['型号', 'A']]), report('G-208', 'R-072', [visual, clasp, ['型号', 'A'], seal]), order('G-208', [['指定型号', 'A'], ['接口要求', 'A 型卡口']])],
        sample: { kind: 'clear', appearance: 'vented', front: '视窗无伤。接口型号刻在框的内侧。', back: '内框刻字：型号 A。', model: 'A' },
        variants: [
          {},
          { answer: 'fail', reason: '检样刻字 B，发货要求 A', sample: { kind: 'wrongModel', back: '内框刻字：型号 B。', model: 'B' } },
        ],
      },
    ],
  },
  {
    title: '周三', subtitle: '有些东西会回来',
    intro: '卷帘刚拉过半，黄线那头就有人把昨天的箱子挪了回来。',
    outro: '小唐「笔我拿走了。登记原件明早带来。」',
    cases: [
      {
        id: 9, batch: 'G-205', npc: 'luo', title: '送到窗口的二零五报告',
        line: '昨天等的那份送到了。你对一下签发栏。',
        answer: 'pass', reason: '本批已签发报告齐全，检样合格',
        documents: [label('G-205', [], '防噪耳罩'), report('G-205', 'R-065', [...earmuffReport, ['签发时间', '周三 08:06']], '耳罩检验报告'), order('G-205', earmuffChecks)], sample: earmuff,
        followUp: { caseId: 5, sameLot: true, lines: { pass: '车那边还收着回单。昨天缺的报告刚领到，你帮我核一下。', fail: '二零五从退件区搬回来了。实验室报告也拿到了。', review: '昨天等的那份送到了。那箱耳罩还在黄线里，你对一下。' } },
      },
      {
        id: 10, batch: 'G-248', npc: 'zhou', title: '等着上车的二四八',
        line: '二四八这张签过了。装车那边在等。',
        answer: 'review', reason: '缺少本批耐冲击结果', receiptAside: '实验室那份，我明早去问。',
        documents: [label('G-248', [], '防护面屏'), report('G-248', 'R-079', [visual, seal], '外观抽检报告'), order('G-248', [['必查项目', '外观、耐冲击'], ['随货要求', '附本批实验室耐冲击结果']])], sample: shield,
      },
      {
        id: 11, batch: 'G-211', npc: 'tang', title: '记录差了一行',
        line: '还是昨晚那一摞。这个我对过，应该一样。',
        answer: 'review', reason: '登记的新签号不是本箱', receiptAside: '这摞单昨晚也送来过。我问了两个人，都叫我先送来看看。',
        documents: [label('G-211', [], '作业防护手套'), report('G-111', 'R-081', gloveReport), archive('换签登记', [['原箱批号', 'G-111'], ['现箱批号', 'G-216'], ['夜班退单', '请核对实物对应批号'], ['经手窗口', '内线 107']], '右下是前一晚的退单章。')], sample: glove,
      },
      {
        id: 12, batch: 'G-212', npc: 'xu', title: '响了一声的卡扣',
        line: '这批扣子偏紧。压到头的时候响一声，你听听。',
        answer: 'pass', reason: '扣合后轻拉保持闭合',
        documents: [label('G-212'), report('G-212', 'R-083'), order('G-212', [['检验项目', '外观、扣合'], ['扣合要求', '按合后轻拉，扣件不得脱开']])],
        sample: { kind: 'clear', appearance: 'compact', front: '镜片无伤，卡扣放开时张得比较大。', back: '按紧有一声咔哒。再轻拉，扣件仍然闭合。' },
        variants: [
          {},
          { answer: 'fail', reason: '卡扣发声后轻拉脱开', sample: { kind: 'loose', appearance: 'compact', front: '镜片无伤，卡扣放开时张得比较大。', back: '按紧有一声咔哒。再轻拉，扣件一下弹了开。' } },
        ],
      },
    ],
  },
  {
    title: '周四', subtitle: '一张新的，一张旧的',
    intro: '窗角贴着一张纸，「周五交班，改章请在原回执旁另开一联。」',
    outro: '老周「明天改章另开一联，旧单留在后头。」',
    cases: [
      {
        id: 13, batch: 'G-211', npc: 'tang', title: '换签登记的原件',
        line: '这次是原件。我自己顺着出货栏对了一遍。',
        answer: 'pass', reason: '原件显示 G-111 更为 G-211', receiptAside: '昨天那张我也留一份，省得下个班再找。',
        documents: [label('G-211', [], '作业防护手套'), report('G-111', 'R-081', gloveReport), archive('换签原件', [['原箱批号', 'G-111'], ['现箱批号', 'G-211'], ['签发人', '库管二班'], ['签发时间', '周四 07:48'], seal])], sample: glove,
        followUp: { caseId: 11, sameLot: true, lines: { pass: '我重对过出货栏，这是原件，你再把它夹在昨天那一联旁边。', fail: '不是返工出来的。昨晚重新找了原签，这回我带在最上面。', review: '这次是原件。我自己顺着出货栏对了一遍。' } },
        nightResponse: '孙姐也给我留了那晚的回执。',
      },
      {
        id: 14, batch: 'G-248', npc: 'luo', title: '夹回来的作废联',
        line: '二四八，这回结果签了。实验室把那张作废随货联也夹来了。',
        answer: 'pass', reason: 'R-084 补齐了本批耐冲击结果',
        documents: [label('G-248', [], '防护面屏'), report('G-248', 'R-084', shieldReport, '本批复检报告'), archive('作废随货联', [['批号', 'G-248'], ['原报告编号', 'R-071'], ['状态', '已撤回'], ['复检通知', '改用 R-084']], '原随货联仅留档。')], sample: shield,
        followUp: { caseId: 10, sameLot: true, lines: { pass: '二四八的留样和补检回执。上一车那批也记在这张新报告上。', fail: '返送的二四八在这儿。这次实验室把结果签完了。', review: '黄线里面那箱二四八，这回结果签了。实验室把作废联也夹来了。' } },
      },
      {
        id: 15, batch: 'G-204', npc: 'xu', title: '修好的镜片',
        line: '二零四换了镜片。头一天那道缝，从边上就看得出来。',
        answer: 'fail', reason: '扣件插片折断',
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
        answer: 'pass', reason: '泛黄在外包，实物正常',
        documents: [label('G-216', [], '作业防护手套'), report('G-112', 'R-086', gloveReport), archive('本箱换签登记', [['原箱批号', 'G-112'], ['现箱批号', 'G-216'], seal], '背面夹着一张作废单，像是顺手写的借伞条。')],
        sample: { kind: 'yellow', appearance: 'glove', front: '外层包装袋泛黄，开口能看到手套的织布腕口。', unwrapped: '取出后，手套织物与掌面覆层的颜色均匀，泛黄留在包装袋上。', back: '翻过手套，背面的缝线连续，织布腕口没有松脱。' },
        variants: [
          {},
          {
            answer: 'fail', reason: '腕口背侧接缝脱线开口',
            sample: { cuffSplit: true, back: '翻过手套，腕口背侧有几针脱线，织布边缘张开了一小段。' },
          },
        ],
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
        answer: 'review', reason: '箱与本批报告无法对应',
        documents: g217Documents(), sample: earmuff, carton: { code: null },
        variants: [
          {},
          {
            answer: 'pass', reason: '箱底喷码 C-217-03 与送检联登记一致',
            documents: g217ReplayDocuments, carton: { code: g217ExpectedCode },
          },
          {
            answer: 'review', reason: '箱底喷码 C-271-03 与送检联登记 C-217-03 不符',
            documents: g217ReplayDocuments, carton: { code: 'C-271-03' },
          },
        ],
      },
      {
        id: 18, batch: 'G-218', npc: 'xu', title: '卡扣插片的厚度',
        line: '这盒颜色跟昨天的一样。你量一下这个地方。',
        answer: 'fail', reason: '实测 1.80 mm，低于 2.00 mm',
        documents: [label('G-218', [], '卡扣插片'), report('G-218', 'R-088', [['厚度', '2.10 mm'], seal]), order('G-218', [['检查部位', '卡扣插片'], ['厚度范围', '2.00–2.20 mm']])],
        sample: { kind: 'thin', appearance: 'clip', front: '一枚灰色插片。厚薄需要放进量规确认。', back: '插片两端平整，中间的平面可以贴住量规。', reading: '1.80 mm' },
        variants: [
          {},
          { answer: 'pass', reason: '实测 2.10 mm，在 2.00–2.20 mm 范围内', sample: { reading: '2.10 mm' } },
        ],
      },
      {
        id: 19, batch: 'G-219', npc: 'tang', title: '小唐自己对过的单',
        line: '这回我把旧签带着。红夹子也换下来了。',
        answer: 'pass', reason: '旧签、换签登记和现箱一致', receiptAside: '旧签和登记我还是夹在一起，找的时候省事。',
        documents: [label('G-219', [], '作业防护手套'), report('G-119', 'R-089', gloveReport), archive('换签登记', [['原箱批号', 'G-119'], ['现箱批号', 'G-219'], ['随附', 'G-119 原箱签'], seal])], sample: glove,
        nightResponse: '孙姐的回执我也留了一份。以后谁先接、谁退回，顺着这摞都能找着。',
      },
      {
        id: 20, batch: 'G-220', npc: 'zhou', title: '交班前的最后一箱',
        line: '最后一箱。装车的人在外头等回单。',
        answer: 'pass', reason: '本批实物与全部材料吻合', receiptAside: '交班时把板给我，我再核一遍。',
        documents: [label('G-220', [], '防噪耳罩'), report('G-220', 'R-090', earmuffReport), order('G-220', earmuffChecks)], sample: earmuff,
      },
    ],
  },
];

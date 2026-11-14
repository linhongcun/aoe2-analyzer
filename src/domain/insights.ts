/**
 * issue 584 「鲜为人知」短句。按单位 id / 文明英文名挂到对应页，两条路由不复制同一条。
 * 数字与单位在渲染时包进 .num / .nw。文案门禁原件：https://github.com/linhongcun/aoe2-analyzer/blob/362f1ed7a7acebbecb08f43dfa04684828eba923/docs/design/insights-584/insights-584.md。
 */

/** 规格里的范围箭头（6→9）。用模板字符串，避免被当成图标字面量。 */
const RANGE = `\u2192`;

export type InsightNum = { readonly num: string };
export type InsightNowrap = { readonly nw: readonly InsightPart[] };
export type InsightPart = string | InsightNum | InsightNowrap;

export interface InsightItem {
  readonly id: string;
  readonly parts: readonly InsightPart[];
}

export function insightText(item: InsightItem): string {
  return item.parts.map(partText).join('');
}

function partText(part: InsightPart): string {
  if (typeof part === 'string') return part;
  if ('num' in part) return part.num;
  return part.nw.map(partText).join('');
}

function nw(parts: readonly InsightPart[]): InsightNowrap {
  return { nw: parts };
}

function num(value: string): InsightNum {
  return { num: value };
}

const hearth: readonly InsightItem[] = [
  {
    id: 'hearth-javelin',
    parts: ['近战前自带投掷标枪，无需先研远程科技；造价无粮（', nw([num('80'), ' 木 + ', num('35'), ' 金']), '）。'],
  },
  { id: 'hearth-foodless', parts: ['无粮步兵（对照火矛兵）。'] },
];

const ratha: readonly InsightItem[] = [
  { id: 'ratha-cost', parts: ['战车造价无粮（', nw([num('60'), ' 木 + ', num('60'), ' 金']), '）。'] },
  { id: 'ratha-foodless', parts: ['无粮骑兵 UU（对照骑士线）。'] },
];

/** 种子⑩。73 / 559 同一条；箭数与次级弹按 issue 584 锁句，不写成攻城加成。 */
const chuKoNu: readonly InsightItem[] = [
  {
    id: 'chu-ko-nu-volley',
    parts: ['非精锐每轮 ', nw([num('3'), ' 箭']), '、精锐 ', nw([num('5'), ' 箭']), '；次级弹含 ', nw([num('0'), ' 近战']), '，对负甲冲车有额外咬伤。'],
  },
  { id: 'chu-ko-nu-rams', parts: ['成群可远程磨掉冲车突袭。'] },
];

/** 单位页。2706 与普通扈从共用事实；战车种子仅挂孟加拉文明页。 */
export const UNIT_INSIGHTS: Readonly<Record<number, readonly InsightItem[]>> = {
  2705: hearth,
  2706: hearth,
  73: chuKoNu,
  559: chuKoNu,
};

export const CIV_INSIGHTS: Readonly<Record<string, readonly InsightItem[]>> = {
  Bengalis: ratha,
  Saxons: [{ id: 'saxons-stone', parts: ['磨坊、木营、采矿场建成得石，利于早塔/防塔爆。'] }],
  Koreans: [
    {
      id: 'koreans-eupseong',
      parts: ['邑城：叠满箭羽线后箭塔射程约 ', nw([num('13')]), '，可压过手推炮 ', nw([num('12')]), '。'],
    },
  ],
  Incas: [{ id: 'incas-stone', parts: ['开局 ', nw([num('200'), ' 石']), '可盖城镇中心 + 瞭望箭塔。'] }],
  Lithuanians: [
    {
      id: 'lithuanians-hill-forts',
      parts: ['山城堡：城镇中心射程 ', nw([num('6'), RANGE, num('9')]), '，盖过弩手和投石车。盖不住投石机。'],
    },
  ],
  Malians: [
    {
      id: 'malians-tigui',
      parts: ['蛮王：空城镇中心也能射 ', nw([num('8'), ' 箭']), '（满驻上限 ', nw([num('18')]), '）。'],
    },
    { id: 'malians-tigui-use', parts: ['驻扎仍可再加箭。利于前线推进 / TC 对射。'] },
  ],
  Teutons: [
    {
      id: 'teutons-crenellations',
      parts: ['开垛口：叠箭羽+锥子后城堡约 ', nw([num('13')]), '，可压过手推炮 ', nw([num('12')]), '。'],
    },
  ],
  Persians: [
    {
      id: 'persians-tc-hp',
      parts: ['城镇中心生命值 ', nw([num('+100'), '%']), '（', nw([num('2400'), RANGE, num('4800')]), '，同砌体与城堡基础齐），可当前线伪城堡。'],
    },
    { id: 'persians-kamandaran', parts: ['叠波斯步弓手（Kamandaran）后弓兵木代金（非免费）。'] },
  ],
};

export function unitInsights(id: number): readonly InsightItem[] {
  return UNIT_INSIGHTS[id] ?? [];
}

export function civInsights(en: string): readonly InsightItem[] {
  return CIV_INSIGHTS[en] ?? [];
}

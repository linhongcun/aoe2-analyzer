/**
 * issue 757：竞技场不安排村民挖金、直接点城堡的黄金收支。
 * 数字从固定数据包 eco.json 读出。标准开局黄金不在文明资源向量里，见设计说明。
 * 瓦兰吉资源 298 的原始字段不在这里公布：玩法比例缺少可核的函数体。
 */
import ecoRaw from '../../data/raw/eco';

export const ARENA_CASTLE_CIVS = ['Muisca', 'Ethiopians', 'Varangians'] as const;
export type ArenaCastleCiv = (typeof ARENA_CASTLE_CIVS)[number];

/** 本站开局模型的标准资源黄金。188329 文明资源向量该项为 0，数据包没有另写这笔库存。 */
export const STANDARD_START_GOLD = 100;
export const ARENA_CASTLE_GOLD_CHECKED = '2026-11-07';

const LOOM = '22';
const FEUDAL = '101';
const CASTLE = '102';
const MUISCA_DISCOUNT = 1367;
const ETHIOPIAN_FEUDAL = 587;
const ETHIOPIAN_CASTLE = 588;
const ETHIOPIAN_IMPERIAL = 589;
const ETHIOPIAN_SPECIAL_START = 871;
const FEUDAL_AGE_START = 298;
const VARANGIAN_GOLD = 1475;
const AGE_UP = [101, 102, 103];

export const OFFICIAL_AGE_HREF = 'https://www.ageofempires.com/learn-to-play/advancing-aoe2/';
export const OFFICIAL_VARANGIAN_HREF = 'https://www.ageofempires.com/news/varangians-civilization-deep-dive/';

type Part = { readonly kind: 'text'; readonly text: string } | { readonly kind: 'num'; readonly text: string };
type Chunk = { readonly kind: 'text'; readonly text: string } | { readonly kind: 'nw'; readonly parts: readonly Part[] };

export interface ArenaGoldLine {
  readonly id: string;
  readonly label: string;
  readonly parts: readonly Chunk[];
  readonly pending?: boolean;
}

export interface ArenaGoldNote {
  readonly id: string;
  readonly text: string;
}

export interface ArenaGoldLink {
  readonly id: string;
  readonly href: string;
  readonly label: string;
  readonly external?: boolean;
}

export interface ArenaCastleGold {
  readonly civ: ArenaCastleCiv;
  readonly title: '竞技场黄金收支';
  readonly summary: string;
  readonly lines: readonly ArenaGoldLine[];
  readonly notes: readonly ArenaGoldNote[];
  readonly links: readonly ArenaGoldLink[];
}

interface Effect {
  kind?: unknown;
  op?: unknown;
  res?: unknown;
  tech?: unknown;
  v?: unknown;
}

interface Row {
  source?: unknown;
  tech?: unknown;
  age?: unknown;
  requires?: unknown;
  effects?: unknown;
}

interface TechCost {
  Food?: unknown;
  Gold?: unknown;
}

interface EcoTech {
  en?: unknown;
  cost?: TechCost;
}

export interface ArenaEco {
  meta?: { patch?: unknown };
  techs?: Record<string, EcoTech | undefined>;
  civEco?: Record<string, unknown>;
}

const nw = (...parts: readonly Part[]): Chunk => ({ kind: 'nw', parts });
const words = (text: string): Chunk => ({ kind: 'text', text });
const num = (value: number, unit: string): Chunk => nw({ kind: 'num', text: String(value) }, { kind: 'text', text: ` ${unit}` });
const foodGold = (food: number, gold: number): readonly Chunk[] => [num(food, '食物'), words(' + '), num(gold, '黄金')];

function integer(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function positive(value: unknown): number | null {
  const amount = integer(value);
  return amount != null && amount > 0 ? amount : null;
}

function effectsOf(row: Row): Effect[] | null {
  if (!Array.isArray(row.effects) || !row.effects.every((item) => item !== null && typeof item === 'object')) return null;
  return row.effects as Effect[];
}

function rowsOf(eco: ArenaEco, civ: string): Row[] | null {
  const rows = eco.civEco?.[civ];
  if (!Array.isArray(rows) || !rows.every((item) => item !== null && typeof item === 'object')) return null;
  return rows as Row[];
}

function oneRow(rows: readonly Row[], tech: number): Row | null {
  const found = rows.filter((row) => row.source === 'bonus' && row.tech === tech);
  return found.length === 1 ? found[0]! : null;
}

function requiresOnly(row: Row, tech: number): boolean {
  return Array.isArray(row.requires) && row.requires.length === 1 && row.requires[0] === tech;
}

function costOf(eco: ArenaEco, id: string): { food: number; gold: number } | null {
  const tech = eco.techs?.[id];
  const cost = tech?.cost;
  if (!cost) return null;
  const keys = Object.keys(cost);
  if (keys.some((key) => key !== 'Food' && key !== 'Gold')) return null;
  const food = integer(cost.Food ?? 0);
  const gold = integer(cost.Gold ?? 0);
  if (food == null || gold == null) return null;
  return { food, gold };
}

function grant(row: Row): { food: number; gold: number } | null {
  const effects = effectsOf(row);
  if (!effects || effects.length !== 2) return null;
  const food = effects.find((effect) => effect.kind === 'res' && effect.res === 0 && effect.op === 'add');
  const gold = effects.find((effect) => effect.kind === 'res' && effect.res === 3 && effect.op === 'add');
  if (!food || !gold) return null;
  const foodAmount = positive(food.v);
  const goldAmount = positive(gold.v);
  if (foodAmount == null || goldAmount == null) return null;
  return { food: foodAmount, gold: goldAmount };
}

function muiscaFactor(rows: readonly Row[]): number | null {
  const row = oneRow(rows, MUISCA_DISCOUNT);
  const effects = row ? effectsOf(row) : null;
  if (!row || !effects || effects.length !== 3) return null;
  const techs = new Set<number>();
  for (const effect of effects) {
    if (effect.kind !== 'techCost' || effect.op !== 'mul' || effect.res !== 'Gold' || effect.v !== 0.5 || typeof effect.tech !== 'number') return null;
    techs.add(effect.tech);
  }
  if (techs.size !== AGE_UP.length || AGE_UP.some((tech) => !techs.has(tech))) return null;
  return 0.5;
}

function ageGrant(rows: readonly Row[], tech: number, age: number, requires: number): { food: number; gold: number } | null {
  const row = oneRow(rows, tech);
  if (!row || row.age !== age || !requiresOnly(row, requires)) return null;
  return grant(row);
}

function varangianMarker(rows: readonly Row[]): boolean {
  const row = oneRow(rows, VARANGIAN_GOLD);
  const effects = row ? effectsOf(row) : null;
  if (!row || row.age !== 1 || !Array.isArray(row.requires) || row.requires.length !== 0 || !effects || effects.length !== 2) return false;
  const marker = effects.some((effect) => effect.kind === 'res' && effect.res === 33 && effect.op === 'set' && effect.v === 34);
  const field = effects.some(
    (effect) => effect.kind === 'res' && effect.res === 298 && effect.op === 'set' && typeof effect.v === 'number' && Number.isFinite(effect.v) && effect.v > 0,
  );
  return marker && field;
}

function patchOf(eco: ArenaEco): string | null {
  const patch = eco.meta?.patch;
  return typeof patch === 'string' && patch.trim() ? patch : null;
}

const gap = (have: number, need: number) => Math.max(0, need - have);

function shared(castle: { food: number; gold: number }, loomGold: number): { lines: ArenaGoldLine[]; notes: ArenaGoldNote[]; links: ArenaGoldLink[] } {
  return {
    lines: [
      { id: 'start', label: '开局黄金', parts: [num(STANDARD_START_GOLD, '黄金')] },
      { id: 'castle', label: '城堡费用', parts: foodGold(castle.food, castle.gold) },
      { id: 'loom', label: '织布', parts: [num(loomGold, '黄金')] },
    ],
    notes: [
      { id: 'premise', text: '前提是标准资源，没有市场买卖、队友进贡，也没有织布以外的黄金支出。先织布或其他花金，上面的差额会变。' },
      {
        id: 'boundary',
        text: '不安排村民挖金，不等于没有黄金收入。食物和升城堡的建筑条件仍要另满足。这里不写固定人数和时间，不是已实测的完整直城流程，也不表示一定成功。',
      },
    ],
    links: [
      { id: 'castle-tech', href: `/tech/${CASTLE}`, label: '城堡时代' },
      { id: 'loom-tech', href: `/tech/${LOOM}`, label: '织布机' },
      { id: 'official-age', href: OFFICIAL_AGE_HREF, label: '官方升时代说明', external: true },
    ],
  };
}

function stamp(patch: string): ArenaGoldLine[] {
  return [
    { id: 'checked', label: '核对日', parts: [nw({ kind: 'text', text: ARENA_CASTLE_GOLD_CHECKED })] },
    { id: 'patch', label: '数据版本', parts: [nw({ kind: 'text', text: patch })] },
  ];
}

function sourceNote(extra: string): ArenaGoldNote {
  return {
    id: 'source',
    text: `城堡费用、织布、折扣和到账数量读自这份固定数据包。上表开局黄金沿用本站标准资源模型；文明资源向量没有另记这笔起始黄金。${extra}`,
  };
}

function balance(id: string, label: string, have: number, need: number): ArenaGoldLine {
  const short = gap(have, need);
  return {
    id,
    label,
    parts:
      short === 0
        ? [words('手头 '), num(have, '黄金'), words('，差额 '), num(0, '黄金')]
        : [words('手头 '), num(have, '黄金'), words('，还差 '), num(short, '黄金')],
  };
}

export function arenaCastleGold(civ: string, eco: ArenaEco = ecoRaw as ArenaEco): ArenaCastleGold | null {
  if (!ARENA_CASTLE_CIVS.includes(civ as ArenaCastleCiv)) return null;
  const patch = patchOf(eco);
  const rows = rowsOf(eco, civ);
  const feudal = costOf(eco, FEUDAL);
  const castle = costOf(eco, CASTLE);
  const loom = costOf(eco, LOOM);
  if (!patch || !rows || !feudal || !castle || !loom) return null;
  if (feudal.gold !== 0 || feudal.food <= 0 || castle.food <= 0 || castle.gold <= 0 || loom.food !== 0 || loom.gold <= 0) return null;
  const base = shared(castle, loom.gold);
  const summary = '说明标准资源下、不安排村民挖金时，点城堡前的黄金够不够。';

  if (civ === 'Muisca') {
    const factor = muiscaFactor(rows);
    if (factor == null) return null;
    const click = castle.gold * factor;
    if (!Number.isInteger(click) || STANDARD_START_GOLD < loom.gold) return null;
    return {
      civ,
      title: '竞技场黄金收支',
      summary,
      lines: [
        ...base.lines,
        { id: 'click', label: '点城堡黄金', parts: [num(click, '黄金')] },
        balance('plain', '不织布', STANDARD_START_GOLD, click),
        balance('loom-first', '先织布', STANDARD_START_GOLD - loom.gold, click),
        ...stamp(patch),
      ],
      notes: [
        ...base.notes,
        { id: 'discount', text: '折扣只减少升级时代的黄金，食物不减。升封建不花黄金，所以不改变点封建要付的黄金。' },
        sourceNote('官方升时代说明列出城堡的食物和黄金，没有印出开局库存。'),
      ],
      links: base.links,
    };
  }

  if (civ === 'Ethiopians') {
    const feudalGrant = ageGrant(rows, ETHIOPIAN_FEUDAL, 2, 101);
    const castleGrant = ageGrant(rows, ETHIOPIAN_CASTLE, 3, 102);
    const imperialGrant = ageGrant(rows, ETHIOPIAN_IMPERIAL, 4, 103);
    const special = oneRow(rows, ETHIOPIAN_SPECIAL_START);
    if (!feudalGrant || !castleGrant || !imperialGrant || !special || special.age !== 1 || !requiresOnly(special, FEUDAL_AGE_START) || !grant(special))
      return null;
    const onHand = STANDARD_START_GOLD + feudalGrant.gold;
    if (onHand < loom.gold) return null;
    return {
      civ,
      title: '竞技场黄金收支',
      summary,
      lines: [
        ...base.lines,
        { id: 'feudal-grant', label: '到达封建入账', parts: foodGold(feudalGrant.food, feudalGrant.gold) },
        balance('plain', '不织布', onHand, castle.gold),
        balance('loom-first', '先织布', onHand - loom.gold, castle.gold),
        { id: 'castle-grant', label: '到达城堡再入账', parts: foodGold(castleGrant.food, castleGrant.gold) },
        ...stamp(patch),
      ],
      notes: [
        ...base.notes,
        {
          id: 'timing',
          text: '到达封建的食物和黄金，在封建研究完成之后、点城堡之前到手。到达城堡再给的食物和黄金，要等城堡研究完成才到账，不能支付点击城堡的费用。',
        },
        { id: 'special-start', text: '从封建或更后的时代开局时另有对应到账，不计入这条标准黑暗开局。' },
        sourceNote('官方升时代说明列出城堡的食物和黄金，没有印出开局库存，也没有写奖励的到账时点。'),
      ],
      links: base.links,
    };
  }

  if (!varangianMarker(rows) || STANDARD_START_GOLD < loom.gold) return null;
  return {
    civ: 'Varangians',
    title: '竞技场黄金收支',
    summary,
    lines: [
      ...base.lines,
      { id: 'sources', label: '适用来源', parts: [words('牧羊、狩猎')] },
      { id: 'plain', label: '不织布还需产生', parts: [words('至少 '), num(gap(STANDARD_START_GOLD, castle.gold), '黄金')] },
      { id: 'loom-first', label: '先织布还需产生', parts: [words('至少 '), num(gap(STANDARD_START_GOLD - loom.gold, castle.gold), '黄金')] },
      { id: 'ratio', label: '精确比例', parts: [words('待确认')], pending: true },
      { id: 'gather', label: '食物采集量', parts: [words('待确认')], pending: true },
      ...stamp(patch),
    ],
    notes: [
      ...base.notes,
      {
        id: 'sources',
        text: '官方介绍写牧羊、捕鱼和狩猎也会产生黄金，没有写百分比。竞技场这里只把牧羊和狩猎算进来。捕鱼不是竞技场的默认资源，浆果、农田和其他食物也不写成这条产金。',
      },
      { id: 'enough', text: '这些黄金要在点城堡前已经到手。不保证地图上的羊和猎物一定够，也不把某一食物采集量写成结论。' },
      sourceNote('数据包里有对应的资源字段，但玩法比例缺少可核的函数体，所以比例和采集量保持待确认。'),
    ],
    links: [...base.links, { id: 'official-varangians', href: OFFICIAL_VARANGIAN_HREF, label: '瓦兰吉官方介绍', external: true }],
  };
}

export function arenaCastleGoldText(card: ArenaCastleGold): string {
  const chunk = (part: Chunk): string => (part.kind === 'text' ? part.text : part.parts.map((item) => item.text).join(''));
  return [card.summary, ...card.lines.flatMap((line) => [line.label, ...line.parts.map(chunk)]), ...card.notes.map((note) => note.text)].join('');
}

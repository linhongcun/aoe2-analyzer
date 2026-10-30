/** Fixed DE188329 source admission for the current templates with no livestock garrison. */
import type { BuildOrder } from './buildOrder';
import type { EcoData, EffectRow } from './buildSim';
import type { JurchenRawTech } from './jurchenEconomy';

export type GurjaraRawTech = JurchenRawTech;
export const GURJARA_SOURCE_REASON = '瞿折罗起始果丛或磨坊驻畜缺少完整已核来源，未计入';
export const GURJARA_ACTION_REASON = '瞿折罗驻畜或新增动作尚未模拟，未支持此方案';
export const GURJARA_OPENING_NOTE = '当前模板未驻畜；驻畜收益、额外果丛及耗尽未模拟';
export const GURJARA_KNIGHT_NOTE = '瞿折罗没有骑士；骑士方案仅供通用模板经济估算';
export const GURJARA_BUSH_NOTE = '资源不耗尽模型未计额外果丛收益，也未将果丛折算为起始库存';
export const GURJARA_GARRISON_NOTE = '当前8套模板未驻畜，未计算驻畜收益';
export const GURJARA_MODEL_NOTE =
  '普通起始为3名村民和1名骆驼斥候，人口4/5，库存不变。沿用本站资源不耗尽与固定距离模型；没有自动驻畜、被动食物或额外果丛库存收益，未模拟家畜实体、逐笔收入或客户端逐帧行为。';
const IDS = [856, 857];
const ACTIONS = new Set(['gather', 'build', 'train', 'research', 'upgrade', 'ageUp', 'lure']);
const MILLS = [68, 129, 130, 131];
const command = (Type: number, A: number, B: number, C: number, D: number) => ({ Type, A, B, C, D });
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, entry]) => [key, canonical(entry)]),
        )
      : value;
const equal = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
function expected(id: number): { raw: GurjaraRawTech; effects: EffectRow['effects'] } | null {
  if (!IDS.includes(id)) return null;
  const garrison = id === 856;
  return {
    raw: {
      tech: id,
      civ: 42,
      effectId: garrison ? 871 : 872,
      requiredCount: garrison ? 0 : 2,
      requires: garrison ? [] : [639, 307],
      researchLocation: -1,
      researchAt: [],
      researchTime: 0,
      cost: [],
      commands: garrison
        ? [...MILLS.map((mill) => command(0, mill, -1, 30, 16)), ...MILLS.map((mill) => command(0, mill, -1, 2, 10)), command(1, 254, 0, -1, 15)]
        : [command(1, 234, 0, -1, 1), command(7, 1549, 619, 2, 0)],
    },
    effects: [{ kind: 'res', res: garrison ? 254 : 234, op: 'set', v: garrison ? 15 : 1 }],
  };
}
const validRow = (row: EffectRow): boolean => {
  const source = expected(row.tech ?? -1);
  return (
    !!source &&
    row.source === 'bonus' &&
    row.age === 1 &&
    Array.isArray(row.effects) &&
    equal(row.requires, source.raw.requires) &&
    equal(row.gurjaraTech, source.raw) &&
    equal(
      row.effects.map((effect) => Object.fromEntries(Object.entries(effect).filter(([key]) => key !== 'label'))),
      source.effects,
    )
  );
};
export const hasGurjaraMarker = (row: EffectRow): boolean => 'gurjaraTech' in row || IDS.includes(row.tech ?? -1);
export function gurjaraContext(eco: EcoData) {
  const rows = eco.civEco.Gurjaras ?? [],
    admitted = new Map<number, EffectRow>();
  for (const id of IDS) {
    const matches = rows.filter((row) => row.tech === id);
    if (matches.length === 1 && validRow(matches[0]!)) admitted.set(id, matches[0]!);
  }
  const complete = admitted.size === IDS.length && rows.every((row) => !('gurjaraTech' in row) || IDS.includes(row.tech ?? -1));
  return { admitted, complete, reasons: complete ? [] : [GURJARA_SOURCE_REASON] };
}
/** Future livestock actions require a new model rather than silently taking this zero-garrison path. */
export const gurjaraOrdersSupported = (orders: readonly BuildOrder[]): boolean =>
  orders.every((order) => order.steps.every((step) => step.actions.every((action) => ACTIONS.has(action.type))));
export function gurjaraRowAllowed(row: EffectRow, civ?: string, context?: ReturnType<typeof gurjaraContext>): boolean {
  return !hasGurjaraMarker(row) || (civ === 'Gurjaras' && context?.admitted.get(row.tech ?? -1) === row);
}
export function gurjaraRowClass(
  row: EffectRow,
  civ?: string,
  context?: ReturnType<typeof gurjaraContext>,
): { kind: 'irrelevant' | 'unhandled'; reason: string } | null {
  if (!hasGurjaraMarker(row)) return null;
  if (!gurjaraRowAllowed(row, civ, context)) return { kind: 'unhandled', reason: GURJARA_SOURCE_REASON };
  return { kind: 'irrelevant', reason: row.tech === 856 ? GURJARA_GARRISON_NOTE : GURJARA_BUSH_NOTE };
}
export const gurjaraNotes = (eco: EcoData, boId?: string): string[] =>
  gurjaraContext(eco).complete ? [GURJARA_OPENING_NOTE, ...(boId === 'fast-castle-knights' ? [GURJARA_KNIGHT_NOTE] : [])] : [];
